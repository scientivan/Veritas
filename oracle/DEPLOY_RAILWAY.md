# Deploy the Veritas oracle to Railway (plain Node, no Docker)

Railway builds this as a normal Node service via Nixpacks (no Dockerfile needed - same
runtime weight as Docker, just simpler). The repo is already prepared:

- `tsx` moved to `dependencies` so `npm start` runs in production.
- `data/corpus.db` (the seeded D corpus) is committed so the hosted oracle has its baseline.
- `railway.json` pins the start command + `/health` healthcheck.
- The server already binds `0.0.0.0` and reads Railway's `PORT`.

## 1. Create the service

Option A - GitHub (recommended):
1. Push this repo to GitHub.
2. Railway -> New Project -> Deploy from GitHub repo -> pick the repo.
3. In the service Settings, set **Root Directory = `oracle`** (this is a monorepo; Railway must build the `oracle/` subfolder).

Option B - CLI:
```bash
npm i -g @railway/cli
railway login
cd oracle
railway init        # create/link a project
railway up          # uploads + builds this folder
```

## 2. Set environment variables (Railway -> Variables)

Copy the values from your local `oracle/.env` (do NOT paste secrets into git):

| Variable | Value | Notes |
| --- | --- | --- |
| `REGISTRY_ADDRESS` | `0xe359bdB2cA1A152Ae62E2496F140ea192Ce0d824` | required |
| `ORACLE_ADDRESS` | `0x45b327808f4D719C574D4508DD46a8E7b4124bd3` | required |
| `ORACLE_OPERATOR_KEY` | (from oracle/.env) | **secret** - op1 signer |
| `ORACLE_OPERATOR_KEY_2` | (from oracle/.env) | **secret** - enables 2-of-3 |
| `ORACLE_OPERATOR_KEY_3` | (from oracle/.env) | **secret** - enables 2-of-3 |
| `CHAIN_ID` | `1301` | optional (default) |
| `RPC_URL` | `https://sepolia.unichain.org` | optional (default) |
| `PINATA_JWT` | (from oracle/.env) | **secret** - real IPFS pinning |
| `CORS_ORIGIN` | your frontend origin, e.g. `https://<your-app>.vercel.app` | comma-separated; add localhost for local dev |
| `IMAGE_AI_TEMPERATURE` | `1.5` | optional (A over-fire calibration) |

Do NOT set `PORT` - Railway injects it and the server reads it.

## 3. Wire the frontend

Set `NEXT_PUBLIC_ORACLE_URL` on the frontend host (e.g. Vercel) to the Railway public URL
(`https://<service>.up.railway.app`), then redeploy the frontend. Also make sure that frontend
origin is in the oracle's `CORS_ORIGIN`.

## Caveats (read these)

- **Cost:** Railway has no permanent free tier - new accounts get a one-time ~$5 trial credit, then
  Hobby ($5/mo). An always-on oracle holding the models in RAM will draw credit continuously; the
  trial typically covers a hackathon window but is not free forever.
- **Memory / OOM:** the service lazily loads 4 CPU models (DINOv2, CLIP, SMOGY, RoBERTa). Peak RAM is
  ~1-1.5 GB. If the service crashes on the first `/analyze`, raise the instance memory in Railway.
- **Cold start:** `/health` responds immediately, but the FIRST `/analyze` downloads + loads the
  models (tens of seconds). Hit `/analyze` once after deploy to warm it before a demo.
- **Ephemeral disk:** the committed `corpus.db` is the baseline; corpus growth from `/confirm` at
  runtime is lost on restart. Add a Railway Volume mounted at `oracle/data` if you need persistence.
- **Native deps:** `better-sqlite3` compiles and `onnxruntime-node` pulls a prebuilt binary during
  build; Nixpacks handles both. If the build fails, check the build logs for node-gyp toolchain.
