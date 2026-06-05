// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {VeritasTestBase} from "./utils/VeritasTestBase.sol";
import {VeritasHook} from "../src/VeritasHook.sol";
import {IVeritasOracle} from "../src/interfaces/IVeritasOracle.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {CustomRevert} from "@uniswap/v4-core/src/libraries/CustomRevert.sol";
import {LPFeeLibrary} from "@uniswap/v4-core/src/libraries/LPFeeLibrary.sol";

contract VeritasHookTest is VeritasTestBase {
    bytes32 internal constant PHASH = bytes32(uint256(0xC0FFEE));
    bytes32 internal constant BHASH = bytes32(uint256(0xBEEF));

    uint24 internal constant BASE_FEE = 3000; // 0.30%
    uint24 internal constant MAX_FEE = 10000; // 1.00%
    uint16 internal constant GATE = 8500; // 0.85

    // Re-declared for vm.expectEmit.
    event DynamicFeeApplied(PoolId indexed poolId, uint16 drs, uint24 lpFee);

    /// @dev v4 wraps a reverting hook call in CustomRevert.WrappedError; build the expected payload.
    function _expectInitRevert(bytes memory innerReason) internal {
        vm.expectRevert(
            abi.encodeWithSelector(
                CustomRevert.WrappedError.selector,
                address(hook),
                IHooks.beforeInitialize.selector,
                innerReason,
                abi.encodeWithSelector(Hooks.HookCallFailed.selector)
            )
        );
    }

    function setUp() public {
        _setUpVeritas();
        vm.deal(creator, 10 ether);
    }

    // ------------------------------------------------------------------------------------------
    // 1. Pool gating
    // ------------------------------------------------------------------------------------------

    function test_RegisterPool_AllowsLowDRS() public {
        bytes32 id = _attest(creator, PHASH, BHASH, 500);
        PoolKey memory key = _poolKey();
        vm.prank(creator);
        PoolId pid = hook.registerPool(key, id, BASE_FEE, MAX_FEE, GATE);
        VeritasHook.PoolConfig memory cfg = hook.getPoolConfig(pid);
        assertEq(cfg.attestationId, id);
        assertEq(cfg.drsAtCreation, 500);
    }

    function test_RegisterPool_RejectsHighDRS() public {
        bytes32 id = _attest(creator, PHASH, BHASH, 9000); // 0.90 > gate 0.85
        PoolKey memory key = _poolKey();
        vm.prank(creator);
        vm.expectRevert(abi.encodeWithSelector(VeritasHook.PoolGated.selector, uint16(9000), GATE));
        hook.registerPool(key, id, BASE_FEE, MAX_FEE, GATE);
    }

    function test_RegisterPool_RequiresAttestation() public {
        PoolKey memory key = _poolKey();
        vm.prank(creator);
        vm.expectRevert(VeritasHook.NotAttested.selector);
        hook.registerPool(key, keccak256("ghost"), BASE_FEE, MAX_FEE, GATE);
    }

    function test_RegisterPool_RequiresOwner() public {
        bytes32 id = _attest(creator, PHASH, BHASH, 500);
        PoolKey memory key = _poolKey();
        vm.prank(stranger);
        vm.expectRevert(VeritasHook.NotContentOwner.selector);
        hook.registerPool(key, id, BASE_FEE, MAX_FEE, GATE);
    }

    function test_RegisterPool_RejectsDisputed() public {
        bytes32 id = _attest(creator, PHASH, BHASH, 500);
        vm.prank(stranger);
        registry.disputeAttestation(id); // disputeBond == 0 by default
        PoolKey memory key = _poolKey();
        vm.prank(creator);
        vm.expectRevert(VeritasHook.AttestationDisputed.selector);
        hook.registerPool(key, id, BASE_FEE, MAX_FEE, GATE);
    }

    function test_RegisterPool_RejectsNonDynamicFee() public {
        bytes32 id = _attest(creator, PHASH, BHASH, 500);
        PoolKey memory key = _poolKey();
        key.fee = 3000; // static fee, not the dynamic flag
        vm.prank(creator);
        vm.expectRevert(VeritasHook.NotDynamicFee.selector);
        hook.registerPool(key, id, BASE_FEE, MAX_FEE, GATE);
    }

    function test_RegisterPool_RejectsBadGateThreshold() public {
        bytes32 id = _attest(creator, PHASH, BHASH, 500);
        PoolKey memory key = _poolKey();
        vm.prank(creator);
        vm.expectRevert(VeritasHook.InvalidGateThreshold.selector);
        hook.registerPool(key, id, BASE_FEE, MAX_FEE, 9000); // > PROTOCOL_MAX_GATE (8500)
    }

    function test_BeforeInitialize_RejectsUnconfigured() public {
        PoolKey memory key = _poolKey();
        _expectInitRevert(abi.encodeWithSelector(VeritasHook.NotConfigured.selector));
        manager.initialize(key, SQRT_PRICE_1_1);
    }

    function test_BeforeInitialize_ReverifiesGateAtInit() public {
        bytes32 id = _attest(creator, PHASH, BHASH, 1000);
        PoolKey memory key = _poolKey();
        vm.prank(creator);
        hook.registerPool(key, id, BASE_FEE, MAX_FEE, GATE);

        // DRS jumps above the gate AFTER registration but BEFORE initialization.
        vm.warp(block.timestamp + 2 hours);
        IVeritasOracle.OperatorSig[] memory sigs = _twoSigs(id, 9000);
        registry.updateAIScore(id, sigs);

        _expectInitRevert(abi.encodeWithSelector(VeritasHook.PoolGated.selector, uint16(9000), GATE));
        manager.initialize(key, SQRT_PRICE_1_1);
    }

    // ------------------------------------------------------------------------------------------
    // 2. Dynamic fee
    // ------------------------------------------------------------------------------------------

    function test_BeforeSwap_ZeroDRS_ChargesBaseFee() public {
        (PoolKey memory key, PoolId pid) = _setupPool(0);
        assertEq(hook.previewLpFee(pid), BASE_FEE);

        vm.expectEmit(true, false, false, true, address(hook));
        emit DynamicFeeApplied(pid, 0, BASE_FEE);
        swap(key, true, -1e15, ZERO_BYTES);
    }

    function test_BeforeSwap_MidDRS_ChargesProportionalFee() public {
        (PoolKey memory key, PoolId pid) = _setupPool(5000);
        // 3000 + (10000 - 3000) * 5000 / 10000 = 6500
        assertEq(hook.previewLpFee(pid), 6500);

        vm.expectEmit(true, false, false, true, address(hook));
        emit DynamicFeeApplied(pid, 5000, 6500);
        swap(key, true, -1e15, ZERO_BYTES);
    }

    function test_BeforeSwap_FeeNeverExceedsMaxFee() public {
        (, PoolId pid) = _setupPool(GATE); // highest allowed DRS at creation
        uint24 fee = hook.previewLpFee(pid);
        assertLe(fee, MAX_FEE);
        // 3000 + 7000 * 8500 / 10000 = 8950
        assertEq(fee, 8950);
    }

    function test_DRSUpdate_ChangesSwapFee() public {
        (PoolKey memory key, PoolId pid) = _setupPool(1000);
        bytes32 id = hook.getPoolConfig(pid).attestationId;
        assertEq(hook.previewLpFee(pid), BASE_FEE + uint24(uint256(7000) * 1000 / 10000)); // 3700

        // Oracle raises the DRS; the swap fee must follow.
        vm.warp(block.timestamp + 1 hours);
        IVeritasOracle.OperatorSig[] memory sigs = _twoSigs(id, 4000);
        registry.updateAIScore(id, sigs);

        assertEq(hook.previewLpFee(pid), BASE_FEE + uint24(uint256(7000) * 4000 / 10000)); // 5800
        vm.expectEmit(true, false, false, true, address(hook));
        emit DynamicFeeApplied(pid, 4000, 5800);
        swap(key, true, -1e15, ZERO_BYTES);
    }

    // ------------------------------------------------------------------------------------------
    // 3. LP Insurance Reserve
    // ------------------------------------------------------------------------------------------

    function test_Reserve_AccruesOnSwap() public {
        (PoolKey memory key, PoolId pid) = _setupPool(4000);
        assertEq(hook.getReserve(pid, c1), 0);

        swap(key, true, -1e16, ZERO_BYTES); // zeroForOne exact-in => output (and skim) in currency1
        uint256 reserve = hook.getReserve(pid, c1);
        assertGt(reserve, 0);
    }

    function test_Reserve_ZeroDRS_NoAccrual() public {
        (PoolKey memory key, PoolId pid) = _setupPool(0);
        swap(key, true, -1e16, ZERO_BYTES);
        assertEq(hook.getReserve(pid, c1), 0);
    }

    function test_Reserve_DisburseRevertsWhenNotEligible() public {
        (PoolKey memory key,) = _setupPool(4000);
        swap(key, true, -1e16, ZERO_BYTES);
        // DRS has not risen since creation => not a dilution event.
        vm.expectRevert(VeritasHook.NotEligibleForDisbursement.selector);
        hook.disburseReserveToLPs(key);
    }

    function test_Reserve_DisburseToLPsOnDilutionEvent() public {
        (PoolKey memory key, PoolId pid) = _setupPool(2000);
        bytes32 id = hook.getPoolConfig(pid).attestationId;
        // Small swap so the active tick stays within the LP range (donate needs in-range liquidity).
        swap(key, true, -1e15, ZERO_BYTES);
        uint256 reserveBefore = hook.getReserve(pid, c1);
        assertGt(reserveBefore, 0);

        // A verified dilution event: DRS rises well past the disbursement trigger.
        vm.warp(block.timestamp + 1 hours);
        IVeritasOracle.OperatorSig[] memory sigs = _twoSigs(id, 4000); // +2000 >= trigger (1500)
        registry.updateAIScore(id, sigs);

        // Capture LP-claimable balances before/after to prove the buffer reached the pool's LPs.
        hook.disburseReserveToLPs(key);
        assertEq(hook.getReserve(pid, c1), 0); // buffer drained from the hook
    }

    // ------------------------------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------------------------------

    function _setupPool(uint16 drs) internal returns (PoolKey memory key, PoolId pid) {
        bytes32 id = _attest(creator, PHASH, BHASH, drs);
        (key, pid) = _registerInitAndSeed(id, BASE_FEE, MAX_FEE, GATE);
    }
}
