import {createWalletClient, http, formatEther} from "viem";
import {privateKeyToAccount} from "viem/accounts";
import {config} from "../src/config.js";
import {unichainSepolia, publicClient, registryAttestFee, isAttested} from "../src/chain.js";
import {REGISTRY_ABI} from "../src/abi.js";
import {analyze, buildAttestation} from "../src/pipeline.js";

const account = privateKeyToAccount(config.operatorKey);
const wallet = createWalletClient({account, chain: unichainSepolia, transport: http(config.rpcUrl)});

async function main() {
  const URL = "https://picsum.photos/id/982/320/320";
  const CID = "ipfs://veritas/eth-pool-landscape";

  const bytes = Buffer.from(
    await (await fetch(URL, {headers: {"User-Agent": "Mozilla/5.0"}})).arrayBuffer()
  );
  const analysis = await analyze({type: "image", bytes});
  const pct = (x: number) => (x * 100).toFixed(1) + "%";
  console.log(`D=${pct(analysis.risk.d)} A=${pct(analysis.risk.a)} DRS=${pct(analysis.risk.drs)} gated=${analysis.risk.gated}`);
  if (analysis.risk.gated) throw new Error("content is gated");

  const att = await buildAttestation(analysis, account.address, CID);
  console.log("attestationId:", att.attestationId);

  if (await isAttested(att.attestationId)) {
    console.log("Already attested.");
    console.log("\nATTESTATION_4=" + att.attestationId);
    process.exit(0);
  }

  const fee = await registryAttestFee();
  const toAbi = (s: typeof att.aiSigs) =>
    s.map((x) => ({drs: x.drs, timestamp: BigInt(x.timestamp), signature: x.signature}));

  const hash = await wallet.writeContract({
    address: config.registryAddress,
    abi: REGISTRY_ABI,
    functionName: "attest",
    args: [att.pHash, att.blockHash, CID, toAbi(att.aiSigs), toAbi(att.dSigs)],
    value: fee,
  });
  console.log("tx:", hash, "| value:", formatEther(fee), "ETH");
  const r = await publicClient.waitForTransactionReceipt({hash});
  if (r.status !== "success") throw new Error("attest failed");
  console.log("confirmed block:", r.blockNumber.toString());
  console.log("\nATTESTATION_4=" + att.attestationId);
  process.exit(0);
}

main().catch((e) => {
  console.error("Error:", e instanceof Error ? e.message : e);
  process.exit(1);
});
