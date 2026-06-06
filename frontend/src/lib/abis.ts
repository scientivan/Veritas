/** Minimal ABI slices for Veritas contracts: only the selectors we actually call. */

export const REGISTRY_ABI = [
  // ── reads ──────────────────────────────────────────────────────────────────
  {
    name: "getRecord",
    type: "function",
    stateMutability: "view",
    inputs: [{name: "attestationId", type: "bytes32"}],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          {name: "pHashFingerprint", type: "bytes32"},
          {name: "blockhashFingerprint", type: "bytes32"},
          {name: "aiReplicabilityScore", type: "uint16"},
          {name: "offchainD", type: "uint16"},
          {name: "dilutionCount", type: "uint32"},
          {name: "attestedAt", type: "uint64"},
          {name: "lastAiUpdate", type: "uint64"},
          {name: "lastOffchainDUpdate", type: "uint64"},
          {name: "lastDilutionUpdate", type: "uint64"},
          {name: "owner", type: "address"},
          {name: "ipfsCid", type: "string"},
          {name: "disputed", type: "bool"},
        ],
      },
    ],
  },
  {
    name: "isAttested",
    type: "function",
    stateMutability: "view",
    inputs: [{name: "attestationId", type: "bytes32"}],
    outputs: [{name: "", type: "bool"}],
  },
  {
    name: "attestFee",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{name: "", type: "uint256"}],
  },
  {
    name: "disputeBond",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{name: "", type: "uint256"}],
  },
  {
    name: "fingerprintCount",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{name: "", type: "uint256"}],
  },
  {
    name: "owner",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{name: "", type: "address"}],
  },
  // ── writes ─────────────────────────────────────────────────────────────────
  {
    name: "resolveDispute",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      {name: "attestationId", type: "bytes32"},
      {name: "upheld", type: "bool"},
    ],
    outputs: [],
  },
  {
    name: "disputeAttestation",
    type: "function",
    stateMutability: "payable",
    inputs: [{name: "attestationId", type: "bytes32"}],
    outputs: [],
  },
  {
    name: "attest",
    type: "function",
    stateMutability: "payable",
    inputs: [
      {name: "pHash", type: "bytes32"},
      {name: "blockHash", type: "bytes32"},
      {name: "ipfsCid", type: "string"},
      {
        name: "aiSigs",
        type: "tuple[]",
        components: [
          {name: "drs", type: "uint16"},
          {name: "timestamp", type: "uint64"},
          {name: "signature", type: "bytes"},
        ],
      },
      {
        name: "dSigs",
        type: "tuple[]",
        components: [
          {name: "drs", type: "uint16"},
          {name: "timestamp", type: "uint64"},
          {name: "signature", type: "bytes"},
        ],
      },
    ],
    outputs: [{name: "attestationId", type: "bytes32"}],
  },
  // ── events ─────────────────────────────────────────────────────────────────
  {
    name: "Attested",
    type: "event",
    inputs: [
      {name: "attestationId", type: "bytes32", indexed: true},
      {name: "owner", type: "address", indexed: true},
      {name: "aiScore", type: "uint16", indexed: false},
      {name: "ipfsCid", type: "string", indexed: false},
    ],
  },
  {
    name: "DilutionIncremented",
    type: "event",
    inputs: [
      {name: "attestationId", type: "bytes32", indexed: true},
      {name: "newCount", type: "uint32", indexed: false},
      {name: "newDrs", type: "uint16", indexed: false},
    ],
  },
  {
    name: "DisputeFiled",
    type: "event",
    inputs: [
      {name: "attestationId", type: "bytes32", indexed: true},
      {name: "disputer", type: "address", indexed: true},
      {name: "bond", type: "uint256", indexed: false},
      {name: "freezeUntil", type: "uint64", indexed: false},
    ],
  },
  {
    name: "DisputeResolved",
    type: "event",
    inputs: [
      {name: "attestationId", type: "bytes32", indexed: true},
      {name: "upheld", type: "bool", indexed: false},
    ],
  },
] as const;

export type RegistryAbi = typeof REGISTRY_ABI;
