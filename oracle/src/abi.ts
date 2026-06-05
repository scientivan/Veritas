/** Minimal ABI slices for the live Veritas contracts (Unichain Sepolia). */

export const ORACLE_ABI = [
  {
    type: "function",
    name: "isValid",
    stateMutability: "view",
    inputs: [
      {name: "attestationId", type: "bytes32"},
      {
        name: "sigs",
        type: "tuple[]",
        components: [
          {name: "drs", type: "uint16"},
          {name: "timestamp", type: "uint64"},
          {name: "signature", type: "bytes"},
        ],
      },
    ],
    outputs: [{type: "bool"}],
  },
  {
    type: "function",
    name: "verify",
    stateMutability: "view",
    inputs: [
      {name: "attestationId", type: "bytes32"},
      {
        name: "sigs",
        type: "tuple[]",
        components: [
          {name: "drs", type: "uint16"},
          {name: "timestamp", type: "uint64"},
          {name: "signature", type: "bytes"},
        ],
      },
    ],
    outputs: [{name: "canonicalDrs", type: "uint16"}],
  },
  {type: "function", name: "isOperator", stateMutability: "view", inputs: [{name: "account", type: "address"}], outputs: [{type: "bool"}]},
  {type: "function", name: "quorum", stateMutability: "view", inputs: [], outputs: [{type: "uint8"}]},
] as const;

const OPERATOR_SIG_TUPLE = {
  type: "tuple[]",
  components: [
    {name: "drs", type: "uint16"},
    {name: "timestamp", type: "uint64"},
    {name: "signature", type: "bytes"},
  ],
} as const;

export const REGISTRY_ABI = [
  {
    type: "function",
    name: "attest",
    stateMutability: "payable",
    inputs: [
      {name: "pHash", type: "bytes32"},
      {name: "blockHash", type: "bytes32"},
      {name: "ipfsCid", type: "string"},
      {name: "aiSigs", ...OPERATOR_SIG_TUPLE},
      {name: "dSigs", ...OPERATOR_SIG_TUPLE},
    ],
    outputs: [{name: "attestationId", type: "bytes32"}],
  },
  {type: "function", name: "attestFee", stateMutability: "view", inputs: [], outputs: [{type: "uint256"}]},
  {type: "function", name: "isAttested", stateMutability: "view", inputs: [{name: "attestationId", type: "bytes32"}], outputs: [{type: "bool"}]},
  {
    type: "function",
    name: "computeAttestationId",
    stateMutability: "pure",
    inputs: [
      {name: "pHash", type: "bytes32"},
      {name: "blockHash", type: "bytes32"},
      {name: "owner", type: "address"},
    ],
    outputs: [{type: "bytes32"}],
  },
  {
    type: "function",
    name: "getCurrentDRS",
    stateMutability: "view",
    inputs: [{name: "attestationId", type: "bytes32"}],
    outputs: [{type: "uint16"}],
  },
  {
    type: "function",
    name: "getRecord",
    stateMutability: "view",
    inputs: [{name: "attestationId", type: "bytes32"}],
    outputs: [
      {
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
    type: "function",
    name: "updateAIScore",
    stateMutability: "nonpayable",
    inputs: [
      {name: "attestationId", type: "bytes32"},
      {...OPERATOR_SIG_TUPLE, name: "sigs"},
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "updateOffchainD",
    stateMutability: "nonpayable",
    inputs: [
      {name: "attestationId", type: "bytes32"},
      {...OPERATOR_SIG_TUPLE, name: "sigs"},
    ],
    outputs: [],
  },
] as const;
