// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IVeritasOracle} from "./IVeritasOracle.sol";

/**
 * @title IVeritasRegistry
 * @notice On-chain store for content attestations under the HYBRID DRS model.
 *
 * @dev Risk channels:
 *      - A (AI replicability) is computed OFF-CHAIN (detector ensemble) and oracle-signed at
 *        attestation (updatable).
 *      - D (duplicate density) combines TWO sources via max(): an ON-CHAIN, trustless pHash floor
 *        (`saturateD(dilutionCount)`, maintained by the Reactive callback) AND an OFF-CHAIN,
 *        oracle-signed `offchainD` (DINOv2 + web corpus, robust to crop/rotation and to web copies
 *        not in this registry). Taking the MAX hardens both failure modes: a bribed oracle cannot
 *        suppress D below the on-chain floor, and the on-chain pHash's blindness to crop/rotation is
 *        covered by the off-chain signal.
 *
 *      DRS is never stored; it is derived live: DRS = noisyOR(max(saturateD(dilutionCount), offchainD), A).
 *
 *      On-chain near-duplicate search is an O(n) dual-hash (pHash AND blockhash) scan — fine for a
 *      hackathon; bucket by pHash prefix to scale.
 */
interface IVeritasRegistry {
    struct AttestationRecord {
        bytes32 pHashFingerprint; // perceptual hash (DCT pHash)
        bytes32 blockhashFingerprint; // second, independent hash (blockhash/aHash) for dual-algo gating
        uint16 aiReplicabilityScore; // A, scaled 0..10000, oracle-signed at attestation
        uint16 offchainD; // off-chain duplicate density (DINOv2 + web corpus), oracle-signed; floored by on-chain D via max()
        uint32 dilutionCount; // near-duplicates, maintained on-chain by the Reactive callback (the trustless D floor)
        uint64 attestedAt;
        uint64 lastAiUpdate; // last A update (drives the A-update timelock)
        uint64 lastOffchainDUpdate; // last off-chain D update (timelock)
        uint64 lastDilutionUpdate; // last on-chain dilution increment
        address owner;
        string ipfsCid;
        bool disputed; // true while under dispute review (A + D frozen)
    }

    event NewAttestation(bytes32 indexed pHash, bytes32 indexed attestationId);
    event Attested(bytes32 indexed attestationId, address indexed owner, uint16 aiScore, string ipfsCid);
    event AIScoreUpdated(bytes32 indexed attestationId, uint16 oldScore, uint16 newScore);
    event LargeAIChange(bytes32 indexed attestationId, uint16 oldScore, uint16 newScore);
    event OffchainDUpdated(bytes32 indexed attestationId, uint16 oldD, uint16 newD);
    event DilutionIncremented(bytes32 indexed attestationId, uint32 newCount, uint16 newDrs);
    event DilutionUpdaterSet(address indexed updater);
    event DisputeFiled(bytes32 indexed attestationId, address indexed disputer, uint256 bond, uint64 freezeUntil);
    event DisputeResolved(bytes32 indexed attestationId, bool upheld);
    event AttestFeeUpdated(uint256 fee);
    event DisputeBondUpdated(uint256 bond);

    /// @notice Attest content. `aiSigs` carry the AI-replicability score A; `dSigs` carry the off-chain
    ///         duplicate density (DINOv2 + web corpus). Both are oracle-verified independently.
    function attest(
        bytes32 pHash,
        bytes32 blockHash,
        string calldata ipfsCid,
        IVeritasOracle.OperatorSig[] calldata aiSigs,
        IVeritasOracle.OperatorSig[] calldata dSigs
    ) external payable returns (bytes32 attestationId);

    /// @notice Re-score A (oracle-gated, timelocked). On-chain D and off-chain D are not touched here.
    function updateAIScore(bytes32 attestationId, IVeritasOracle.OperatorSig[] calldata sigs) external;

    /// @notice Re-score the off-chain duplicate density (oracle-gated, timelocked).
    function updateOffchainD(bytes32 attestationId, IVeritasOracle.OperatorSig[] calldata sigs) external;

    /// @notice Increment the on-chain duplicate count. Callable only by the Reactive dilution updater.
    function incrementDilutionCount(bytes32 attestationId) external;

    function disputeAttestation(bytes32 attestationId) external payable;
    function resolveDispute(bytes32 attestationId, bool upheld) external;

    function getRecord(bytes32 attestationId) external view returns (AttestationRecord memory);
    function getAIScore(bytes32 attestationId) external view returns (uint16);

    /// @notice Live DRS: noisyOR(max(saturateD(dilutionCount), offchainD), A), scaled 0..10000.
    function getCurrentDRS(bytes32 attestationId) external view returns (uint16);

    /// @notice The effective D channel actually used: max(saturateD(dilutionCount), offchainD), 0..10000.
    function getEffectiveD(bytes32 attestationId) external view returns (uint256);

    function isAttested(bytes32 attestationId) external view returns (bool);

    /// @notice On-chain near-duplicate search (dual-hash AND logic). Returns matching attestation ids.
    function getNearDuplicates(bytes32 pHash, bytes32 blockHash, uint8 hammingThreshold)
        external
        view
        returns (bytes32[] memory);

    /// @notice Piecewise-saturating map from dilution count to D (0..10000).
    function saturateD(uint32 count) external pure returns (uint256);

    function computeAttestationId(bytes32 pHash, bytes32 blockHash, address owner) external pure returns (bytes32);
    function hammingDistance(bytes32 a, bytes32 b) external pure returns (uint256);
}
