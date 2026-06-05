// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IVeritasOracle} from "./interfaces/IVeritasOracle.sol";

/**
 * @title VeritasOracle
 * @notice Single signature-verification authority for DRS attestations ("Opsi A").
 *
 * @dev "Content token pools are illiquid not because nobody wants them, but because LPs cannot price
 *      their risk. The dominant downside driver — dilution by copies and AI replicas — is invisible
 *      on-chain. Veritas is the missing risk infrastructure." This contract is the trust anchor that
 *      lets an off-chain risk score be relied upon on-chain without a single point of failure.
 *
 *      Hardening (off-chain data = #1 DeFi attack vector):
 *        - 2-of-3 (configurable) operator quorum over EIP-712 typed signatures,
 *        - cross-operator agreement: highest/lowest signed DRS must be within `maxSpread`,
 *        - freshness window: each signature must be recent (anti-replay; combined with the Registry's
 *          per-attestation update timelock this prevents stale-signature reuse),
 *        - bounds: the canonical DRS must be <= `maxDrs` (reject extreme oracle outputs).
 */
contract VeritasOracle is IVeritasOracle, EIP712, Ownable {
    using ECDSA for bytes32;

    /// @dev EIP-712 type hash for a single operator's DRS attestation.
    bytes32 public constant DRS_ATTESTATION_TYPEHASH =
        keccak256("DRSAttestation(bytes32 attestationId,uint16 drs,uint256 timestamp)");

    /// @dev Hard ceiling on DRS. Leaves headroom so the oracle can never set the absolute maximum.
    uint16 public constant MAX_DRS = 9500;

    /// @dev Maximum spread tolerated between the highest and lowest operator-signed DRS (5%).
    uint16 public constant MAX_SPREAD = 500;

    /// @dev Maximum number of authorized operators (multisig-style).
    uint8 public constant MAX_OPERATORS = 3;

    /// @dev How recent a signature must be. Must stay well below the Registry update timelock so that
    ///      a replayed batch is rejected either here (too old) or there (timelock not elapsed).
    uint64 public constant SIGNATURE_MAX_AGE = 10 minutes;

    /// @dev Small tolerance for clock skew between signer and chain.
    uint64 internal constant CLOCK_SKEW = 5 minutes;

    mapping(address => bool) private _isOperator;
    uint8 private _operatorCount;
    uint8 private _quorum;

    error NotEnoughSignatures();
    error TooManyOperators();
    error AlreadyOperator();
    error UnknownOperator();
    error DuplicateOperator();
    error StaleSignature();
    error FutureSignature();
    error SpreadTooWide();
    error DrsOutOfBounds();
    error InvalidQuorum();

    constructor(address[] memory operators, uint8 quorum_, address owner_)
        EIP712("Veritas Oracle", "1")
        Ownable(owner_)
    {
        if (operators.length == 0 || operators.length > MAX_OPERATORS) revert TooManyOperators();
        for (uint256 i = 0; i < operators.length; i++) {
            address op = operators[i];
            if (_isOperator[op]) revert AlreadyOperator();
            _isOperator[op] = true;
            emit OperatorAdded(op);
        }
        _operatorCount = uint8(operators.length);
        if (quorum_ == 0 || quorum_ > _operatorCount) revert InvalidQuorum();
        _quorum = quorum_;
        emit QuorumUpdated(quorum_);
    }

    // ----------------------------------------------------------------------------------------------
    // Verification
    // ----------------------------------------------------------------------------------------------

    /// @inheritdoc IVeritasOracle
    function verify(bytes32 attestationId, OperatorSig[] calldata sigs)
        public
        view
        override
        returns (uint16 canonicalDrs)
    {
        uint256 n = sigs.length;
        if (n < _quorum) revert NotEnoughSignatures();

        // Track distinct operators via a bitmask over a small, ordered operator set is overkill;
        // instead we keep an in-memory list of seen signers (n is tiny, <= MAX_OPERATORS).
        address[] memory seen = new address[](n);
        uint256 sum;
        uint16 minDrs = type(uint16).max;
        uint16 maxDrsSeen;

        for (uint256 i = 0; i < n; i++) {
            OperatorSig calldata s = sigs[i];

            if (s.timestamp + SIGNATURE_MAX_AGE < block.timestamp) revert StaleSignature();
            if (s.timestamp > block.timestamp + CLOCK_SKEW) revert FutureSignature();

            bytes32 digest = _hashTypedDataV4(
                keccak256(abi.encode(DRS_ATTESTATION_TYPEHASH, attestationId, s.drs, uint256(s.timestamp)))
            );
            address signer = digest.recover(s.signature);
            if (!_isOperator[signer]) revert UnknownOperator();

            for (uint256 j = 0; j < i; j++) {
                if (seen[j] == signer) revert DuplicateOperator();
            }
            seen[i] = signer;

            sum += s.drs;
            if (s.drs < minDrs) minDrs = s.drs;
            if (s.drs > maxDrsSeen) maxDrsSeen = s.drs;
        }

        if (maxDrsSeen - minDrs > MAX_SPREAD) revert SpreadTooWide();

        canonicalDrs = uint16(sum / n);
        if (canonicalDrs > MAX_DRS) revert DrsOutOfBounds();
    }

    /// @inheritdoc IVeritasOracle
    function isValid(bytes32 attestationId, OperatorSig[] calldata sigs) external view override returns (bool) {
        // Re-implements the checks without reverting (cheap for the tiny operator set).
        uint256 n = sigs.length;
        if (n < _quorum) return false;

        address[] memory seen = new address[](n);
        uint256 sum;
        uint16 minDrs = type(uint16).max;
        uint16 maxDrsSeen;

        for (uint256 i = 0; i < n; i++) {
            OperatorSig calldata s = sigs[i];
            if (s.timestamp + SIGNATURE_MAX_AGE < block.timestamp) return false;
            if (s.timestamp > block.timestamp + CLOCK_SKEW) return false;

            bytes32 digest = _hashTypedDataV4(
                keccak256(abi.encode(DRS_ATTESTATION_TYPEHASH, attestationId, s.drs, uint256(s.timestamp)))
            );
            (address signer, ECDSA.RecoverError err,) = ECDSA.tryRecover(digest, s.signature);
            if (err != ECDSA.RecoverError.NoError || !_isOperator[signer]) return false;
            for (uint256 j = 0; j < i; j++) {
                if (seen[j] == signer) return false;
            }
            seen[i] = signer;
            sum += s.drs;
            if (s.drs < minDrs) minDrs = s.drs;
            if (s.drs > maxDrsSeen) maxDrsSeen = s.drs;
        }
        if (maxDrsSeen - minDrs > MAX_SPREAD) return false;
        return (sum / n) <= MAX_DRS;
    }

    // ----------------------------------------------------------------------------------------------
    // Admin (operator rotation / quorum)
    // ----------------------------------------------------------------------------------------------

    function addOperator(address op) external onlyOwner {
        if (_operatorCount >= MAX_OPERATORS) revert TooManyOperators();
        if (_isOperator[op]) revert AlreadyOperator();
        _isOperator[op] = true;
        _operatorCount += 1;
        emit OperatorAdded(op);
    }

    function removeOperator(address op) external onlyOwner {
        if (!_isOperator[op]) revert UnknownOperator();
        _isOperator[op] = false;
        _operatorCount -= 1;
        if (_quorum > _operatorCount) {
            _quorum = _operatorCount == 0 ? 0 : _operatorCount;
            emit QuorumUpdated(_quorum);
        }
        emit OperatorRemoved(op);
    }

    function setQuorum(uint8 quorum_) external onlyOwner {
        if (quorum_ == 0 || quorum_ > _operatorCount) revert InvalidQuorum();
        _quorum = quorum_;
        emit QuorumUpdated(quorum_);
    }

    // ----------------------------------------------------------------------------------------------
    // Views
    // ----------------------------------------------------------------------------------------------

    function isOperator(address account) external view override returns (bool) {
        return _isOperator[account];
    }

    function operatorCount() external view override returns (uint8) {
        return _operatorCount;
    }

    function quorum() external view override returns (uint8) {
        return _quorum;
    }

    function maxDrs() external pure override returns (uint16) {
        return MAX_DRS;
    }

    function maxSpread() external pure override returns (uint16) {
        return MAX_SPREAD;
    }

    function signatureMaxAge() external pure override returns (uint64) {
        return SIGNATURE_MAX_AGE;
    }

    /// @notice Exposes the EIP-712 domain separator for off-chain signers.
    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }
}
