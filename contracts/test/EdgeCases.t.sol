// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {VeritasTestBase} from "./utils/VeritasTestBase.sol";
import {VeritasOracle} from "../src/VeritasOracle.sol";
import {VeritasRegistry} from "../src/VeritasRegistry.sol";
import {VeritasHook} from "../src/VeritasHook.sol";
import {IVeritasOracle} from "../src/interfaces/IVeritasOracle.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {LPFeeLibrary} from "@uniswap/v4-core/src/libraries/LPFeeLibrary.sol";

/// @dev Targeted revert/guard branches to harden coverage across all three contracts.
contract EdgeCasesTest is VeritasTestBase {
    uint24 internal constant BASE_FEE = 3000;
    uint24 internal constant MAX_FEE = 10000;
    uint16 internal constant GATE = 8500;

    IVeritasOracle.OperatorSig[] internal empty;

    function setUp() public {
        _setUpVeritas();
        vm.deal(creator, 10 ether);
    }

    function _key(int24 ts) internal view returns (PoolKey memory) {
        return PoolKey(c0, c1, LPFeeLibrary.DYNAMIC_FEE_FLAG, ts, IHooks(address(hook)));
    }

    // ---------------------------------------------------------------- Oracle

    function test_Oracle_Constructor_RejectsZeroOperators() public {
        address[] memory none = new address[](0);
        vm.expectRevert(VeritasOracle.TooManyOperators.selector);
        new VeritasOracle(none, 1, address(this));
    }

    function test_Oracle_Constructor_RejectsBadQuorum() public {
        address[] memory one = new address[](1);
        one[0] = address(0xABCD);
        vm.expectRevert(VeritasOracle.InvalidQuorum.selector);
        new VeritasOracle(one, 2, address(this)); // quorum > count
    }

    function test_Oracle_Constructor_RejectsDuplicateInList() public {
        address[] memory dup = new address[](2);
        dup[0] = address(0xABCD);
        dup[1] = address(0xABCD);
        vm.expectRevert(VeritasOracle.AlreadyOperator.selector);
        new VeritasOracle(dup, 1, address(this));
    }

    function test_Oracle_AddOperator_RejectsWhenFull() public {
        vm.expectRevert(VeritasOracle.TooManyOperators.selector);
        oracle.addOperator(address(0xBEEF)); // already 3
    }

    function test_Oracle_AddOperator_RejectsExisting() public {
        oracle.removeOperator(ops[2]);
        vm.expectRevert(VeritasOracle.AlreadyOperator.selector);
        oracle.addOperator(ops[0]);
    }

    function test_Oracle_RemoveOperator_RejectsUnknown() public {
        vm.expectRevert(VeritasOracle.UnknownOperator.selector);
        oracle.removeOperator(stranger);
    }

    function test_Oracle_isValid_FalseOnLowQuorum() public view {
        IVeritasOracle.OperatorSig[] memory one = new IVeritasOracle.OperatorSig[](1);
        one[0] = _sign(opKeys[0], keccak256("x"), 1000, uint64(block.timestamp));
        assertFalse(oracle.isValid(keccak256("x"), one));
    }

    // ---------------------------------------------------------------- Registry

    function test_Registry_UpdateDRS_RejectsUnattested() public {
        vm.expectRevert(VeritasRegistry.NotAttested.selector);
        registry.updateAIScore(keccak256("ghost"), empty);
    }

    function test_Registry_Dispute_RejectsUnattested() public {
        vm.expectRevert(VeritasRegistry.NotAttested.selector);
        registry.disputeAttestation(keccak256("ghost"));
    }

    function test_Registry_Dispute_RejectsAlreadyDisputed() public {
        bytes32 id = _attest(creator, bytes32(uint256(1)), bytes32(uint256(2)), 1000);
        registry.disputeAttestation(id);
        vm.expectRevert(VeritasRegistry.AlreadyDisputed.selector);
        registry.disputeAttestation(id);
    }

    function test_Registry_ResolveDispute_RejectsNotDisputed() public {
        bytes32 id = _attest(creator, bytes32(uint256(1)), bytes32(uint256(2)), 1000);
        vm.expectRevert(VeritasRegistry.NotDisputed.selector);
        registry.resolveDispute(id, true);
    }

    function test_Registry_ResolveDispute_RejectsUnattested() public {
        vm.expectRevert(VeritasRegistry.NotAttested.selector);
        registry.resolveDispute(keccak256("ghost"), true);
    }

    function test_Registry_Withdraw_RejectsWhenEmpty() public {
        vm.expectRevert(VeritasRegistry.NothingToWithdraw.selector);
        registry.withdrawTreasury(address(this));
    }

    function test_Registry_EffectiveDRS_UnattestedReturnsZero() public view {
        assertEq(registry.getCurrentDRS(keccak256("ghost")), 0);
    }

    function test_Registry_SettersEmitAndUpdate() public {
        registry.setAttestFee(123);
        registry.setDisputeBond(456);
        assertEq(registry.attestFee(), 123);
        assertEq(registry.disputeBond(), 456);
    }

    // ---------------------------------------------------------------- Hook

    function test_Hook_RegisterPool_RejectsInvalidFeeConfig() public {
        bytes32 id = _attest(creator, bytes32(uint256(1)), bytes32(uint256(2)), 500);
        vm.prank(creator);
        vm.expectRevert(VeritasHook.InvalidFeeConfig.selector);
        hook.registerPool(_key(60), id, 20000, 10000, GATE); // baseFee > maxFee
    }

    function test_Hook_RegisterPool_RejectsDoubleRegister() public {
        bytes32 id = _attest(creator, bytes32(uint256(1)), bytes32(uint256(2)), 500);
        PoolKey memory key = _key(60);
        vm.prank(creator);
        hook.registerPool(key, id, BASE_FEE, MAX_FEE, GATE);
        vm.prank(creator);
        vm.expectRevert(VeritasHook.AlreadyRegistered.selector);
        hook.registerPool(key, id, BASE_FEE, MAX_FEE, GATE);
    }

    function test_Hook_Disburse_RejectsNotConfigured() public {
        vm.expectRevert(VeritasHook.NotConfigured.selector);
        hook.disburseReserveToLPs(_key(60));
    }

    function test_Hook_Disburse_RejectsNothingToDisburse() public {
        bytes32 id = _attest(creator, bytes32(uint256(1)), bytes32(uint256(2)), 1000);
        PoolKey memory key = _key(60);
        vm.prank(creator);
        hook.registerPool(key, id, BASE_FEE, MAX_FEE, GATE);

        // Make it eligible (DRS rises) but there is no accrued reserve (no swaps happened).
        vm.warp(block.timestamp + 1 hours);
        IVeritasOracle.OperatorSig[] memory sigs = _twoSigs(id, 3000);
        registry.updateAIScore(id, sigs);

        vm.expectRevert(VeritasHook.NothingToDisburse.selector);
        hook.disburseReserveToLPs(key);
    }

    function test_Hook_UnlockCallback_OnlyPoolManager() public {
        vm.expectRevert(VeritasHook.OnlyPoolManager.selector);
        hook.unlockCallback("");
    }

    function test_Hook_Views_UnconfiguredPool() public view {
        PoolId pid = _key(60).toId();
        assertEq(hook.previewLpFee(pid), 0);
        assertEq(hook.getReserve(pid, c0), 0);
        assertEq(hook.getPoolConfig(pid).attestationId, bytes32(0));
    }
}
