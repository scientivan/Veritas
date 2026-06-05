// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/**
 * @title IVeritasOracle
 * @notice Single source of truth for validating off-chain Dilution Risk Score (DRS) attestations.
 *
 * @dev Design decision "Opsi A": the Oracle is the ONLY signature-verification authority in the
 *      protocol. The Registry never verifies signatures itself; it delegates to {verify}. This keeps
 *      the multi-operator quorum, spread, freshness and bounds logic in exactly one auditable place.
 *
 *      Off-chain data is the #1 DeFi attack vector, so the oracle hardens against it with:
 *        - a 2-of-3 (configurable) operator quorum,
 *        - a cross-operator agreement (spread) check,
 *        - a signature-freshness window (anti-replay),
 *        - hard DRS bounds (reject extreme values).
 *
 *      CRITICAL (real independence, not theatre): each authorized operator MUST run a *different*
 *      detector/embedding ensemble off-chain. A 2-of-3 quorum where all operators call the same Hive
 *      API is a single point of failure with three stamps. Independence must live at the data layer.
 */
interface IVeritasOracle {
    /// @notice A single operator's signed opinion of the DRS for an attestation.
    /// @param drs       DRS value this operator attests to, scaled 0..10000.
    /// @param timestamp Unix time the operator signed at (used for the freshness window).
    /// @param signature EIP-712 signature over (attestationId, drs, timestamp).
    struct OperatorSig {
        uint16 drs;
        uint64 timestamp;
        bytes signature;
    }

    event OperatorAdded(address indexed operator);
    event OperatorRemoved(address indexed operator);
    event QuorumUpdated(uint8 quorum);

    /**
     * @notice Verify a batch of operator signatures and return the canonical DRS to be stored.
     * @dev Reverts unless: at least `quorum` distinct authorized operators signed, every signature is
     *      fresh (within the freshness window), the spread between the highest and lowest signed DRS is
     *      within tolerance, and the resulting canonical (averaged) DRS is within bounds.
     * @param attestationId The attestation the signatures are bound to.
     * @param sigs          The operator signatures.
     * @return canonicalDrs The agreed DRS (average of the signed values), guaranteed <= maxDrs().
     */
    function verify(bytes32 attestationId, OperatorSig[] calldata sigs) external view returns (uint16 canonicalDrs);

    /// @notice Convenience boolean form of {verify} that never reverts.
    function isValid(bytes32 attestationId, OperatorSig[] calldata sigs) external view returns (bool);

    function isOperator(address account) external view returns (bool);
    function operatorCount() external view returns (uint8);
    function quorum() external view returns (uint8);
    function maxDrs() external view returns (uint16);
    function maxSpread() external view returns (uint16);
    function signatureMaxAge() external view returns (uint64);
}
