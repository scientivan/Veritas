// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {VeritasTestBase} from "./utils/VeritasTestBase.sol";
import {VeritasRegistry} from "../src/VeritasRegistry.sol";
import {IVeritasRegistry} from "../src/interfaces/IVeritasRegistry.sol";
import {IVeritasOracle} from "../src/interfaces/IVeritasOracle.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract VeritasRegistryTest is VeritasTestBase {
    bytes32 internal constant PHASH = bytes32(uint256(0xAAAA));
    bytes32 internal constant BHASH = bytes32(uint256(0xBBBB));

    address internal disputer;

    function setUp() public {
        _setUpVeritas();
        disputer = makeAddr("disputer");
        vm.deal(disputer, 10 ether);
        vm.deal(creator, 10 ether);
    }

    function test_Attest_StoresRecordAndCanonicalDRS() public {
        bytes32 id = _attestWithDRS(1000, 1400); // canonical 1200
        assertTrue(registry.isAttested(id));
        assertEq(registry.getCurrentDRS(id), 1200);

        IVeritasRegistry.AttestationRecord memory rec = registry.getRecord(id);
        assertEq(rec.pHashFingerprint, PHASH);
        assertEq(rec.blockhashFingerprint, BHASH);
        assertEq(rec.owner, creator);
        assertEq(rec.aiReplicabilityScore, 1200);
        assertFalse(rec.disputed);
        assertEq(registry.fingerprintCount(), 1);
    }

    function test_Attest_RejectsDuplicate() public {
        _attestWithDRS(1000, 1000);
        bytes32 id = registry.computeAttestationId(PHASH, BHASH, creator);
        IVeritasOracle.OperatorSig[] memory sigs = _twoSigs(id, 1000);
        IVeritasOracle.OperatorSig[] memory dSigs = _twoSigs(id, 0);
        vm.prank(creator);
        vm.expectRevert(VeritasRegistry.AlreadyAttested.selector);
        registry.attest(PHASH, BHASH, "ipfs://demo", sigs, dSigs);
    }

    function test_Attest_RequiresFee() public {
        registry.setAttestFee(0.01 ether);
        bytes32 id = registry.computeAttestationId(PHASH, BHASH, creator);
        IVeritasOracle.OperatorSig[] memory sigs = _twoSigs(id, 1000);
        IVeritasOracle.OperatorSig[] memory dSigs = _twoSigs(id, 0);

        vm.prank(creator);
        vm.expectRevert(VeritasRegistry.InsufficientAttestFee.selector);
        registry.attest{value: 0}(PHASH, BHASH, "ipfs://demo", sigs, dSigs);

        vm.prank(creator);
        registry.attest{value: 0.01 ether}(PHASH, BHASH, "ipfs://demo", sigs, dSigs);
        assertEq(registry.treasury(), 0.01 ether);
    }

    function test_UpdateDRS_ChangesDRS() public {
        bytes32 id = _attestWithDRS(1000, 1000);
        vm.warp(block.timestamp + 1 hours);
        IVeritasOracle.OperatorSig[] memory sigs = _twoSigs(id, 1200);
        registry.updateAIScore(id, sigs);
        assertEq(registry.getCurrentDRS(id), 1200);
    }

    function test_UpdateDRS_TimelockPreventsImmediate() public {
        bytes32 id = _attestWithDRS(1000, 1000);
        IVeritasOracle.OperatorSig[] memory sigs = _twoSigs(id, 1100);
        vm.expectRevert(VeritasRegistry.UpdateTimelocked.selector);
        registry.updateAIScore(id, sigs);
    }

    function test_UpdateDRS_LargeDeltaRequiresLongerTimelock() public {
        bytes32 id = _attestWithDRS(1000, 1000);
        uint256 t0 = block.timestamp;

        // After 1h the small-delta timelock would pass, but a 40% jump needs 2h.
        vm.warp(t0 + 1 hours);
        IVeritasOracle.OperatorSig[] memory sigs = _twoSigs(id, 5000);
        vm.expectRevert(VeritasRegistry.UpdateTimelocked.selector);
        registry.updateAIScore(id, sigs);

        vm.warp(t0 + 2 hours);
        sigs = _twoSigs(id, 5000);
        vm.expectEmit(true, false, false, true);
        emit IVeritasRegistry.LargeAIChange(id, 1000, 5000);
        registry.updateAIScore(id, sigs);
        assertEq(registry.getCurrentDRS(id), 5000);
    }

    function test_Dispute_FreezesDRSUpdates() public {
        registry.setDisputeBond(1 ether);
        bytes32 id = _attestWithDRS(1000, 1000);

        vm.prank(disputer);
        registry.disputeAttestation{value: 1 ether}(id);
        assertTrue(registry.getRecord(id).disputed);
        assertEq(registry.disputerOf(id), disputer);

        // DRS updates are frozen while disputed.
        vm.warp(block.timestamp + 1 hours);
        IVeritasOracle.OperatorSig[] memory sigs = _twoSigs(id, 1100);
        vm.expectRevert(VeritasRegistry.Frozen.selector);
        registry.updateAIScore(id, sigs);
    }

    function test_Dispute_RequiresBond() public {
        registry.setDisputeBond(1 ether);
        bytes32 id = _attestWithDRS(1000, 1000);
        vm.prank(disputer);
        vm.expectRevert(VeritasRegistry.InsufficientDisputeBond.selector);
        registry.disputeAttestation{value: 0.5 ether}(id);
    }

    function test_ResolveDispute_UpheldRefundsBond() public {
        registry.setDisputeBond(1 ether);
        bytes32 id = _attestWithDRS(1000, 1000);
        vm.prank(disputer);
        registry.disputeAttestation{value: 1 ether}(id);

        uint256 balBefore = disputer.balance;
        registry.resolveDispute(id, true); // valid dispute => refund
        assertEq(disputer.balance, balBefore + 1 ether);
        assertFalse(registry.getRecord(id).disputed);
        assertEq(registry.treasury(), 0);
    }

    function test_ResolveDispute_RejectedSlashesBond() public {
        registry.setDisputeBond(1 ether);
        bytes32 id = _attestWithDRS(1000, 1000);
        vm.prank(disputer);
        registry.disputeAttestation{value: 1 ether}(id);

        registry.resolveDispute(id, false); // frivolous => slashed to treasury
        assertEq(registry.treasury(), 1 ether);
        assertFalse(registry.getRecord(id).disputed);
    }

    function test_ResolveDispute_OnlyOwner() public {
        registry.setDisputeBond(1 ether);
        bytes32 id = _attestWithDRS(1000, 1000);
        vm.prank(disputer);
        registry.disputeAttestation{value: 1 ether}(id);

        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        registry.resolveDispute(id, true);
    }

    function test_GetCurrentDRS_NoisyOR_NoDuplicates() public {
        bytes32 id = _attestWithDRS(5000, 5000); // A = 5000, dilutionCount = 0
        // DRS = noisyOR(saturateD(0)=0, A=5000) = 5000
        assertEq(registry.getCurrentDRS(id), 5000);
        assertEq(registry.getAIScore(id), 5000);
    }

    function test_SaturateD_PiecewiseValues() public view {
        assertEq(registry.saturateD(0), 0);
        assertEq(registry.saturateD(1), 4000);
        assertEq(registry.saturateD(2), 6000);
        assertEq(registry.saturateD(3), 7500);
        assertEq(registry.saturateD(5), 8500);
        assertEq(registry.saturateD(10), 9000);
        assertEq(registry.saturateD(20), 9500);
        assertEq(registry.saturateD(21), 9800);
    }

    function test_IncrementDilution_RaisesDRS_OnlyUpdater() public {
        bytes32 id = _attestWithDRS(2000, 2000); // A = 2000

        // Not the updater yet.
        vm.expectRevert(VeritasRegistry.NotDilutionUpdater.selector);
        registry.incrementDilutionCount(id);

        registry.setDilutionUpdater(address(this));
        registry.incrementDilutionCount(id); // count -> 1, D = 4000

        // DRS = noisyOR(4000, 2000) = 10000 - (6000*8000/10000) = 5200
        assertEq(registry.getCurrentDRS(id), 5200);
        assertEq(registry.getRecord(id).dilutionCount, 1);
    }

    function test_Withdraw_Treasury() public {
        registry.setAttestFee(0.01 ether);
        bytes32 id = registry.computeAttestationId(PHASH, BHASH, creator);
        IVeritasOracle.OperatorSig[] memory sigs = _twoSigs(id, 1000);
        IVeritasOracle.OperatorSig[] memory dSigs = _twoSigs(id, 0);
        vm.prank(creator);
        registry.attest{value: 0.01 ether}(PHASH, BHASH, "ipfs://demo", sigs, dSigs);

        address payable to = payable(makeAddr("treasuryReceiver"));
        registry.withdrawTreasury(to);
        assertEq(to.balance, 0.01 ether);
        assertEq(registry.treasury(), 0);
    }

    function test_Hamming() public view {
        assertEq(registry.hammingDistance(bytes32(0), bytes32(0)), 0);
        assertEq(registry.hammingDistance(bytes32(uint256(0)), bytes32(uint256(7))), 3);
        assertEq(registry.hammingDistance(bytes32(uint256(1)), bytes32(uint256(2))), 2);
    }

    // --- helper ---

    function _attestWithDRS(uint16 drsA, uint16 drsB) internal returns (bytes32 id) {
        id = registry.computeAttestationId(PHASH, BHASH, creator);
        IVeritasOracle.OperatorSig[] memory sigs = new IVeritasOracle.OperatorSig[](2);
        sigs[0] = _sign(opKeys[0], id, drsA, uint64(block.timestamp));
        sigs[1] = _sign(opKeys[1], id, drsB, uint64(block.timestamp));
        IVeritasOracle.OperatorSig[] memory dSigs = _twoSigs(id, 0);
        uint256 fee = registry.attestFee(); // cache before prank so the prank lands on attest()
        vm.prank(creator);
        registry.attest{value: fee}(PHASH, BHASH, "ipfs://demo", sigs, dSigs);
    }
}
