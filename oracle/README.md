# Veritas Oracle Service

The off-chain risk engine for [Veritas Protocol](../README.md). It fingerprints
content, computes the real **Dilution Risk Score** channels (D + A), and returns
the **EIP-712 operator signatures** that `VeritasRegistry.attest(...)` verifies
on-chain. The browser never sees the operator key - only the signatures.

```
content ──▶ fingerprint (pHash + blockhash)
        ──▶ D  duplicate density  : DINOv2 embedding vs sqlite-vec corpus, 1 - exp(-λ·Σ sim^β)
        ──▶ A  AI replicability   : image = SMOGY (ONNX) · text = RoBERTa (ONNX) · audio = stub
        ──▶ DRS = noisy-OR(D, A)
        ──▶ sign A and offchain-D (EIP-712) ──▶ frontend submits attest{value: fee}(...)
```

## Stack (free, Node-pure)

| Concern | Choice |
| --- | --- |
| Runtime | Node 20+ · TypeScript · Fastify · viem |
| Inference | `@huggingface/transformers` (transformers.js) on `onnxruntime-node`, CPU, **q8** weights |
| Image embedding (D) | `onnx-community/dinov2-with-registers-base` - robust to crop/resize/recompress |
| Image AI (A) | `onnx-community/SMOGY-Ai-images-detector-ONNX` |
| Text AI (A) | `onnx-community/chatgpt-detector-roberta-ONNX` |
| Corpus | `sqlite-vec` (cosine KNN) - the owned, growing reference set |

> **A is a soft signal, never a verdict.** Modern image detectors over- and
> under-fire on the newest generators; A only nudges the DRS via noisy-OR, and the
> trustless on-chain D floor (`saturateD(dilutionCount)`) bounds how far any single
> signal can move the fee.
>
> **Known quirk:** the SMOGY ONNX export ships an **inverted `id2label`** (verified
> across 6 real/AI samples). `detectors/imageAi.ts` corrects it: `P(AI) =
> score(raw label "human")`. Pinned and asserted so a fixed re-export fails loudly.

## Run

```bash
cd oracle
npm install
cp .env.example .env          # ORACLE_OPERATOR_KEY must be a registered oracle operator
npm run seed                  # seed the corpus (downloads reference images once)
npm run dev                   # http://localhost:8787
```

`ORACLE_OPERATOR_KEY` must be the key of an address registered as an operator on
the live `VeritasOracle`. That contract was deployed quorum=1 with the deployer as
the sole operator, so use the deployer key. The shape generalizes to N operators
(run N instances with different keys / different detector ensembles).

## Endpoints

- `GET  /health` - operator, contract addresses, corpus counts, model ids.
- `POST /analyze` - `{type, url|dataBase64|text}` → `{pHash, blockHash, risk}`. Preview, no signatures, no chain.
- `POST /attest` - `{type, owner, ipfsCid?, url|dataBase64|text}` → the full signed payload (`pHash, blockHash, aiSigs, dSigs, risk, attestationId`). The frontend submits it with the owner's wallet.

`owner` **must** equal the wallet that submits the tx - the attestation id binds
the fingerprints to the owner (`keccak256(abi.encode(pHash, blockHash, owner))`).

## Scripts

- `npm run seed` - populate the corpus (distinct photos + one near-dup cluster).
- `npm run smoke` - full on-chain proof: analyze → sign → submit a real `attest`
  tx on Unichain Sepolia → read it back. Spends a little testnet ETH.
- `tsx scripts/verify-signing.ts` - read-only proof the operator signature passes
  the live oracle and the local attestation id matches the contract.

## Verified end-to-end (2026-06-05)

- Operator signatures accepted by the live `VeritasOracle`; canonical DRS == signed score.
- pHash/blockhash near-dup separation (pHash 2 vs 22, blockhash 4 vs 36 Hamming).
- DINOv2 on real photos: near-dup cosine 0.93-0.96, distinct 0.19-0.25.
- Demo tiers: Unique D0/A0 (open) · Widely-copied D97 (100% corpus match, gated) · AI-face A100 (gated).
- Real `attest` landed on Unichain Sepolia (`getCurrentDRS` read back on-chain).
