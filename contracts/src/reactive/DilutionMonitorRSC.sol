// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {AbstractReactive} from "reactive-lib/abstract-base/AbstractReactive.sol";

/**
 * @title DilutionMonitorRSC
 * @notice Reactive Smart Contract (deployed on Reactive Network) that keeps the Veritas duplicate
 *         channel (D) alive autonomously.
 *
 * @dev It subscribes to {VeritasRegistry-NewAttestation} on the origin chain. On each new attestation
 *      the Reactive Network calls {react}, which emits a {Callback} instructing the Reactive Callback
 *      Proxy on the destination chain to invoke {VeritasRegistryCallback-onDilution}. That callback
 *      does the on-chain near-duplicate search and pushes the dilution increments. No bot, no keeper.
 *
 *      The near-duplicate scan is intentionally NOT done here: `react` runs in the constrained ReactVM
 *      and cannot cheaply read destination state, so it forwards only the attestation id and lets the
 *      destination callback read both fingerprints from the registry and do the comparison.
 */
contract DilutionMonitorRSC is AbstractReactive {
    /// @dev keccak256("NewAttestation(bytes32,bytes32)")
    uint256 private constant NEW_ATTESTATION_TOPIC_0 = uint256(keccak256("NewAttestation(bytes32,bytes32)"));

    uint64 private constant CALLBACK_GAS_LIMIT = 600_000;

    uint256 public immutable originChainId;
    address public immutable originRegistry;
    uint256 public immutable destinationChainId;
    address public immutable callbackReceiver;

    constructor(uint256 originChainId_, address originRegistry_, uint256 destinationChainId_, address callbackReceiver_)
        payable
    {
        originChainId = originChainId_;
        originRegistry = originRegistry_;
        destinationChainId = destinationChainId_;
        callbackReceiver = callbackReceiver_;

        // On the Reactive Network instance (not the ReactVM copy), register the event subscription.
        if (!vm) {
            service.subscribe(
                originChainId_,
                originRegistry_,
                NEW_ATTESTATION_TOPIC_0,
                REACTIVE_IGNORE,
                REACTIVE_IGNORE,
                REACTIVE_IGNORE
            );
        }
    }

    /// @notice Reactive entry point: forwards each new attestation to the destination callback.
    function react(LogRecord calldata log) external override vmOnly {
        // NewAttestation(bytes32 indexed pHash, bytes32 indexed attestationId): topic_2 is the id.
        bytes32 attestationId = bytes32(log.topic_2);

        // The destination callback's leading `address` is replaced with the RVM id by the system.
        bytes memory payload = abi.encodeWithSignature("onDilution(address,bytes32)", address(0), attestationId);

        emit Callback(destinationChainId, callbackReceiver, CALLBACK_GAS_LIMIT, payload);
    }
}
