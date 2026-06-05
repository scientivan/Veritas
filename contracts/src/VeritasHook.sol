// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {BaseHook} from "uniswap-hooks/base/BaseHook.sol";
import {CurrencySettler} from "uniswap-hooks/utils/CurrencySettler.sol";

import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {BeforeSwapDelta, BeforeSwapDeltaLibrary} from "@uniswap/v4-core/src/types/BeforeSwapDelta.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {LPFeeLibrary} from "@uniswap/v4-core/src/libraries/LPFeeLibrary.sol";
import {SafeCast} from "@uniswap/v4-core/src/libraries/SafeCast.sol";
import {FullMath} from "@uniswap/v4-core/src/libraries/FullMath.sol";

import {IVeritasRegistry} from "./interfaces/IVeritasRegistry.sol";

/**
 * @title VeritasHook
 * @notice Provenance-aware Uniswap v4 hook. Converts a content asset's Dilution Risk Score (DRS) into
 *         (1) a DRS-calibrated dynamic LP fee and (2) a self-funding LP Insurance Reserve.
 *
 * @dev "Content token pools are illiquid not because nobody wants them, but because LPs cannot price
 *      their risk. The dominant downside driver — dilution by copies and AI replicas — is invisible
 *      on-chain. Veritas is the missing risk infrastructure: a Dilution Risk Score that makes content
 *      asset pools investable for the first time. Empirically grounded in peer-reviewed research showing
 *      rarer NFTs yield lower downside risk (Mekacher et al., Nature 2022)."
 *
 *      Why a *fee* is a principled IL hedge: for a 50/50 constant-product pool, expected impermanent
 *      loss grows with the variance of the relative price (E[IL] ~= -sigma^2/8). Treating DRS as a
 *      forward volatility proxy makes `fee = base + (max-base)*DRS` a compensation rate proportional to
 *      expected IL — not an arbitrary number.
 *
 *      Two complementary, DRS-driven layers:
 *        1. Dynamic LP fee (beforeSwap, override flag): higher DRS => higher fee income for LPs.
 *        2. LP Insurance Reserve (afterSwap hook fee, taken as ERC-6909 claims): a slice of every swap
 *           on a risky asset accrues into a per-pool buffer that is later donated back to that pool's
 *           in-range LPs on a verified dilution event — real protection, not just pricing.
 *
 *      Pool-creation auth: because v4's `beforeInitialize` has no `hookData`, configuration is a direct,
 *      authenticated `registerPool` call by the content owner (`msg.sender == owner`). This is the clean
 *      fix to the naive `owner == initialize.sender` check, whose `sender` is typically a router.
 *      `beforeInitialize` then re-verifies the gate at the exact initialization moment.
 */
