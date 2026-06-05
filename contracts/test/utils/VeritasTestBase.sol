// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Deployers} from "@uniswap/v4-core/test/utils/Deployers.sol";
import {HookMiner} from "@uniswap/v4-periphery/src/utils/HookMiner.sol";

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {LPFeeLibrary} from "@uniswap/v4-core/src/libraries/LPFeeLibrary.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";

import {VeritasOracle} from "../../src/VeritasOracle.sol";
import {VeritasRegistry} from "../../src/VeritasRegistry.sol";
import {VeritasHook} from "../../src/VeritasHook.sol";
import {IVeritasOracle} from "../../src/interfaces/IVeritasOracle.sol";

/// @dev Shared scaffolding: PoolManager + routers, currencies, a 2-of-3 oracle with known signer keys,
///      the registry, and a permission-mined VeritasHook. Provides signing/attestation/pool helpers.
abstract contract VeritasTestBase is Deployers {
    VeritasOracle internal oracle;
    VeritasRegistry internal registry;
    VeritasHook internal hook;

    Currency internal c0;
    Currency internal c1;

    // 2-of-3 operators with their (independent, per the design) signing keys.
    address[3] internal ops;
    uint256[3] internal opKeys;

    address internal creator; // content owner
    uint256 internal creatorKey;
    address internal stranger; // a non-owner

    uint160 internal constant HOOK_FLAGS = uint160(
        Hooks.BEFORE_INITIALIZE_FLAG | Hooks.BEFORE_SWAP_FLAG | Hooks.AFTER_SWAP_FLAG
            | Hooks.AFTER_SWAP_RETURNS_DELTA_FLAG
    );

    function _setUpVeritas() internal {
        vm.warp(1_700_000_000); // realistic base timestamp (avoids timelock/staleness underflow)
        deployFreshManagerAndRouters();
        (c0, c1) = deployMintAndApprove2Currencies();

        (ops[0], opKeys[0]) = makeAddrAndKey("operator-0");
        (ops[1], opKeys[1]) = makeAddrAndKey("operator-1");
        (ops[2], opKeys[2]) = makeAddrAndKey("operator-2");

        address[] memory opsArr = new address[](3);
        opsArr[0] = ops[0];
        opsArr[1] = ops[1];
        opsArr[2] = ops[2];

        oracle = new VeritasOracle(opsArr, 2, address(this));
        registry = new VeritasRegistry(oracle, 0, 0, address(this));

        bytes memory ctorArgs = abi.encode(IPoolManager(address(manager)), registry);
        (address hookAddr, bytes32 salt) =
            HookMiner.find(address(this), HOOK_FLAGS, type(VeritasHook).creationCode, ctorArgs);
        hook = new VeritasHook{salt: salt}(IPoolManager(address(manager)), registry);
        require(address(hook) == hookAddr, "hook address mismatch");

        (creator, creatorKey) = makeAddrAndKey("creator");
        stranger = makeAddr("stranger");
    }

    // ------------------------------------------------------------------------------------------
    // Signing helpers (EIP-712 over the oracle domain)
    // ------------------------------------------------------------------------------------------

    function _sign(uint256 pk, bytes32 attestationId, uint16 drs, uint64 ts)
        internal
        view
        returns (IVeritasOracle.OperatorSig memory)
    {
        bytes32 structHash = keccak256(abi.encode(oracle.DRS_ATTESTATION_TYPEHASH(), attestationId, drs, uint256(ts)));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", oracle.domainSeparator(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return IVeritasOracle.OperatorSig({drs: drs, timestamp: ts, signature: abi.encodePacked(r, s, v)});
    }

    /// @dev Two valid signatures (operators 0 and 1) for the current block timestamp.
    function _twoSigs(bytes32 attestationId, uint16 drs)
        internal
        view
        returns (IVeritasOracle.OperatorSig[] memory sigs)
    {
        sigs = new IVeritasOracle.OperatorSig[](2);
        sigs[0] = _sign(opKeys[0], attestationId, drs, uint64(block.timestamp));
        sigs[1] = _sign(opKeys[1], attestationId, drs, uint64(block.timestamp));
    }

    // ------------------------------------------------------------------------------------------
    // Attestation + pool helpers
    // ------------------------------------------------------------------------------------------

    /// @dev Attest with AI score = `drs` and off-chain D = 0 (so DRS == A when there are no duplicates).
    function _attest(address owner, bytes32 pHash, bytes32 blockHash, uint16 drs) internal returns (bytes32 id) {
        return _attestAD(owner, pHash, blockHash, drs, 0);
    }

    /// @dev Attest with explicit AI score and off-chain duplicate density.
    function _attestAD(address owner, bytes32 pHash, bytes32 blockHash, uint16 aiScore, uint16 offchainD)
        internal
        returns (bytes32 id)
    {
        id = registry.computeAttestationId(pHash, blockHash, owner);
        IVeritasOracle.OperatorSig[] memory aiSigs = _twoSigs(id, aiScore);
        IVeritasOracle.OperatorSig[] memory dSigs = _twoSigs(id, offchainD);
        uint256 fee = registry.attestFee(); // cache before prank so the prank lands on attest()
        vm.prank(owner);
        registry.attest{value: fee}(pHash, blockHash, "ipfs://demo", aiSigs, dSigs);
    }

    function _poolKey() internal view returns (PoolKey memory) {
        return PoolKey({
            currency0: c0,
            currency1: c1,
            fee: LPFeeLibrary.DYNAMIC_FEE_FLAG,
            tickSpacing: 60,
            hooks: IHooks(address(hook))
        });
    }

    /// @dev Register (as the content owner) then initialize and seed liquidity. Returns the key.
    function _registerInitAndSeed(bytes32 attestationId, uint24 baseFee, uint24 maxFee, uint16 gate)
        internal
        returns (PoolKey memory key, PoolId id)
    {
        key = _poolKey();
        id = key.toId();
        vm.prank(creator);
        hook.registerPool(key, attestationId, baseFee, maxFee, gate);
        manager.initialize(key, SQRT_PRICE_1_1);
        modifyLiquidityRouter.modifyLiquidity(key, LIQUIDITY_PARAMS, ZERO_BYTES);
    }
}
