// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IVeritasRegistry} from "./interfaces/IVeritasRegistry.sol";

/**
 * @title IPLaunchRegistry
 * @notice DRS-gated IP token registry. An ERC-20 IP token can only be registered
 *         (and thus allowed to open a bonding-curve launchpad pool) if the creator
 *         first attests their content in VeritasRegistry and the resulting
 *         Dilution Risk Score is BELOW the gate threshold — proving the content
 *         is sufficiently original, not a copy or AI-replicated derivative.
 *
 * @dev Integration bridge between v2 (DRS attestation) and v1 (IP tokenization).
 *      The trust flow is: Oracle signs DRS -> VeritasRegistry stores it ->
 *      IPLaunchRegistry reads it -> IP token gets isVerified = true ->
 *      Bonding curve launchpad pool can be initialized.
 *
 *      DRS semantics: higher score = more diluted / less original.
 *      DRS_GATE = 8500 (85%). Content below the gate is original enough to tokenize.
 *      Content at or above the gate is too widely copied or AI-replicable.
 */
contract IPLaunchRegistry {
    // ── Constants ─────────────────────────────────────────────────────────────

    /// @notice DRS must be strictly below this value to register (85% in 0..10000 scale).
    uint16 public constant DRS_GATE = 8500;

    // ── State ──────────────────────────────────────────────────────────────────

    /// @notice The v2 VeritasRegistry used as the DRS source of truth.
    IVeritasRegistry public immutable drsRegistry;

    struct IPRecord {
        /// @notice Wallet that receives perpetual royalties from pool swaps.
        address royaltyReceiver;
        /// @notice IPFS CID pointing to IP metadata (title, docs, perks).
        string tokenURI;
        /// @notice The v2 attestation that passed the DRS gate for this token.
        bytes32 attestationId;
        /// @notice DRS captured at registration time (informational snapshot).
        uint16 drsAtRegistration;
        /// @notice True once a valid DRS-gated registration has been accepted.
        bool isVerified;
    }

    /// @notice token address => IP record.
    mapping(address => IPRecord) public registry;

    // ── Events ─────────────────────────────────────────────────────────────────

    event IPRegistered(
        address indexed token,
        address indexed royaltyReceiver,
        bytes32 indexed attestationId,
        uint16 drsAtRegistration,
        string tokenURI
    );

    // ── Errors ─────────────────────────────────────────────────────────────────

    error InvalidToken();
    error InvalidReceiver();
    error NotAttestationOwner();
    error AttestationDisputed();
    error DRSTooHigh(uint16 drs, uint16 gate);
    error AlreadyRegistered();

    // ── Constructor ────────────────────────────────────────────────────────────

    constructor(IVeritasRegistry drsRegistry_) {
        drsRegistry = drsRegistry_;
    }

    // ── Core ───────────────────────────────────────────────────────────────────

    /**
     * @notice Register an IP token after passing the DRS gate.
     *
     * @param token           The ERC-20 IP token address (deployed via IPTokenFactory).
     * @param royaltyReceiver Wallet that will receive perpetual royalties.
     * @param tokenURI        IPFS URI pointing to the IP metadata JSON.
     * @param attestationId   The v2 VeritasRegistry attestation for this content.
     *
     * @dev Requirements:
     *      - `token` and `royaltyReceiver` must be non-zero.
     *      - `msg.sender` must be the owner of the attestation in VeritasRegistry.
     *      - The attestation must not be under dispute.
     *      - `getCurrentDRS(attestationId) < DRS_GATE` — content is original enough.
     *      - `token` must not already be registered.
     */
    function registerIP(
        address token,
        address royaltyReceiver,
        string calldata tokenURI,
        bytes32 attestationId
    ) external {
        if (token == address(0)) revert InvalidToken();
        if (royaltyReceiver == address(0)) revert InvalidReceiver();
        if (registry[token].isVerified) revert AlreadyRegistered();

        IVeritasRegistry.AttestationRecord memory rec = drsRegistry.getRecord(attestationId);

        if (rec.owner != msg.sender) revert NotAttestationOwner();
        if (rec.disputed) revert AttestationDisputed();

        uint16 drs = drsRegistry.getCurrentDRS(attestationId);
        if (drs >= DRS_GATE) revert DRSTooHigh(drs, DRS_GATE);

        registry[token] = IPRecord({
            royaltyReceiver: royaltyReceiver,
            tokenURI: tokenURI,
            attestationId: attestationId,
            drsAtRegistration: drs,
            isVerified: true
        });

        emit IPRegistered(token, royaltyReceiver, attestationId, drs, tokenURI);
    }

    // ── Views ──────────────────────────────────────────────────────────────────

    /// @notice Returns true if the token has passed DRS gating and is registered.
    function isVerified(address token) external view returns (bool) {
        return registry[token].isVerified;
    }

    /// @notice Returns the live DRS for a registered token's linked attestation.
    /// @dev DRS can increase after registration if the content gets copied post-launch.
    function getLiveDRS(address token) external view returns (uint16) {
        bytes32 id = registry[token].attestationId;
        if (id == bytes32(0)) return 0;
        return drsRegistry.getCurrentDRS(id);
    }

    /// @notice Returns the royalty receiver for a registered IP token.
    function getRoyaltyReceiver(address token) external view returns (address) {
        return registry[token].royaltyReceiver;
    }
}
