// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {VeritasTestBase} from "./utils/VeritasTestBase.sol";
import {VeritasRegistry} from "../src/VeritasRegistry.sol";
import {VeritasRegistryCallback} from "../src/VeritasRegistryCallback.sol";
import {DilutionMonitorRSC} from "../src/reactive/DilutionMonitorRSC.sol";
import {IVeritasOracle} from "../src/interfaces/IVeritasOracle.sol";
import {IReactive} from "reactive-lib/interfaces/IReactive.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";

/// @dev The hybrid model: A is oracle-signed; D is maintained on-chain via the Reactive callback flow.
contract ReactiveIntegrationTest is VeritasTestBase {
    // Two near-duplicate fingerprints (Hamming distance 1 on both algorithms) + one distant one.
    bytes32 internal constant PA = bytes32(uint256(0xFF00));
    bytes32 internal constant BA = bytes32(uint256(0xAA00));
    bytes32 internal constant PB = bytes32(uint256(0xFF01)); // 1 bit from PA
    bytes32 internal constant BB = bytes32(uint256(0xAA02)); // 1 bit from BA
    bytes32 internal constant PC = bytes32(uint256(0x00FF00FF)); // far from both
    bytes32 internal constant BC = bytes32(uint256(0x12345678));

    VeritasRegistryCallback internal callback;
    address internal proxy; // mock Reactive Callback Proxy

    // Re-declared for expectEmit.
    event Callback(uint256 indexed chain_id, address indexed _contract, uint64 indexed gas_limit, bytes payload);

    function setUp() public {
        _setUpVeritas();
        vm.deal(creator, 10 ether);
        proxy = makeAddr("callbackProxy");
        callback = new VeritasRegistryCallback(proxy, registry);
        registry.setDilutionUpdater(address(callback));
    }

    // ---------------------------------------------------------------- pure model

    function test_GetCurrentDRS_NoisyOR_Combination() public {
        bytes32 id = _attest(creator, PA, BA, 2000); // A = 2000, count 0 -> DRS 2000
        assertEq(registry.getCurrentDRS(id), 2000);

        registry.setDilutionUpdater(address(this));
        registry.incrementDilutionCount(id); // count 1 -> D 4000
        // noisyOR(4000, 2000) = 5200
        assertEq(registry.getCurrentDRS(id), 5200);
    }

    function test_EffectiveD_MaxOfOnchainAndOffchain() public {
        // Off-chain D is high while on-chain count is 0 (crop/rotation or web copy the registry can't see):
        // the off-chain signal carries D, so a bribed-low on-chain path can't hide it.
        bytes32 id = _attestAD(creator, PA, BA, 1000, 6000);
        assertEq(registry.getEffectiveD(id), 6000);
        assertEq(registry.getCurrentDRS(id), 6400); // noisyOR(6000, 1000)

        // On-chain dilution then overtakes the off-chain value (count 5 -> D 8500): the trustless floor
        // carries D, so a bribed-low OFF-chain oracle can't hide on-chain duplication either.
        registry.setDilutionUpdater(address(this));
        for (uint256 i = 0; i < 5; i++) {
            registry.incrementDilutionCount(id);
        }
        assertEq(registry.getEffectiveD(id), 8500);
        assertEq(registry.getCurrentDRS(id), 8650); // noisyOR(8500, 1000)
    }

    function test_UpdateOffchainD_Timelocked() public {
        bytes32 id = _attestAD(creator, PA, BA, 1000, 2000);
        assertEq(registry.getCurrentDRS(id), 2800); // noisyOR(2000, 1000)

        IVeritasOracle.OperatorSig[] memory sigs = _twoSigs(id, 5000);
        vm.expectRevert(VeritasRegistry.UpdateTimelocked.selector);
        registry.updateOffchainD(id, sigs);

        vm.warp(block.timestamp + 1 hours);
        sigs = _twoSigs(id, 5000);
        registry.updateOffchainD(id, sigs);
        assertEq(registry.getEffectiveD(id), 5000);
        assertEq(registry.getCurrentDRS(id), 5500); // noisyOR(5000, 1000)
    }

    function test_GetNearDuplicates_DualHashMatch() public {
        bytes32 idA = _attest(creator, PA, BA, 1000);
        bytes32 idB = _attest(creator, PB, BB, 1000);
        _attest(creator, PC, BC, 1000); // distant, must NOT match

        bytes32[] memory hits = registry.getNearDuplicates(PB, BB, 10);
        assertEq(hits.length, 2); // A and B
        // both ids present
        bool sawA;
        bool sawB;
        for (uint256 i = 0; i < hits.length; i++) {
            if (hits[i] == idA) sawA = true;
            if (hits[i] == idB) sawB = true;
        }
        assertTrue(sawA && sawB);
    }

    function test_GetNearDuplicates_RequiresBothHashes() public {
        _attest(creator, PA, BA, 1000);
        // Query with a matching pHash but a far blockhash -> dual-hash AND logic rejects it.
        bytes32[] memory hits = registry.getNearDuplicates(PA, BC, 10);
        assertEq(hits.length, 0);
    }

    // ---------------------------------------------------------------- callback flow

    function test_Callback_OnlyAuthorizedProxy() public {
        bytes32 idB = _attest(creator, PB, BB, 1000);
        vm.prank(stranger);
        vm.expectRevert(bytes("Authorized sender only"));
        callback.onDilution(address(0), idB);
    }

    function test_Callback_DilutesNearDuplicatesOnChain() public {
        bytes32 idA = _attest(creator, PA, BA, 2000);
        bytes32 idB = _attest(creator, PB, BB, 2000);

        // Before: no dilution.
        assertEq(registry.getRecord(idA).dilutionCount, 0);
        assertEq(registry.getCurrentDRS(idA), 2000);

        // Simulate the Reactive callback: proxy invokes onDilution for the newly attested B.
        vm.prank(proxy);
        callback.onDilution(address(0), idB);

        // Both A and B are now diluted (count 1 each); A's live DRS rose 2000 -> 5200.
        assertEq(registry.getRecord(idA).dilutionCount, 1);
        assertEq(registry.getRecord(idB).dilutionCount, 1);
        assertEq(registry.getCurrentDRS(idA), 5200);
    }

    function test_Callback_SkipsFrozenRecord() public {
        bytes32 idA = _attest(creator, PA, BA, 2000);
        bytes32 idB = _attest(creator, PB, BB, 2000);

        // A is under dispute -> frozen; the callback must skip it without reverting the batch.
        vm.prank(stranger);
        registry.disputeAttestation(idA); // disputeBond == 0 by default

        vm.prank(proxy);
        callback.onDilution(address(0), idB);

        // A stayed frozen at count 0; B was not diluted either (its only near-duplicate was skipped).
        assertEq(registry.getRecord(idA).dilutionCount, 0);
        assertEq(registry.getRecord(idB).dilutionCount, 0);
    }

    // ---------------------------------------------------------------- RSC unit (react emits Callback)

    function test_RSC_React_EmitsCallback() public {
        DilutionMonitorRSC rsc = new DilutionMonitorRSC(1301, address(registry), 1301, address(callback));

        bytes32 idB = _attest(creator, PB, BB, 1000);
        IReactive.LogRecord memory log = IReactive.LogRecord({
            chain_id: 1301,
            _contract: address(registry),
            topic_0: uint256(keccak256("NewAttestation(bytes32,bytes32)")),
            topic_1: uint256(PB),
            topic_2: uint256(idB),
            topic_3: 0,
            data: "",
            block_number: 1,
            op_code: 0,
            block_hash: 0,
            tx_hash: 0,
            log_index: 0
        });

        bytes memory expectedPayload = abi.encodeWithSignature("onDilution(address,bytes32)", address(0), idB);

        vm.expectEmit(true, true, true, true, address(rsc));
        emit Callback(1301, address(callback), 600_000, expectedPayload);
        rsc.react(log);
    }

    // ---------------------------------------------------------------- end-to-end: hook fee rises with on-chain dilution

    function test_OnChainDilution_RaisesHookFee() public {
        bytes32 idA = _attest(creator, PA, BA, 1000);
        (, PoolId pid) = _registerInitAndSeed(idA, 3000, 10000, 8500);

        // fee = 3000 + 7000 * 0.10 = 3700
        assertEq(hook.previewLpFee(pid), 3700);

        // On-chain dilution pushes the count to 3 (D = 7500); DRS = noisyOR(7500, 1000) = 7750.
        registry.setDilutionUpdater(address(this));
        registry.incrementDilutionCount(idA);
        registry.incrementDilutionCount(idA);
        registry.incrementDilutionCount(idA);
        assertEq(registry.getCurrentDRS(idA), 7750);

        // fee = 3000 + 7000 * 0.775 = 8425 — the pool re-priced itself with no oracle update.
        assertEq(hook.previewLpFee(pid), 8425);
    }
}
