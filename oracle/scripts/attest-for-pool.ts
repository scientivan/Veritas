/**
 * Create a LOW-DRS attestation owned by the deployer so a Uniswap v4 pool can be
 * opened through the hook (registerPool requires msg.sender == owner and DRS <=
 * gate). Prints the attestationId for the pool deploy script.
 *
 *   tsx scripts/attest-for-pool.ts
 */
import {createWalletClient, http, formatEther} from "viem";
import {privateKeyToAccount} from "viem/accounts";
import {config} from "../src/config.js";
import {unichainSepolia, publicClient, registryAttestFee, isAttested} from "../src/chain.js";
import {REGISTRY_ABI} from "../src/abi.js";
import {analyze, buildAttestation} from "../src/pipeline.js";

const account = privateKeyToAccount(config.operatorKey);
const wallet = createWalletClient({account, chain: unichainSepolia, transport: http(config.rpcUrl)});

// A unique, in-the-clear photo: DINOv2 finds no near-dup and the AI detector passes it -> DRS ~0.
const URL = "https://picsum.photos/id/99/320/320";

async function main() {
  const bytes = Buffer.from(await (await fetch(URL, {headers: {"User-Agent": "Mozilla/5.0"}})).arrayBuffer());
  const analysis = await analyze({type: "image", bytes});
  const pct = (x: number) => (x * 100).toFixed(1) + "%";
  console.log(`Risk: D=${pct(analysis.risk.d)} A=${pct(analysis.risk.a)} DRS=${pct(analysis.risk.drs)} gated=${analysis.risk.gated}`);
  if (analysis.risk.gated) throw new Error("content is gated; pick lower-DRS content");

  const ipfsCid = "ipfs://veritas/pool-demo-unique";
  const att = await buildAttestation(analysis, account.address, ipfsCid);
  console.log("attestationId:", att.attestationId);

  if (await isAttested(att.attestationId)) {
    console.log("Already attested - reuse this id for the pool.");
    return done(att.attestationId);
  }

  const fee = await registryAttestFee();
  const toAbi = (s: typeof att.aiSigs) => s.map((x) => ({drs: x.drs, timestamp: BigInt(x.timestamp), signature: x.signature}));
  const hash = await wallet.writeContract({
    address: config.registryAddress,
    abi: REGISTRY_ABI,
    functionName: "attest",
    args: [att.pHash, att.blockHash, ipfsCid, toAbi(att.aiSigs), toAbi(att.dSigs)],
    value: fee,
  });
  console.log("attest tx:", hash, "| value", formatEther(fee), "ETH");
  const r = await publicClient.waitForTransactionReceipt({hash});
  if (r.status !== "success") throw new Error("attest failed");
  console.log("status: success, block", r.blockNumber.toString());
  done(att.attestationId);
}

function done(id: string) {
  console.log("\nATTESTATION_ID=" + id);
  process.exit(0);
}

main().catch((e) => {
  console.error("❌", e instanceof Error ? e.message : e);
  process.exit(1);
});
