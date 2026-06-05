/**
 * End-to-end on-chain smoke test. Plays the role the frontend will play:
 *   1. analyze real content (fingerprint + D + A),
 *   2. buildAttestation → EIP-712 operator signatures,
 *   3. submit registry.attest{value: attestFee}(...) with a funded wallet,
 *   4. read the attestation + its on-chain DRS back.
 *
 * Submits a REAL transaction on Unichain Sepolia using ORACLE_OPERATOR_KEY (the
 * deployer, which is funded). Owner == tx sender, matching computeAttestationId.
 *
 *   npm run smoke
 */
import {createWalletClient, http, formatEther, toHex} from "viem";
import {privateKeyToAccount} from "viem/accounts";
import {randomBytes} from "node:crypto";
import {config} from "../src/config.js";
import {unichainSepolia, publicClient, registryAttestFee, isAttested} from "../src/chain.js";
import {REGISTRY_ABI} from "../src/abi.js";
import {analyze, buildAttestation} from "../src/pipeline.js";

const account = privateKeyToAccount(config.operatorKey);
const wallet = createWalletClient({account, chain: unichainSepolia, transport: http(config.rpcUrl)});

async function fetchBytes(url: string): Promise<Buffer> {
  const res = await fetch(url, {headers: {"User-Agent": "Mozilla/5.0"}});
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  console.log("Sender / owner / operator:", account.address);
  const bal = await publicClient.getBalance({address: account.address});
  console.log("Balance:", formatEther(bal), "ETH");

  // A unique image per run so the attestationId is fresh (no AlreadyAttested revert).
  const seed = toHex(randomBytes(6)).slice(2);
  const url = `https://picsum.photos/seed/veritas-${seed}/384/384`;
  console.log("Content:", url);

  const analysis = await analyze({type: "image", bytes: await fetchBytes(url)});
  const pct = (x: number) => (x * 100).toFixed(1) + "%";
  console.log(`Risk: D=${pct(analysis.risk.d)} A=${pct(analysis.risk.a)} DRS=${pct(analysis.risk.drs)} gated=${analysis.risk.gated}`);

  const ipfsCid = `ipfs://veritas-smoke-${seed}`;
  const att = await buildAttestation(analysis, account.address, ipfsCid);
  console.log("attestationId:", att.attestationId);
  console.log("aiSigs:", att.aiSigs.length, "dSigs:", att.dSigs.length);

  if (await isAttested(att.attestationId)) {
    console.log("Already attested - nothing to submit.");
    return;
  }

  const fee = await registryAttestFee();
  console.log("attestFee:", formatEther(fee), "ETH - submitting attest()…");

  const toAbi = (sigs: typeof att.aiSigs) =>
    sigs.map((s) => ({drs: s.drs, timestamp: BigInt(s.timestamp), signature: s.signature}));

  // The load-balanced public RPC can hand out a stale nonce; fetch pending and
  // retry once on "nonce too low" using the node's suggested next nonce.
  async function submit(nonce?: number): Promise<`0x${string}`> {
    try {
      return await wallet.writeContract({
        address: config.registryAddress,
        abi: REGISTRY_ABI,
        functionName: "attest",
        args: [att.pHash, att.blockHash, ipfsCid, toAbi(att.aiSigs), toAbi(att.dSigs)],
        value: fee,
        ...(nonce !== undefined ? {nonce} : {}),
      });
    } catch (e) {
      const m = (e instanceof Error ? e.message : "").match(/next nonce (\d+)/);
      if (m) return submit(Number(m[1]));
      throw e;
    }
  }
  const pending = await publicClient.getTransactionCount({address: account.address, blockTag: "pending"});
  const hash = await submit(pending);
  console.log("tx:", hash);
  const receipt = await publicClient.waitForTransactionReceipt({hash});
  console.log("status:", receipt.status, "block:", receipt.blockNumber, "gasUsed:", receipt.gasUsed.toString());

  // The public RPC is load-balanced; reads can briefly lag a freshly-mined block.
  let attested = false;
  for (let i = 0; i < 6 && !attested; i++) {
    attested = await isAttested(att.attestationId);
    if (!attested) await new Promise((r) => setTimeout(r, 1500));
  }
  const drs = await publicClient.readContract({
    address: config.registryAddress,
    abi: REGISTRY_ABI,
    functionName: "getCurrentDRS",
    args: [att.attestationId],
  });
  console.log("isAttested:", attested ? "✅" : "❌", " on-chain getCurrentDRS:", drs, `(${(Number(drs) / 100).toFixed(1)}%)`);
  console.log("Explorer:", `https://sepolia.uniscan.xyz/tx/${hash}`);

  if (receipt.status !== "success" || !attested) throw new Error("attest did not land");
  console.log("\n✅ End-to-end: oracle-signed attestation is live on Unichain Sepolia.");
  process.exit(0); // avoid noisy native-module teardown (better-sqlite3 / onnxruntime)
}

main().catch((e) => {
  console.error("❌", e instanceof Error ? e.message : e);
  process.exit(1);
});
