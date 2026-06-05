/**
 * Critical-path proof: sign a DRS score and confirm the LIVE VeritasOracle
 * accepts it, and that our local computeAttestationId matches the contract's.
 * No transaction is sent - both checks are read-only against chain 1301.
 *
 *   npm run -s smoke:sign      (alias)  or  tsx scripts/verify-signing.ts
 */
import {keccak256, toBytes, type Hex} from "viem";
import {config} from "../src/config.js";
import {computeAttestationId} from "../src/attestation.js";
import {signScore, operatorAddress} from "../src/signer.js";
import {oracleIsValid, oracleVerify, publicClient} from "../src/chain.js";
import {REGISTRY_ABI} from "../src/abi.js";

const owner = operatorAddress; // any address works for the id check
const pHash = keccak256(toBytes("veritas-demo-phash")) as Hex;
const blockHash = keccak256(toBytes("veritas-demo-blockhash")) as Hex;

async function main() {
  console.log("Operator (signer):", operatorAddress);

  // 1) attestationId parity with the contract.
  const localId = computeAttestationId(pHash, blockHash, owner);
  const chainId = (await publicClient.readContract({
    address: config.registryAddress,
    abi: REGISTRY_ABI,
    functionName: "computeAttestationId",
    args: [pHash, blockHash, owner],
  })) as Hex;
  const idMatch = localId.toLowerCase() === chainId.toLowerCase();
  console.log("attestationId local :", localId);
  console.log("attestationId chain :", chainId);
  console.log("attestationId match :", idMatch ? "✅" : "❌");
  if (!idMatch) throw new Error("attestationId mismatch - encoding diverged from the contract");

  // 2) Sign an A score and a D score, confirm the oracle accepts each batch.
  const aScore = 1200; // 0.12
  const dScore = 3400; // 0.34
  const aiSig = await signScore(localId, aScore);
  const dSig = await signScore(localId, dScore);

  const aiValid = await oracleIsValid(localId, [aiSig]);
  const dValid = await oracleIsValid(localId, [dSig]);
  console.log(`A sig valid (score ${aScore}):`, aiValid ? "✅" : "❌");
  console.log(`D sig valid (score ${dScore}):`, dValid ? "✅" : "❌");

  const canonicalA = await oracleVerify(localId, [aiSig]);
  console.log("oracle.verify(A) canonical DRS:", canonicalA);

  if (!aiValid || !dValid) throw new Error("oracle rejected a signature - check operator key / domain");
  if (Number(canonicalA) !== aScore) throw new Error("canonical DRS != signed score (quorum != 1?)");

  console.log("\n✅ Critical signing path verified against the live oracle.");
}

main().catch((e) => {
  console.error("❌", e instanceof Error ? e.message : e);
  process.exit(1);
});
