/**
 * Attests a piece of content with a REAL, pinned IPFS CID (via Pinata), proving the
 * end-to-end IPFS path. The content bytes are pinned first, and the returned UnixFS
 * CID is what lands on-chain as ipfsCid (retrievable through a gateway).
 *
 *   tsx scripts/attest-with-ipfs.ts
 */
import {createWalletClient, http, formatEther} from "viem";
import {privateKeyToAccount} from "viem/accounts";
import {config} from "../src/config.js";
import {unichainSepolia, publicClient, registryAttestFee, isAttested} from "../src/chain.js";
import {REGISTRY_ABI} from "../src/abi.js";
import {analyze, buildAttestation} from "../src/pipeline.js";
import {pinContent} from "../src/ipfs.js";

const account = privateKeyToAccount(config.operatorKey);
const wallet = createWalletClient({account, chain: unichainSepolia, transport: http(config.rpcUrl)});

const URL = "https://picsum.photos/id/1043/384/384";
const FILENAME = "veritas-ipfs-demo.jpg";

const toAbi = (s: Awaited<ReturnType<typeof buildAttestation>>["aiSigs"]) =>
  s.map((x) => ({drs: x.drs, timestamp: BigInt(x.timestamp), signature: x.signature}));

async function main() {
  if (!config.pinataJwt) throw new Error("PINATA_JWT not set in oracle/.env");
  const bytes = Buffer.from(await (await fetch(URL, {headers: {"User-Agent": "Mozilla/5.0"}})).arrayBuffer());

  // 1. Pin the real bytes to IPFS via Pinata.
  const pin = await pinContent(bytes, FILENAME);
  console.log(`Pinned: ${pin.uri}  (pinned=${pin.pinned})`);
  console.log(`Gateway: ${config.ipfsGateway}${pin.cid}`);
  if (!pin.pinned) throw new Error("Pinata pin failed (fell back to local CID) - check PINATA_JWT");

  // 2. Score + build the attestation with the REAL ipfs uri.
  const analysis = await analyze({type: "image", bytes});
  const pct = (x: number) => (x * 100).toFixed(1) + "%";
  console.log(`Risk: D=${pct(analysis.risk.d)} A=${pct(analysis.risk.a)} DRS=${pct(analysis.risk.drs)} gated=${analysis.risk.gated}`);
  const att = await buildAttestation(analysis, account.address, pin.uri);
  console.log("attestationId:", att.attestationId);

  if (await isAttested(att.attestationId)) {
    console.log("Already attested - reusing.");
    process.exit(0);
  }

  // 3. Submit on-chain with the real CID.
  const fee = await registryAttestFee();
  const hash = await wallet.writeContract({
    address: config.registryAddress,
    abi: REGISTRY_ABI,
    functionName: "attest",
    args: [att.pHash, att.blockHash, pin.uri, toAbi(att.aiSigs), toAbi(att.dSigs)],
    value: fee,
  });
  const r = await publicClient.waitForTransactionReceipt({hash});
  if (r.status !== "success") throw new Error("attest failed");
  console.log(`OK attest tx ${hash} (fee ${formatEther(fee)} ETH, block ${r.blockNumber})`);
  console.log(`\nATTESTATION_ID=${att.attestationId}\nIPFS_URI=${pin.uri}`);
  process.exit(0);
}

main().catch((e) => {
  console.error("attest-with-ipfs failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
