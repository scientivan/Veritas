/**
 * Oracle keeper: re-scores an attestation's content and submits signed
 * updateAIScore / updateOffchainD transactions when the risk has moved, keeping
 * the on-chain A and off-chain D "alive" after attestation.
 *
 * Content is re-fetched from the attestation's ipfsCid (gateway) unless a
 * CONTENT_URL override is given. Scores are co-signed by the operator quorum and
 * only submitted when the delta clears UPDATE_MIN_DELTA and the contract's
 * timelock (1h, or 2h for >30pp swings) has elapsed.
 *
 *   ATTESTATION_ID=0x.. [CONTENT_URL=https://..] tsx scripts/keeper.ts
 */
import {createWalletClient, http, type Hex} from "viem";
import {privateKeyToAccount} from "viem/accounts";
import {config} from "../src/config.js";
import {unichainSepolia, publicClient} from "../src/chain.js";
import {REGISTRY_ABI} from "../src/abi.js";
import {analyze} from "../src/pipeline.js";
import {operators, signAs} from "../src/operators.js";
import {toScore16} from "../src/drs.js";
import {fetchFromIpfs} from "../src/ipfs.js";

const account = privateKeyToAccount(config.operatorKey);
const wallet = createWalletClient({account, chain: unichainSepolia, transport: http(config.rpcUrl)});

const MIN_UPDATE_INTERVAL = 3600;
const LARGE_DELTA = 3000;
const LARGE_DELTA_INTERVAL = 7200;
const UPDATE_MIN_DELTA = Number(process.env.UPDATE_MIN_DELTA ?? 100); // 1pp, in 0..10000 units

async function signQuorum(attestationId: Hex, score: number) {
  const ts = Math.floor(Date.now() / 1000);
  const sigs = await Promise.all(operators.map((op) => signAs(op, attestationId, score, ts)));
  return sigs.map((s) => ({drs: s.drs, timestamp: BigInt(s.timestamp), signature: s.signature}));
}

async function submit(fn: "updateAIScore" | "updateOffchainD", attestationId: Hex, score: number): Promise<Hex> {
  const sigs = await signQuorum(attestationId, score);
  const nonce = await publicClient.getTransactionCount({address: account.address, blockTag: "pending"});
  const send = async (n: number): Promise<Hex> => {
    try {
      return await wallet.writeContract({address: config.registryAddress, abi: REGISTRY_ABI, functionName: fn, args: [attestationId, sigs], nonce: n});
    } catch (e) {
      const m = (e instanceof Error ? e.message : "").match(/next nonce (\d+)/);
      if (m) return send(Number(m[1]));
      throw e;
    }
  };
  return send(nonce);
}

function elapsed(lastUpdate: bigint, delta: number, now: number): boolean {
  const interval = delta > LARGE_DELTA ? LARGE_DELTA_INTERVAL : MIN_UPDATE_INTERVAL;
  return now >= Number(lastUpdate) + interval;
}

async function main() {
  const attestationId = (process.env.ATTESTATION_ID ?? process.argv[2]) as Hex;
  if (!attestationId || !/^0x[0-9a-fA-F]{64}$/.test(attestationId)) throw new Error("ATTESTATION_ID (bytes32) required");

  const rec = (await publicClient.readContract({
    address: config.registryAddress,
    abi: REGISTRY_ABI,
    functionName: "getRecord",
    args: [attestationId],
  })) as {aiReplicabilityScore: number; offchainD: number; lastAiUpdate: bigint; lastOffchainDUpdate: bigint; ipfsCid: string; disputed: boolean};

  if (rec.disputed) throw new Error("attestation is disputed (frozen); cannot update");
  console.log(`record: A=${rec.aiReplicabilityScore} D=${rec.offchainD} ipfsCid=${rec.ipfsCid}`);

  const src = process.env.CONTENT_URL;
  const bytes = src
    ? Buffer.from(await (await fetch(src, {headers: {"User-Agent": "Mozilla/5.0"}})).arrayBuffer())
    : await fetchFromIpfs(rec.ipfsCid);

  const a = await analyze({type: "image", bytes});
  const newA = toScore16(a.risk.a);
  const newD = toScore16(a.risk.d);
  const now = Math.floor(Date.now() / 1000);
  console.log(`re-scored: A=${newA} D=${newD}`);

  const dA = Math.abs(newA - rec.aiReplicabilityScore);
  const dD = Math.abs(newD - rec.offchainD);
  let acted = false;

  if (dA >= UPDATE_MIN_DELTA && elapsed(rec.lastAiUpdate, dA, now)) {
    const tx = await submit("updateAIScore", attestationId, newA);
    console.log(`updateAIScore ${rec.aiReplicabilityScore} -> ${newA}  tx ${tx}`);
    await publicClient.waitForTransactionReceipt({hash: tx});
    acted = true;
  } else if (dA >= UPDATE_MIN_DELTA) {
    console.log(`A change ${dA} pending timelock (lastAiUpdate ${rec.lastAiUpdate})`);
  }

  if (dD >= UPDATE_MIN_DELTA && elapsed(rec.lastOffchainDUpdate, dD, now)) {
    const tx = await submit("updateOffchainD", attestationId, newD);
    console.log(`updateOffchainD ${rec.offchainD} -> ${newD}  tx ${tx}`);
    await publicClient.waitForTransactionReceipt({hash: tx});
    acted = true;
  } else if (dD >= UPDATE_MIN_DELTA) {
    console.log(`D change ${dD} pending timelock (lastOffchainDUpdate ${rec.lastOffchainDUpdate})`);
  }

  console.log(acted ? "\n✅ keeper submitted update(s)." : "\nNo update needed (within delta/timelock).");
  process.exit(0);
}

main().catch((e) => {
  console.error("❌", e instanceof Error ? e.message : e);
  process.exit(1);
});
