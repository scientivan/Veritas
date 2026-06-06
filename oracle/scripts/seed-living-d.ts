/**
 * Seeds a near-duplicate PAIR on Unichain to prove the trustless living-D channel.
 *
 * Same image, two different owners => identical fingerprints (Hamming distance 0,
 * well within the callback's threshold) but distinct attestationIds. Attestation A
 * is submitted first (owner = operator), then B (owner = burner). B's NewAttestation
 * is what the deployed DilutionMonitorRSC reacts to on Reactive Lasna; the callback
 * runs getNearDuplicates(B) on Unichain, finds A, and increments dilution on both -
 * with no oracle/keeper in the loop.
 *
 *   BURNER_KEY=0x.. tsx scripts/seed-living-d.ts
 */
import {createWalletClient, http, formatEther, type Hex} from "viem";
import {privateKeyToAccount} from "viem/accounts";
import {config} from "../src/config.js";
import {unichainSepolia, publicClient, registryAttestFee, isAttested} from "../src/chain.js";
import {REGISTRY_ABI} from "../src/abi.js";
import {analyze, buildAttestation} from "../src/pipeline.js";

const operator = privateKeyToAccount(config.operatorKey);
const burnerKey = (process.env.BURNER_KEY ?? "") as Hex;
if (!burnerKey) throw new Error("BURNER_KEY env required (the 0xf9B3ad burner)");
const burner = privateKeyToAccount(burnerKey);

const operatorWallet = createWalletClient({account: operator, chain: unichainSepolia, transport: http(config.rpcUrl)});
const burnerWallet = createWalletClient({account: burner, chain: unichainSepolia, transport: http(config.rpcUrl)});

// One in-the-clear photo. A unique seed avoids colliding with prior attestations.
const URL = "https://picsum.photos/seed/veritas-living-d-demo/384/384";

const toAbi = (s: Awaited<ReturnType<typeof buildAttestation>>["aiSigs"]) =>
  s.map((x) => ({drs: x.drs, timestamp: BigInt(x.timestamp), signature: x.signature}));

async function submit(wallet: typeof operatorWallet, att: Awaited<ReturnType<typeof buildAttestation>>, label: string) {
  if (await isAttested(att.attestationId)) {
    console.log(`${label}: already attested ${att.attestationId}`);
    return;
  }
  const fee = await registryAttestFee();
  const hash = await wallet.writeContract({
    address: config.registryAddress,
    abi: REGISTRY_ABI,
    functionName: "attest",
    args: [att.pHash, att.blockHash, att.ipfsCid, toAbi(att.aiSigs), toAbi(att.dSigs)],
    value: fee,
  });
  const r = await publicClient.waitForTransactionReceipt({hash});
  if (r.status !== "success") throw new Error(`${label} attest failed`);
  console.log(`${label}: ${att.attestationId}  (tx ${hash}, fee ${formatEther(fee)} ETH, block ${r.blockNumber})`);
}

async function main() {
  const bytes = Buffer.from(await (await fetch(URL, {headers: {"User-Agent": "Mozilla/5.0"}})).arrayBuffer());
  const analysis = await analyze({type: "image", bytes});
  const pct = (x: number) => (x * 100).toFixed(1) + "%";
  console.log(`Content risk at attest time: D=${pct(analysis.risk.d)} A=${pct(analysis.risk.a)} DRS=${pct(analysis.risk.drs)}`);
  console.log(`pHash=${analysis.pHash}\nblockHash=${analysis.blockHash}\n`);

  const attA = await buildAttestation(analysis, operator.address, "ipfs://veritas/living-d-A");
  const attB = await buildAttestation(analysis, burner.address, "ipfs://veritas/living-d-B");

  // Order matters: A first (nothing to dilute yet), then B (RSC sees B, finds A).
  await submit(operatorWallet, attA, "A (operator)");
  await submit(burnerWallet, attB, "B (burner, TRIGGER)");

  console.log("\nWatch the RSC react on Reactscan Lasna, then poll dilutionCount on A:");
  console.log(`  TRIGGER_ID(B)=${attB.attestationId}`);
  console.log(`  WATCH_ID(A)=${attA.attestationId}`);
  process.exit(0);
}

main().catch((e) => {
  console.error("seed-living-d failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