contract VeritasHook is BaseHook, IUnlockCallback {
    using PoolIdLibrary for PoolKey;
    using CurrencySettler for Currency;
    using SafeCast for uint256;
    using LPFeeLibrary for uint24;

    IVeritasRegistry public immutable registry;

    struct PoolConfig {
        bytes32 attestationId; // links the pool to an attested content asset
        uint24 baseFee; // LP fee floor, hundredths of a bip (3000 = 0.30%)
        uint24 maxFee; // LP fee cap, hundredths of a bip (10000 = 1.00%)
        uint16 drsGateThreshold; // DRS above this rejects pool creation (8500 = 0.85)
        uint16 drsAtCreation; // DRS snapshot at registration (baseline for the disbursement trigger)
    }

    uint256 public constant DRS_SCALE = 10000;
    /// @dev Protocol-wide hard gate: pools whose DRS exceeds this can never be created (0.85).
    uint16 public constant PROTOCOL_MAX_GATE = 8500;
    /// @dev Maximum reserve skim, hundredths of a bip (2500 = 0.25%), scaled by DRS each swap.
    uint24 public constant MAX_RESERVE_FEE = 2500;
    /// @dev Hook-fee denominator (100% = 1e6, hundredths of a bip).
    uint256 internal constant HOOK_FEE_DENOM = 1_000_000;
    /// @dev DRS must rise at least this much above its registration value before the reserve can pay out.
    uint16 public constant DISBURSE_TRIGGER_DELTA = 1500;

    mapping(PoolId => PoolConfig) public poolConfigs;
    /// @dev Per-pool, per-currency accrued insurance reserve (held by this hook as ERC-6909 claims).
    mapping(PoolId => mapping(Currency => uint256)) public poolReserve;

    event PoolRegistered(
        PoolId indexed poolId,
        bytes32 indexed attestationId,
        address indexed owner,
        uint16 drs,
        uint24 baseFee,
        uint24 maxFee
    );
    event PoolInitialized(PoolId indexed poolId, bytes32 indexed attestationId, uint16 drs);
    event DynamicFeeApplied(PoolId indexed poolId, uint16 drs, uint24 lpFee);
    event ReserveAccrued(PoolId indexed poolId, Currency indexed currency, uint256 amount);
    event ReserveDisbursed(PoolId indexed poolId, uint256 amount0, uint256 amount1, uint16 drs);

    error NotDynamicFee();
    error NotAttested();
    error AttestationDisputed();
    error PoolGated(uint16 drs, uint16 threshold);
    error InvalidFeeConfig();
    error InvalidGateThreshold();
    error NotContentOwner();
    error AlreadyRegistered();
    error NotConfigured();
    error NotEligibleForDisbursement();
    error NothingToDisburse();
    error OnlyPoolManager();

    constructor(IPoolManager poolManager_, IVeritasRegistry registry_) BaseHook(poolManager_) {
        registry = registry_;
    }

    // ----------------------------------------------------------------------------------------------
    // Permissions
    // ----------------------------------------------------------------------------------------------

    function getHookPermissions() public pure override returns (Hooks.Permissions memory) {
        return Hooks.Permissions({
            beforeInitialize: true, // gate pool creation (config must exist + pass DRS gate)
            afterInitialize: false,
            beforeAddLiquidity: false,
            afterAddLiquidity: false,
            beforeRemoveLiquidity: false,
            afterRemoveLiquidity: false,
            beforeSwap: true, // DRS-calibrated dynamic LP fee
            afterSwap: true, // accrue insurance reserve
            beforeDonate: false,
            afterDonate: false,
            beforeSwapReturnDelta: false,
            afterSwapReturnDelta: true, // reserve skim is taken from the swap output
            afterAddLiquidityReturnDelta: false,
            afterRemoveLiquidityReturnDelta: false
        });
    }

    // ----------------------------------------------------------------------------------------------
    // Pool registration (authenticated, by content owner) + creation gate
    // ----------------------------------------------------------------------------------------------

    /**
     * @notice Register a Veritas pool. Must be called by the content owner BEFORE PoolManager.initialize.
     * @dev Authenticates the owner directly via `msg.sender` (the clean fix to the router-sender problem),
     *      enforces the dynamic-fee flag, the protocol hard gate, and the creator's own gate threshold.
     */
    function registerPool(
        PoolKey calldata key,
        bytes32 attestationId,
        uint24 baseFee,
        uint24 maxFee,
        uint16 drsGateThreshold
    ) external returns (PoolId poolId) {
        if (!key.fee.isDynamicFee()) revert NotDynamicFee();
        if (baseFee > maxFee || maxFee > LPFeeLibrary.MAX_LP_FEE) revert InvalidFeeConfig();
        if (drsGateThreshold == 0 || drsGateThreshold > PROTOCOL_MAX_GATE) revert InvalidGateThreshold();
        if (!registry.isAttested(attestationId)) revert NotAttested();

        IVeritasRegistry.AttestationRecord memory rec = registry.getRecord(attestationId);
        if (msg.sender != rec.owner) revert NotContentOwner();
        if (rec.disputed) revert AttestationDisputed();

        uint16 drs = registry.getCurrentDRS(attestationId);
        if (drs > drsGateThreshold) revert PoolGated(drs, drsGateThreshold);

        poolId = key.toId();
        if (poolConfigs[poolId].attestationId != bytes32(0)) revert AlreadyRegistered();

        poolConfigs[poolId] = PoolConfig({
            attestationId: attestationId,
            baseFee: baseFee,
            maxFee: maxFee,
            drsGateThreshold: drsGateThreshold,
            drsAtCreation: drs
        });

        emit PoolRegistered(poolId, attestationId, msg.sender, drs, baseFee, maxFee);
    }

    /// @dev Re-verifies the gate at the exact moment of initialization (DRS may have moved since
    ///      registration). A pool with no Veritas config cannot be initialized through this hook.
    function _beforeInitialize(address, /* sender */ PoolKey calldata key, uint160 /* sqrtPriceX96 */ )
        internal
        override
        returns (bytes4)
    {
        if (!key.fee.isDynamicFee()) revert NotDynamicFee();

        PoolId poolId = key.toId();
        PoolConfig memory config = poolConfigs[poolId];
        if (config.attestationId == bytes32(0)) revert NotConfigured();

        IVeritasRegistry.AttestationRecord memory rec = registry.getRecord(config.attestationId);
        if (rec.disputed) revert AttestationDisputed();

        uint16 drs = registry.getCurrentDRS(config.attestationId);
        if (drs > config.drsGateThreshold) revert PoolGated(drs, config.drsGateThreshold);

        emit PoolInitialized(poolId, config.attestationId, drs);
        return this.beforeInitialize.selector;
    }

    // ----------------------------------------------------------------------------------------------
    // Dynamic LP fee (beforeSwap)
    // ----------------------------------------------------------------------------------------------

    function _beforeSwap(address, /* sender */ PoolKey calldata key, SwapParams calldata, bytes calldata)
        internal
        override
        returns (bytes4, BeforeSwapDelta, uint24)
    {
        PoolId poolId = key.toId();
        PoolConfig memory config = poolConfigs[poolId];
        if (config.attestationId == bytes32(0)) {
            return (this.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);
        }

        uint16 drs = registry.getCurrentDRS(config.attestationId);
        uint24 lpFee = _lpFee(config, drs);

        emit DynamicFeeApplied(poolId, drs, lpFee);
        return (this.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, lpFee | LPFeeLibrary.OVERRIDE_FEE_FLAG);
    }

    /// @dev fee = base + (max - base) * DRS / 10000 (monotonic in DRS, capped at maxFee since DRS <= 1e4).
    function _lpFee(PoolConfig memory config, uint16 drs) internal pure returns (uint24) {
        return config.baseFee + uint24((uint256(config.maxFee - config.baseFee) * uint256(drs)) / DRS_SCALE);
    }

    // ----------------------------------------------------------------------------------------------
    // Insurance reserve accrual (afterSwap)
    // ----------------------------------------------------------------------------------------------

    function _afterSwap(
        address, /* sender */
        PoolKey calldata key,
        SwapParams calldata params,
        BalanceDelta delta,
        bytes calldata /* hookData */
    ) internal override returns (bytes4, int128) {
        PoolId poolId = key.toId();
        PoolConfig memory config = poolConfigs[poolId];
        if (config.attestationId == bytes32(0)) return (this.afterSwap.selector, 0);

        // The reserve skim is charged on the *unspecified* (output-side) currency of the swap.
        (Currency unspecified, int128 unspecifiedAmount) = ((params.amountSpecified < 0) == params.zeroForOne)
            ? (key.currency1, delta.amount1())
            : (key.currency0, delta.amount0());

        if (unspecifiedAmount == 0) return (this.afterSwap.selector, 0);
        if (unspecifiedAmount < 0) unspecifiedAmount = -unspecifiedAmount;

        uint24 reserveFee =
            uint24((uint256(MAX_RESERVE_FEE) * uint256(registry.getCurrentDRS(config.attestationId))) / DRS_SCALE);
        if (reserveFee == 0) return (this.afterSwap.selector, 0);

        uint256 feeAmount = FullMath.mulDiv(uint256(uint128(unspecifiedAmount)), reserveFee, HOOK_FEE_DENOM);
        if (feeAmount == 0) return (this.afterSwap.selector, 0);

        // Take the skim from the PoolManager as ERC-6909 claims (gas-efficient; redeemable later).
        unspecified.take(poolManager, address(this), feeAmount, true);
        poolReserve[poolId][unspecified] += feeAmount;

        emit ReserveAccrued(poolId, unspecified, feeAmount);
        return (this.afterSwap.selector, feeAmount.toInt128());
    }

    // ----------------------------------------------------------------------------------------------
    // Insurance reserve disbursement (donate back to LPs on a verified dilution event)
    // ----------------------------------------------------------------------------------------------

    /**
     * @notice Pay a pool's accrued insurance reserve back to its in-range LPs via PoolManager.donate.
     * @dev Permissionless, but only callable once the pool's DRS has materially risen above its value at
     *      registration (a verified dilution event) — exactly when LPs need the buffer. donate distributes
     *      pro-rata to current liquidity with no manual share accounting.
     */
    function disburseReserveToLPs(PoolKey calldata key) external {
        PoolId poolId = key.toId();
        PoolConfig memory config = poolConfigs[poolId];
        if (config.attestationId == bytes32(0)) revert NotConfigured();

        uint16 drs = registry.getCurrentDRS(config.attestationId);
        if (drs < uint256(config.drsAtCreation) + DISBURSE_TRIGGER_DELTA) revert NotEligibleForDisbursement();

        uint256 amount0 = poolReserve[poolId][key.currency0];
        uint256 amount1 = poolReserve[poolId][key.currency1];
        if (amount0 == 0 && amount1 == 0) revert NothingToDisburse();

        poolReserve[poolId][key.currency0] = 0;
        poolReserve[poolId][key.currency1] = 0;

        poolManager.unlock(abi.encode(key, amount0, amount1));

        emit ReserveDisbursed(poolId, amount0, amount1, drs);
    }

    /// @inheritdoc IUnlockCallback
    function unlockCallback(bytes calldata data) external override returns (bytes memory) {
        if (msg.sender != address(poolManager)) revert OnlyPoolManager();
        (PoolKey memory key, uint256 amount0, uint256 amount1) = abi.decode(data, (PoolKey, uint256, uint256));

        // Donate to in-range LPs, then settle the resulting debt by burning our ERC-6909 claims.
        poolManager.donate(key, amount0, amount1, "");
        if (amount0 > 0) key.currency0.settle(poolManager, address(this), amount0, true);
        if (amount1 > 0) key.currency1.settle(poolManager, address(this), amount1, true);

        return "";
    }

    // ----------------------------------------------------------------------------------------------
    // Views
    // ----------------------------------------------------------------------------------------------

    function getPoolConfig(PoolId poolId) external view returns (PoolConfig memory) {
        return poolConfigs[poolId];
    }

    function getReserve(PoolId poolId, Currency currency) external view returns (uint256) {
        return poolReserve[poolId][currency];
    }

    /// @notice Preview the dynamic LP fee that would apply to a swap right now.
    function previewLpFee(PoolId poolId) external view returns (uint24) {
        PoolConfig memory config = poolConfigs[poolId];
        if (config.attestationId == bytes32(0)) return 0;
        return _lpFee(config, registry.getCurrentDRS(config.attestationId));
    }
}
