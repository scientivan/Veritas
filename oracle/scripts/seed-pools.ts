/**
 * Seeds a handful of low-DRS, authentic-photo attestations owned by the operator so
 * /pools shows a realistic, fully on-chain mix (most real content is low risk). Any
 * non-gated id printed here can be fed to script/DeployPool.s.sol as ATTESTATION_ID.
 *
 *   tsx scripts/seed-pools.ts
 */
import {createWalletClient, http, formatEther} from "viem";
import {privateKeyToAccount} from "viem/accounts";
import {config} from "../src/config.js";
import {unichainSepolia, publicClient, registryAttestFee, isAttested} from "../src/chain.js";
import {REGISTRY_ABI} from "../src/abi.js";
import {analyze, buildAttestation} from "../src/pipeline.js";

const account = privateKeyToAccount(config.operatorKey);
const wallet = createWalletClient({account, chain: unichainSepolia, transport: http(config.rpcUrl)});

// Stable Picsum photo ids (real photographs -> the AI detector passes them, DRS low).
const PHOTOS = [
  {id: 1003, label: "mountain-ridge"},
  {id: 1015, label: "river-canyon"},
  {id: 1025, label: "studio-dog"},
];

const toAbi = (s: Awaited<ReturnType<typeof buildAttestation>>["aiSigs"]) =>
  s.map((x) => ({drs: x.drs, timestamp: BigInt(x.timestamp), signature: x.signature}));

async function main() {
  const pct = (x: number) => (x * 100).toFixed(1) + "%";
  for (const p of PHOTOS) {
    const url = `https://picsum.photos/id/${p.id}/384/384`;
    const bytes = Buffer.from(await (await fetch(url, {headers: {"User-Agent": "Mozilla/5.0"}})).arrayBuffer());
    const analysis = await analyze({type: "image", bytes});
    const ipfsCid = `ipfs://veritas/${p.label}`;
    const att = await buildAttestation(analysis, account.address, ipfsCid);
    const tag = `${p.label} (${att.attestationId.slice(0, 10)}) D=${pct(analysis.risk.d)} A=${pct(analysis.risk.a)} DRS=${pct(analysis.risk.drs)} gated=${analysis.risk.gated}`;

    if (await isAttested(att.attestationId)) {
      console.log(`SKIP already attested: ${tag}`);
      continue;
    }
    const fee = await registryAttestFee();
    const hash = await wallet.writeContract({
      address: config.registryAddress,
      abi: REGISTRY_ABI,
      functionName: "attest",
      args: [att.pHash, att.blockHash, ipfsCid, toAbi(att.aiSigs), toAbi(att.dSigs)],
      value: fee,
    });
    const r = await publicClient.waitForTransactionReceipt({hash});
    console.log(`${r.status === "success" ? "OK" : "FAIL"} ${tag}  poolable=${!analysis.risk.gated}  ATTESTATION_ID=${att.attestationId}`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error("seed-pools failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
