// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {VeritasTestBase} from "./utils/VeritasTestBase.sol";
import {VeritasOracle} from "../src/VeritasOracle.sol";
import {IVeritasOracle} from "../src/interfaces/IVeritasOracle.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract VeritasOracleTest is VeritasTestBase {
    bytes32 internal constant ATT_ID = keccak256("attestation-1");

    function setUp() public {
        _setUpVeritas();
    }

    function test_Config_Defaults() public view {
        assertEq(oracle.operatorCount(), 3);
        assertEq(oracle.quorum(), 2);
        assertEq(oracle.maxDrs(), 9500);
        assertEq(oracle.maxSpread(), 500);
        assertTrue(oracle.isOperator(ops[0]));
        assertFalse(oracle.isOperator(stranger));
    }

    function test_Verify_ReturnsAverageWithinSpread() public view {
        IVeritasOracle.OperatorSig[] memory sigs = new IVeritasOracle.OperatorSig[](2);
        sigs[0] = _sign(opKeys[0], ATT_ID, 1000, uint64(block.timestamp));
        sigs[1] = _sign(opKeys[1], ATT_ID, 1400, uint64(block.timestamp));
        assertEq(oracle.verify(ATT_ID, sigs), 1200); // (1000 + 1400) / 2
        assertTrue(oracle.isValid(ATT_ID, sigs));
    }

    function test_Verify_RejectsUnauthorizedSigner() public {
        uint256 fakeKey = 0xBADBADBAD;
        IVeritasOracle.OperatorSig[] memory sigs = new IVeritasOracle.OperatorSig[](2);
        sigs[0] = _sign(opKeys[0], ATT_ID, 1000, uint64(block.timestamp));
        sigs[1] = _sign(fakeKey, ATT_ID, 1000, uint64(block.timestamp));
        vm.expectRevert(VeritasOracle.UnknownOperator.selector);
        oracle.verify(ATT_ID, sigs);
        assertFalse(oracle.isValid(ATT_ID, sigs));
    }

    function test_Verify_RejectsDRSOutOfBounds() public {
        IVeritasOracle.OperatorSig[] memory sigs = new IVeritasOracle.OperatorSig[](2);
        sigs[0] = _sign(opKeys[0], ATT_ID, 9600, uint64(block.timestamp));
        sigs[1] = _sign(opKeys[1], ATT_ID, 9600, uint64(block.timestamp));
        vm.expectRevert(VeritasOracle.DrsOutOfBounds.selector);
        oracle.verify(ATT_ID, sigs);
    }

    function test_Verify_RejectsBelowQuorum() public {
        IVeritasOracle.OperatorSig[] memory sigs = new IVeritasOracle.OperatorSig[](1);
        sigs[0] = _sign(opKeys[0], ATT_ID, 1000, uint64(block.timestamp));
        vm.expectRevert(VeritasOracle.NotEnoughSignatures.selector);
        oracle.verify(ATT_ID, sigs);
    }

    function test_Verify_RejectsDuplicateOperator() public {
        IVeritasOracle.OperatorSig[] memory sigs = new IVeritasOracle.OperatorSig[](2);
        sigs[0] = _sign(opKeys[0], ATT_ID, 1000, uint64(block.timestamp));
        sigs[1] = _sign(opKeys[0], ATT_ID, 1000, uint64(block.timestamp));
        vm.expectRevert(VeritasOracle.DuplicateOperator.selector);
        oracle.verify(ATT_ID, sigs);
    }

    function test_Verify_RejectsStaleSignature() public {
        IVeritasOracle.OperatorSig[] memory sigs = _twoSigs(ATT_ID, 1000);
        vm.warp(block.timestamp + 11 minutes); // beyond SIGNATURE_MAX_AGE (10 min)
        vm.expectRevert(VeritasOracle.StaleSignature.selector);
        oracle.verify(ATT_ID, sigs);
    }

    function test_Verify_RejectsFutureSignature() public {
        IVeritasOracle.OperatorSig[] memory sigs = new IVeritasOracle.OperatorSig[](2);
        uint64 future = uint64(block.timestamp + 6 minutes); // beyond CLOCK_SKEW (5 min)
        sigs[0] = _sign(opKeys[0], ATT_ID, 1000, future);
        sigs[1] = _sign(opKeys[1], ATT_ID, 1000, future);
        vm.expectRevert(VeritasOracle.FutureSignature.selector);
        oracle.verify(ATT_ID, sigs);
    }

    function test_Verify_RejectsSpreadTooWide() public {
        IVeritasOracle.OperatorSig[] memory sigs = new IVeritasOracle.OperatorSig[](2);
        sigs[0] = _sign(opKeys[0], ATT_ID, 1000, uint64(block.timestamp));
        sigs[1] = _sign(opKeys[1], ATT_ID, 1600, uint64(block.timestamp)); // spread 600 > 500
        vm.expectRevert(VeritasOracle.SpreadTooWide.selector);
        oracle.verify(ATT_ID, sigs);
    }

    function test_Admin_AddRemoveOperator() public {
        // remove down to 2 operators, quorum stays 2
        oracle.removeOperator(ops[2]);
        assertEq(oracle.operatorCount(), 2);
        assertFalse(oracle.isOperator(ops[2]));

        // adding back works
        oracle.addOperator(ops[2]);
        assertEq(oracle.operatorCount(), 3);
        assertTrue(oracle.isOperator(ops[2]));
    }

    function test_Admin_RemoveLowersQuorumWhenNeeded() public {
        oracle.removeOperator(ops[2]);
        oracle.removeOperator(ops[1]);
        assertEq(oracle.operatorCount(), 1);
        assertEq(oracle.quorum(), 1); // auto-lowered
    }

    function test_Admin_OnlyOwner() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        oracle.addOperator(stranger);
    }

    function test_Admin_SetQuorum_Bounds() public {
        vm.expectRevert(VeritasOracle.InvalidQuorum.selector);
        oracle.setQuorum(4); // > operatorCount
        oracle.setQuorum(3);
        assertEq(oracle.quorum(), 3);
    }

    function test_Constructor_RejectsTooManyOperators() public {
        address[] memory four = new address[](4);
        for (uint256 i = 0; i < 4; i++) {
            four[i] = address(uint160(i + 1));
        }
        vm.expectRevert(VeritasOracle.TooManyOperators.selector);
        new VeritasOracle(four, 2, address(this));
    }
}
