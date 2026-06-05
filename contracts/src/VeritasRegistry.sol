// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IVeritasOracle} from "./interfaces/IVeritasOracle.sol";
import {IVeritasRegistry} from "./interfaces/IVeritasRegistry.sol";

/**
 * @title VeritasRegistry (hybrid D/A model)
 * @notice Stores attestations where A (AI replicability) is oracle-signed once, and D (duplicate
 *         density) is maintained fully on-chain by a Reactive Smart Contract. DRS is derived live.
 *
 * @dev Trust split: only A needs the oracle. D is trustless on-chain. The Reactive callback contract
 *      (set as `dilutionUpdater`) is the sole address allowed to {incrementDilutionCount}; it is itself
 *      gated to the Reactive Network Callback Proxy, so the chain of trust is Proxy -> callback -> here.
 */
contract VeritasRegistry is IVeritasRegistry, Ownable, ReentrancyGuard {
    IVeritasOracle public immutable oracle;

    uint16 public constant DRS_SCALE = 10000;
    uint256 public constant MIN_UPDATE_INTERVAL = 1 hours; // between A updates
    uint256 public constant LARGE_DELTA = 3000; // 30% A change escalates the timelock
    uint256 public constant LARGE_DELTA_INTERVAL = 2 hours;
    uint64 public constant DISPUTE_FREEZE = 48 hours;

    uint256 public attestFee;
    uint256 public disputeBond;
    uint256 public treasury;

    /// @notice The Reactive callback contract permitted to push dilution increments.
    address public dilutionUpdater;

    struct Fingerprint {
        bytes32 pHash;
        bytes32 blockHash;
        bytes32 id;
    }

    Fingerprint[] private _fingerprints;

    mapping(bytes32 => AttestationRecord) private _records;
    mapping(bytes32 => bool) private _exists;

    mapping(bytes32 => address) public disputerOf;
    mapping(bytes32 => uint256) public disputeBondOf;
    mapping(bytes32 => uint64) public disputeFreezeUntil;

    error AlreadyAttested();
    error NotAttested();
    error InsufficientAttestFee();
    error InsufficientDisputeBond();
    error AlreadyDisputed();
    error NotDisputed();
    error UpdateTimelocked();
    error Frozen();
    error NotDilutionUpdater();
    error NothingToWithdraw();
    error TransferFailed();

    constructor(IVeritasOracle oracle_, uint256 attestFee_, uint256 disputeBond_, address owner_) Ownable(owner_) {
        oracle = oracle_;
        attestFee = attestFee_;
        disputeBond = disputeBond_;
    }

    modifier onlyDilutionUpdater() {
        if (msg.sender != dilutionUpdater) revert NotDilutionUpdater();
        _;
    }

    // ----------------------------------------------------------------------------------------------
    // Attestation lifecycle
    // ----------------------------------------------------------------------------------------------

    /// @inheritdoc IVeritasRegistry
    function attest(
        bytes32 pHash,
        bytes32 blockHash,
        string calldata ipfsCid,
        IVeritasOracle.OperatorSig[] calldata aiSigs,
        IVeritasOracle.OperatorSig[] calldata dSigs
    ) external payable override nonReentrant returns (bytes32 attestationId) {
        if (msg.value < attestFee) revert InsufficientAttestFee();

        attestationId = computeAttestationId(pHash, blockHash, msg.sender);
        if (_exists[attestationId]) revert AlreadyAttested();

        // A and the off-chain D are independent oracle-verified scores.
        uint16 aiScore = oracle.verify(attestationId, aiSigs);
        uint16 offchainD = oracle.verify(attestationId, dSigs);

        _records[attestationId] = AttestationRecord({
            pHashFingerprint: pHash,
            blockhashFingerprint: blockHash,
            aiReplicabilityScore: aiScore,
            offchainD: offchainD,
            dilutionCount: 0,
            attestedAt: uint64(block.timestamp),
            lastAiUpdate: uint64(block.timestamp),
            lastOffchainDUpdate: uint64(block.timestamp),
            lastDilutionUpdate: 0,
            owner: msg.sender,
            ipfsCid: ipfsCid,
            disputed: false
        });
        _exists[attestationId] = true;
        _fingerprints.push(Fingerprint({pHash: pHash, blockHash: blockHash, id: attestationId}));
        treasury += msg.value;

        emit Attested(attestationId, msg.sender, aiScore, ipfsCid);
        // Emitted last: this is the event the Reactive Smart Contract subscribes to.
        emit NewAttestation(pHash, attestationId);
    }

    /// @inheritdoc IVeritasRegistry
    function updateAIScore(bytes32 attestationId, IVeritasOracle.OperatorSig[] calldata sigs) external override {
        AttestationRecord storage rec = _records[attestationId];
        if (!_exists[attestationId]) revert NotAttested();
        if (rec.disputed) revert Frozen();

        uint16 newScore = oracle.verify(attestationId, sigs);
        uint16 oldScore = rec.aiReplicabilityScore;

        uint256 delta = newScore > oldScore ? uint256(newScore - oldScore) : uint256(oldScore - newScore);
        uint256 requiredInterval = delta > LARGE_DELTA ? LARGE_DELTA_INTERVAL : MIN_UPDATE_INTERVAL;
        if (block.timestamp < uint256(rec.lastAiUpdate) + requiredInterval) revert UpdateTimelocked();

        rec.aiReplicabilityScore = newScore;
        rec.lastAiUpdate = uint64(block.timestamp);

        if (delta > LARGE_DELTA) emit LargeAIChange(attestationId, oldScore, newScore);
        emit AIScoreUpdated(attestationId, oldScore, newScore);
    }

    /// @inheritdoc IVeritasRegistry
    function updateOffchainD(bytes32 attestationId, IVeritasOracle.OperatorSig[] calldata sigs) external override {
        AttestationRecord storage rec = _records[attestationId];
        if (!_exists[attestationId]) revert NotAttested();
        if (rec.disputed) revert Frozen();

        uint16 newD = oracle.verify(attestationId, sigs);
        uint16 oldD = rec.offchainD;

        uint256 delta = newD > oldD ? uint256(newD - oldD) : uint256(oldD - newD);
        uint256 requiredInterval = delta > LARGE_DELTA ? LARGE_DELTA_INTERVAL : MIN_UPDATE_INTERVAL;
        if (block.timestamp < uint256(rec.lastOffchainDUpdate) + requiredInterval) revert UpdateTimelocked();

        rec.offchainD = newD;
        rec.lastOffchainDUpdate = uint64(block.timestamp);
        emit OffchainDUpdated(attestationId, oldD, newD);
    }

    /// @inheritdoc IVeritasRegistry
    function incrementDilutionCount(bytes32 attestationId) external override onlyDilutionUpdater {
        AttestationRecord storage rec = _records[attestationId];
        if (!_exists[attestationId]) revert NotAttested();
        if (rec.disputed) revert Frozen();

        rec.dilutionCount += 1;
        rec.lastDilutionUpdate = uint64(block.timestamp);

        emit DilutionIncremented(attestationId, rec.dilutionCount, getCurrentDRS(attestationId));
    }

    // ----------------------------------------------------------------------------------------------
    // Dispute mechanism (bonded)
    // ----------------------------------------------------------------------------------------------

    /// @inheritdoc IVeritasRegistry
    function disputeAttestation(bytes32 attestationId) external payable override nonReentrant {
        if (!_exists[attestationId]) revert NotAttested();
        AttestationRecord storage rec = _records[attestationId];
        if (rec.disputed) revert AlreadyDisputed();
        if (msg.value < disputeBond) revert InsufficientDisputeBond();

        rec.disputed = true;
        uint64 freezeUntil = uint64(block.timestamp) + DISPUTE_FREEZE;
        disputeFreezeUntil[attestationId] = freezeUntil;
        disputerOf[attestationId] = msg.sender;
        disputeBondOf[attestationId] = msg.value;

        emit DisputeFiled(attestationId, msg.sender, msg.value, freezeUntil);
    }

    /// @inheritdoc IVeritasRegistry
    function resolveDispute(bytes32 attestationId, bool upheld) external override onlyOwner nonReentrant {
        AttestationRecord storage rec = _records[attestationId];
        if (!_exists[attestationId]) revert NotAttested();
        if (!rec.disputed) revert NotDisputed();

        address disputer = disputerOf[attestationId];
        uint256 bond = disputeBondOf[attestationId];

        rec.disputed = false;
        delete disputeFreezeUntil[attestationId];
        delete disputerOf[attestationId];
        delete disputeBondOf[attestationId];

        if (upheld) {
            (bool ok,) = disputer.call{value: bond}("");
            if (!ok) revert TransferFailed();
        } else {
            treasury += bond;
        }

        emit DisputeResolved(attestationId, upheld);
    }

    // ----------------------------------------------------------------------------------------------
    // Admin
    // ----------------------------------------------------------------------------------------------

    function setDilutionUpdater(address updater) external onlyOwner {
        dilutionUpdater = updater;
        emit DilutionUpdaterSet(updater);
    }

    function setAttestFee(uint256 fee) external onlyOwner {
        attestFee = fee;
        emit AttestFeeUpdated(fee);
    }

    function setDisputeBond(uint256 bond) external onlyOwner {
        disputeBond = bond;
        emit DisputeBondUpdated(bond);
    }

    function withdrawTreasury(address to) external onlyOwner nonReentrant {
        uint256 amount = treasury;
        if (amount == 0) revert NothingToWithdraw();
        treasury = 0;
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }

    // ----------------------------------------------------------------------------------------------
    // Views
    // ----------------------------------------------------------------------------------------------

    /// @inheritdoc IVeritasRegistry
    function getRecord(bytes32 attestationId) external view override returns (AttestationRecord memory) {
        return _records[attestationId];
    }

    /// @inheritdoc IVeritasRegistry
    function getAIScore(bytes32 attestationId) external view override returns (uint16) {
        return _records[attestationId].aiReplicabilityScore;
    }

    /// @inheritdoc IVeritasRegistry
    function getCurrentDRS(bytes32 attestationId) public view override returns (uint16) {
        if (!_exists[attestationId]) return 0;
        uint256 d = getEffectiveD(attestationId);
        uint256 a = _records[attestationId].aiReplicabilityScore;
        // noisy-OR in integer math: DRS = SCALE - (SCALE-D)(SCALE-A)/SCALE.
        uint256 drs = DRS_SCALE - ((DRS_SCALE - d) * (DRS_SCALE - a)) / DRS_SCALE;
        return uint16(drs);
    }

    /// @inheritdoc IVeritasRegistry
    function getEffectiveD(bytes32 attestationId) public view override returns (uint256) {
        if (!_exists[attestationId]) return 0;
        AttestationRecord storage rec = _records[attestationId];
        uint256 onchain = saturateD(rec.dilutionCount); // trustless floor (pHash)
        uint256 offchain = rec.offchainD; // robust off-chain signal (DINOv2 + web)
        return onchain >= offchain ? onchain : offchain; // max(): neither source can hide risk
    }

    /// @inheritdoc IVeritasRegistry
    function saturateD(uint32 count) public pure override returns (uint256) {
        if (count == 0) return 0;
        if (count == 1) return 4000;
        if (count == 2) return 6000;
        if (count <= 3) return 7500;
        if (count <= 5) return 8500;
        if (count <= 10) return 9000;
        if (count <= 20) return 9500;
        return 9800;
    }

    /// @inheritdoc IVeritasRegistry
    function getNearDuplicates(bytes32 pHash, bytes32 blockHash, uint8 hammingThreshold)
        external
        view
        override
        returns (bytes32[] memory ids)
    {
        uint256 n = _fingerprints.length;
        uint256 matches;
        for (uint256 i = 0; i < n; i++) {
            Fingerprint storage f = _fingerprints[i];
            if (_hamming(pHash, f.pHash) <= hammingThreshold && _hamming(blockHash, f.blockHash) <= hammingThreshold) {
                matches++;
            }
        }
        ids = new bytes32[](matches);
        uint256 k;
        for (uint256 i = 0; i < n; i++) {
            Fingerprint storage f = _fingerprints[i];
            if (_hamming(pHash, f.pHash) <= hammingThreshold && _hamming(blockHash, f.blockHash) <= hammingThreshold) {
                ids[k++] = f.id;
            }
        }
    }

    /// @inheritdoc IVeritasRegistry
    function isAttested(bytes32 attestationId) external view override returns (bool) {
        return _exists[attestationId];
    }

    /// @inheritdoc IVeritasRegistry
    function computeAttestationId(bytes32 pHash, bytes32 blockHash, address owner)
        public
        pure
        override
        returns (bytes32)
    {
        return keccak256(abi.encode(pHash, blockHash, owner));
    }

    /// @inheritdoc IVeritasRegistry
    function hammingDistance(bytes32 a, bytes32 b) external pure override returns (uint256) {
        return _hamming(a, b);
    }

    function fingerprintCount() external view returns (uint256) {
        return _fingerprints.length;
    }

    function _hamming(bytes32 a, bytes32 b) internal pure returns (uint256 distance) {
        uint256 x = uint256(a) ^ uint256(b);
        while (x != 0) {
            x &= x - 1;
            distance++;
        }
    }
}
