/**
 * Attest 4 unique images to create low-DRS attestations for ETH-ratio pool deployment.
 * Each image represents a different "user-tokenized asset" content type.
 * Runs sequentially so any duplicates between images are detected.
 *
 *   tsx scripts/attest-batch-eth-pools.ts
 */
import {createWalletClient, http, formatEther} from "viem";
import {privateKeyToAccount} from "viem/accounts";
import {config} from "../src/config.js";
import {unichainSepolia, publicClient, registryAttestFee, isAttested} from "../src/chain.js";
import {REGISTRY_ABI} from "../src/abi.js";
import {analyze, buildAttestation} from "../src/pipeline.js";

const account = privateKeyToAccount(config.operatorKey);
const wallet = createWalletClient({account, chain: unichainSepolia, transport: http(config.rpcUrl)});

const ASSETS = [
  {url: "https://picsum.photos/id/175/320/320", cid: "ipfs://veritas/eth-pool-portrait",   label: "Portrait"},
  {url: "https://picsum.photos/id/395/320/320", cid: "ipfs://veritas/eth-pool-forest",     label: "Forest"},
  {url: "https://picsum.photos/id/870/320/320", cid: "ipfs://veritas/eth-pool-urban",      label: "Urban"},
  {url: "https://picsum.photos/id/982/320/320", cid: "ipfs://veritas/eth-pool-landscape",  label: "Landscape"},
];

async function attestOne(asset: typeof ASSETS[0]) {
  console.log(`\n[${asset.label}] Fetching ${asset.url}`);
  const bytes = Buffer.from(
    await (await fetch(asset.url, {headers: {"User-Agent": "Mozilla/5.0"}})).arrayBuffer()
  );

  const analysis = await analyze({type: "image", bytes});
  const pct = (x: number) => (x * 100).toFixed(1) + "%";
  console.log(`[${asset.label}] D=${pct(analysis.risk.d)} A=${pct(analysis.risk.a)} DRS=${pct(analysis.risk.drs)} gated=${analysis.risk.gated}`);

  if (analysis.risk.gated) {
    console.warn(`[${asset.label}] GATED - skipping`);
    return null;
  }

  const att = await buildAttestation(analysis, account.address, asset.cid);
  console.log(`[${asset.label}] attestationId: ${att.attestationId}`);

  if (await isAttested(att.attestationId)) {
    console.log(`[${asset.label}] Already attested - reusing id.`);
    return att.attestationId;
  }

  const fee = await registryAttestFee();
  const toAbi = (s: typeof att.aiSigs) =>
    s.map((x) => ({drs: x.drs, timestamp: BigInt(x.timestamp), signature: x.signature}));

  const hash = await wallet.writeContract({
    address: config.registryAddress,
    abi: REGISTRY_ABI,
    functionName: "attest",
    args: [att.pHash, att.blockHash, asset.cid, toAbi(att.aiSigs), toAbi(att.dSigs)],
    value: fee,
  });
  console.log(`[${asset.label}] tx: ${hash} | value: ${formatEther(fee)} ETH`);
  const r = await publicClient.waitForTransactionReceipt({hash});
  if (r.status !== "success") throw new Error(`attest failed for ${asset.label}`);
  console.log(`[${asset.label}] confirmed block ${r.blockNumber}`);
  return att.attestationId;
}

async function main() {
  const results: string[] = [];
  for (const asset of ASSETS) {
    const id = await attestOne(asset);
    if (id) results.push(id);
  }

  console.log("\n=== Attestation IDs for pool deployment ===");
  results.forEach((id, i) => console.log(`ATTESTATION_${i + 1}=${id}`));
  process.exit(0);
}

main().catch((e) => {
  console.error("Error:", e instanceof Error ? e.message : e);
  process.exit(1);
});
