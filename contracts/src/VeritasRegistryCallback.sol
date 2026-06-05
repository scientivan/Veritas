// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {AbstractCallback} from "reactive-lib/abstract-base/AbstractCallback.sol";
import {IVeritasRegistry} from "./interfaces/IVeritasRegistry.sol";

/**
 * @title VeritasRegistryCallback
 * @notice Destination-chain (Unichain) receiver for the DilutionMonitor Reactive Smart Contract.
 *
 * @dev When new content is attested, the RSC reacts and calls {onDilution} here via the Reactive
 *      Network Callback Proxy. This contract finds the on-chain near-duplicates of the new content
 *      and pushes a dilution increment to every affected attestation (and the new one, if it has
 *      any near-duplicates). Trust chain: Callback Proxy -> this contract -> VeritasRegistry
 *      (which only accepts increments from this contract, set as its `dilutionUpdater`).
 *
 *      `authorizedSenderOnly` (from AbstractPayer, seeded with the Callback Proxy in the
 *      AbstractCallback constructor) ensures only the proxy can invoke the callback.
 */
contract VeritasRegistryCallback is AbstractCallback {
    IVeritasRegistry public immutable registry;

    /// @dev Hamming threshold (bits, out of 64) for an on-chain near-duplicate match.
    uint8 public constant HAMMING_TAU = 10;

    event DilutionApplied(bytes32 indexed triggerAttestationId, uint256 affectedCount);

    constructor(address callbackSender, IVeritasRegistry registry_) payable AbstractCallback(callbackSender) {
        registry = registry_;
    }

    /**
     * @notice React to a new attestation by diluting its near-duplicates on-chain.
     * @dev The leading `address` is the RVM id injected by the Reactive system; we only require the
     *      authorized callback proxy as the caller.
     */
    function onDilution(address, /* rvmId */ bytes32 triggerAttestationId) external authorizedSenderOnly {
        IVeritasRegistry.AttestationRecord memory rec = registry.getRecord(triggerAttestationId);
        bytes32[] memory affected =
            registry.getNearDuplicates(rec.pHashFingerprint, rec.blockhashFingerprint, HAMMING_TAU);

        uint256 applied;
        bool hasOthers;
        for (uint256 i = 0; i < affected.length; i++) {
            if (affected[i] == triggerAttestationId) continue;
            if (_tryIncrement(affected[i])) {
                applied++;
                hasOthers = true;
            }
        }
        // The new content is itself diluted only if it has at least one existing near-duplicate.
        if (hasOthers && _tryIncrement(triggerAttestationId)) applied++;

        emit DilutionApplied(triggerAttestationId, applied);
    }

    /// @dev Tolerate a frozen (disputed) record so one bad entry can't block the whole batch.
    function _tryIncrement(bytes32 id) internal returns (bool ok) {
        try registry.incrementDilutionCount(id) {
            ok = true;
        } catch {
            ok = false;
        }
    }
}
