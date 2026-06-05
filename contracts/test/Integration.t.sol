// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {VeritasTestBase} from "./utils/VeritasTestBase.sol";
import {VeritasHook} from "../src/VeritasHook.sol";
import {IVeritasOracle} from "../src/interfaces/IVeritasOracle.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {LPFeeLibrary} from "@uniswap/v4-core/src/libraries/LPFeeLibrary.sol";
import {ModifyLiquidityParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";

/// @dev End-to-end flows across Oracle -> Registry -> Hook, including the demo's three contrasting tiers.
contract IntegrationTest is VeritasTestBase {
    uint24 internal constant BASE_FEE = 3000;
    uint24 internal constant MAX_FEE = 10000;
    uint16 internal constant GATE = 8500;

    function setUp() public {
        _setUpVeritas();
        vm.deal(creator, 10 ether);
    }

    /// @notice Attest -> register -> initialize -> add liquidity -> swap, asserting the full path works.
    function test_FullFlow_AttestCreatePoolSwap() public {
        bytes32 id = _attest(creator, bytes32(uint256(1)), bytes32(uint256(2)), 1500);

        PoolKey memory key = _keyWithTickSpacing(60);
        vm.prank(creator);
        PoolId pid = hook.registerPool(key, id, BASE_FEE, MAX_FEE, GATE);

        manager.initialize(key, SQRT_PRICE_1_1);
        modifyLiquidityRouter.modifyLiquidity(key, LIQUIDITY_PARAMS, ZERO_BYTES);

        // fee = 3000 + 7000 * 1500/10000 = 4050
        assertEq(hook.previewLpFee(pid), 4050);

        swap(key, true, -1e15, ZERO_BYTES);
        assertGt(hook.getReserve(pid, c1), 0); // insurance reserve began funding
    }

    /// @notice A dispute freezes the DRS and blocks new pool creation against that attestation.
    function test_FullFlow_DisputeFreezesDRS() public {
        bytes32 id = _attest(creator, bytes32(uint256(3)), bytes32(uint256(4)), 1000);

        // Anyone can dispute (bond is 0 in this config); it freezes DRS updates...
        vm.prank(stranger);
        registry.disputeAttestation(id);

        vm.warp(block.timestamp + 1 hours);
        IVeritasOracle.OperatorSig[] memory sigs = _twoSigs(id, 1200);
        vm.expectRevert();
        registry.updateAIScore(id, sigs);

        // ...and blocks pool registration until resolved.
        PoolKey memory key = _keyWithTickSpacing(60);
        vm.prank(creator);
        vm.expectRevert(VeritasHook.AttestationDisputed.selector);
        hook.registerPool(key, id, BASE_FEE, MAX_FEE, GATE);

        // After human review resolves it, registration works again.
        registry.resolveDispute(id, false);
        vm.prank(creator);
        hook.registerPool(key, id, BASE_FEE, MAX_FEE, GATE);
    }

    /// @notice The demo's three contrasting tiers in one flow.
    ///         A: unique content (low DRS)  -> pool opens, low fee.
    ///         B: common content (mid DRS)  -> pool opens, higher fee.
    ///         C: AI-replicated (high DRS)  -> pool creation GATED (reverts).
    function test_Demo_ThreeContentTiers() public {
        // --- Tier A: unique illustration, DRS ~0.05 ---
        bytes32 idA = _attest(creator, bytes32(uint256(0xA1)), bytes32(uint256(0xA2)), 500);
        PoolKey memory keyA = _keyWithTickSpacing(60);
        vm.prank(creator);
        PoolId pidA = hook.registerPool(keyA, idA, BASE_FEE, MAX_FEE, GATE);
        manager.initialize(keyA, SQRT_PRICE_1_1);
        assertEq(hook.previewLpFee(pidA), 3350); // 0.335%

        // --- Tier B: common stock-photo style, DRS ~0.60 ---
        bytes32 idB = _attest(creator, bytes32(uint256(0xB1)), bytes32(uint256(0xB2)), 6000);
        PoolKey memory keyB = _keyWithTickSpacing(30);
        vm.prank(creator);
        PoolId pidB = hook.registerPool(keyB, idB, BASE_FEE, MAX_FEE, GATE);
        manager.initialize(keyB, SQRT_PRICE_1_1);
        assertEq(hook.previewLpFee(pidB), 7200); // 0.72% — riskier content, higher LP compensation

        // B's fee must exceed A's (the whole point: risk is priced).
        assertGt(hook.previewLpFee(pidB), hook.previewLpFee(pidA));

        // --- Tier C: AI-generated + heavily duplicated, DRS ~0.94 -> GATED ---
        bytes32 idC = _attest(creator, bytes32(uint256(0xC1)), bytes32(uint256(0xC2)), 9400);
        PoolKey memory keyC = _keyWithTickSpacing(10);
        vm.prank(creator);
        vm.expectRevert(abi.encodeWithSelector(VeritasHook.PoolGated.selector, uint16(9400), GATE));
        hook.registerPool(keyC, idC, BASE_FEE, MAX_FEE, GATE);
    }

    function _keyWithTickSpacing(int24 tickSpacing) internal view returns (PoolKey memory) {
        return PoolKey({
            currency0: c0,
            currency1: c1,
            fee: LPFeeLibrary.DYNAMIC_FEE_FLAG,
            tickSpacing: tickSpacing,
            hooks: IHooks(address(hook))
        });
    }
}
