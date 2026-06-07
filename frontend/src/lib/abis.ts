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

// ── IPLaunchRegistry (new integrated contract) ────────────────────────────────

export const LAUNCH_REGISTRY_ABI = [
  {
    name: "registerIP",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      {name: "token", type: "address"},
      {name: "royaltyReceiver", type: "address"},
      {name: "tokenURI", type: "string"},
      {name: "attestationId", type: "bytes32"},
    ],
    outputs: [],
  },
  {
    name: "isVerified",
    type: "function",
    stateMutability: "view",
    inputs: [{name: "token", type: "address"}],
    outputs: [{name: "", type: "bool"}],
  },
  {
    name: "getLiveDRS",
    type: "function",
    stateMutability: "view",
    inputs: [{name: "token", type: "address"}],
    outputs: [{name: "", type: "uint16"}],
  },
  {
    name: "getRoyaltyReceiver",
    type: "function",
    stateMutability: "view",
    inputs: [{name: "token", type: "address"}],
    outputs: [{name: "", type: "address"}],
  },
  {
    name: "registry",
    type: "function",
    stateMutability: "view",
    inputs: [{name: "token", type: "address"}],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          {name: "royaltyReceiver", type: "address"},
          {name: "tokenURI", type: "string"},
          {name: "attestationId", type: "bytes32"},
          {name: "drsAtRegistration", type: "uint16"},
          {name: "isVerified", type: "bool"},
        ],
      },
    ],
  },
  {
    name: "DRS_GATE",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{name: "", type: "uint16"}],
  },
  {
    name: "IPRegistered",
    type: "event",
    inputs: [
      {name: "token", type: "address", indexed: true},
      {name: "royaltyReceiver", type: "address", indexed: true},
      {name: "attestationId", type: "bytes32", indexed: true},
      {name: "drsAtRegistration", type: "uint16", indexed: false},
      {name: "tokenURI", type: "string", indexed: false},
    ],
  },
] as const;

// ── IPTokenFactory (v1) ────────────────────────────────────────────────────────

export const IP_TOKEN_FACTORY_ABI = [
  {
    name: "createToken",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      {name: "name", type: "string"},
      {name: "symbol", type: "string"},
      {name: "initialSupply", type: "uint256"},
    ],
    outputs: [{name: "tokenAddress", type: "address"}],
  },
  {
    name: "TokenCreated",
    type: "event",
    inputs: [
      // Matches MockIPToken.sol: only `creator` is indexed.
      {name: "creator", type: "address", indexed: true},
      {name: "tokenAddress", type: "address", indexed: false},
      {name: "name", type: "string", indexed: false},
      {name: "symbol", type: "string", indexed: false},
    ],
  },
] as const;

// ── v1 VeritasHook (bonding curve + royalties) ────────────────────────────────

export const V1_HOOK_ABI = [
  {
    name: "initializeLaunchpad",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "key",
        type: "tuple",
        components: [
          {name: "currency0", type: "address"},
          {name: "currency1", type: "address"},
          {name: "fee", type: "uint24"},
          {name: "tickSpacing", type: "int24"},
          {name: "hooks", type: "address"},
        ],
      },
      {name: "curveAllocation", type: "uint256"},
      {name: "lpAllocation", type: "uint256"},
      {name: "hardCap", type: "uint256"},
      {name: "treasury", type: "address"},
    ],
    outputs: [],
  },
  {
    name: "claimRoyalties",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{name: "token", type: "address"}],
    outputs: [],
  },
  {
    name: "pendingRoyalties",
    type: "function",
    stateMutability: "view",
    inputs: [
      {name: "creator", type: "address"},
      {name: "token", type: "address"},
    ],
    outputs: [{name: "", type: "uint256"}],
  },
  {
    // Public mapping getter: returns the struct members as 12 FLAT values
    // (not a single tuple). Matches the deployed bytecode.
    name: "launchpads",
    type: "function",
    stateMutability: "view",
    inputs: [{name: "poolId", type: "bytes32"}],
    outputs: [
      {name: "phase", type: "uint8"},
      {name: "migrating", type: "bool"},
      {name: "launchTokenIs0", type: "bool"},
      {name: "curveAllocation", type: "uint256"},
      {name: "lpAllocation", type: "uint256"},
      {name: "tokensSold", type: "uint256"},
      {name: "fundsRaised", type: "uint256"},
      {name: "hardCap", type: "uint256"},
      {name: "curveA", type: "uint256"},
      {name: "curveB", type: "uint256"},
      {name: "graduationSqrtPriceX96", type: "uint160"},
      {name: "veritasTreasury", type: "address"},
    ],
  },
  {
    name: "RoyaltyClaimed",
    type: "event",
    inputs: [
      {name: "creator", type: "address", indexed: true},
      {name: "token", type: "address", indexed: true},
      {name: "amount", type: "uint256", indexed: false},
    ],
  },
  {
    name: "PoolGraduated",
    type: "event",
    inputs: [
      {name: "poolId", type: "bytes32", indexed: true},
      {name: "fundsRaised", type: "uint256", indexed: false},
      {name: "tokensSold", type: "uint256", indexed: false},
    ],
  },
  {
    // Public mapping: cumulative IP tokens bought by a wallet during the launchpad.
    name: "userTokensBought",
    type: "function",
    stateMutability: "view",
    inputs: [
      {name: "poolId", type: "bytes32"},
      {name: "user", type: "address"},
    ],
    outputs: [{name: "", type: "uint256"}],
  },
] as const;

// ── v1 VeritasRegistry (permissionless IP token registry the v1 hook reads) ────

export const V1_REGISTRY_ABI = [
  {
    name: "registerIP",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      {name: "token", type: "address"},
      {name: "royaltyReceiver", type: "address"},
      {name: "tokenURI", type: "string"},
    ],
    outputs: [],
  },
  {
    name: "registry",
    type: "function",
    stateMutability: "view",
    inputs: [{name: "token", type: "address"}],
    outputs: [
      {name: "royaltyReceiver", type: "address"},
      {name: "tokenURI", type: "string"},
      {name: "isVerified", type: "bool"},
    ],
  },
] as const;

// ── Uniswap v4 PoolManager: initialize (open a pool) ───────────────────────────

export const POOL_MANAGER_INIT_ABI = [
  {
    name: "initialize",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "key",
        type: "tuple",
        components: [
          {name: "currency0", type: "address"},
          {name: "currency1", type: "address"},
          {name: "fee", type: "uint24"},
          {name: "tickSpacing", type: "int24"},
          {name: "hooks", type: "address"},
        ],
      },
      {name: "sqrtPriceX96", type: "uint160"},
    ],
    outputs: [{name: "tick", type: "int24"}],
  },
] as const;

// Minimal ERC-20 approve (for launchpad allocation transfer-in).
export const ERC20_APPROVE_ABI = [
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      {name: "spender", type: "address"},
      {name: "amount", type: "uint256"},
    ],
    outputs: [{name: "", type: "bool"}],
  },
] as const;
