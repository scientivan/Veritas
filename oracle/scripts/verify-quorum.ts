/**
 * Proof that the 2-of-3 multi-operator signatures pass the LIVE oracle (read-only).
 * Builds a real attestation (3 co-signers) and calls oracle.isValid / oracle.verify.
 *
 *   tsx scripts/verify-quorum.ts
 */
import {analyze, buildAttestation} from "../src/pipeline.js";
import {oracleIsValid, oracleVerify} from "../src/chain.js";
import {operators} from "../src/operators.js";

const DEPLOYER = "0x490a2F2fE7fB40003585333D5df3C4588f33F11f" as const;

async function main() {
  console.log("operators in service:", operators.map((o) => `${o.kind}:${o.address.slice(0, 8)}`).join("  "));

  const url = "https://picsum.photos/id/237/320/320"; // widely-copied -> high D, exercises dSigners
  const bytes = Buffer.from(await (await fetch(url, {headers: {"User-Agent": "Mozilla/5.0"}})).arrayBuffer());
  const analysis = await analyze({type: "image", bytes});
  const att = await buildAttestation(analysis, DEPLOYER, "ipfs://veritas/quorum-check");

  console.log(`D=${(analysis.risk.d * 100).toFixed(0)}% A=${(analysis.risk.a * 100).toFixed(0)}%`);
  console.log(`aiSigs=${att.aiSigs.length} dSigs=${att.dSigs.length} (quorum on-chain = 2)`);

  const aiValid = await oracleIsValid(att.attestationId, att.aiSigs);
  const dValid = await oracleIsValid(att.attestationId, att.dSigs);
  const aiCanon = await oracleVerify(att.attestationId, att.aiSigs);
  const dCanon = await oracleVerify(att.attestationId, att.dSigs);

  console.log(`oracle.isValid(aiSigs): ${aiValid ? "✅" : "❌"}  canonical A = ${aiCanon}`);
  console.log(`oracle.isValid(dSigs):  ${dValid ? "✅" : "❌"}  canonical D = ${dCanon}`);

  // Also prove quorum is enforced: a single signature must now be REJECTED.
  const onlyOne = await oracleIsValid(att.attestationId, [att.aiSigs[0]!]);
  console.log(`single sig rejected (quorum=2 enforced): ${onlyOne ? "❌ still valid!" : "✅ rejected"}`);

  if (!aiValid || !dValid || onlyOne) throw new Error("quorum verification failed");
  console.log("\n✅ 2-of-3 multi-operator signatures verified against the live oracle.");
  process.exit(0);
}

main().catch((e) => {
  console.error("❌", e instanceof Error ? e.message : e);
  process.exit(1);
});
