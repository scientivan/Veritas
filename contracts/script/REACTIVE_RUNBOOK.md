# Reactive RSC runbook (the living-D channel)

The Unichain side is **already live**:

| Piece | Address (Unichain Sepolia, 1301) |
| --- | --- |
| VeritasRegistry | `0xe359bdB2cA1A152Ae62E2496F140ea192Ce0d824` |
| VeritasRegistryCallback | `0xa516891eE1a4b0c4a149D1241e2EE00702B7332a` |
| Reactive Callback Proxy | `0x9299472A6399Fd1027ebF067571Eb3e3D7837FC4` |

`registry.dilutionUpdater` == the callback, so the only remaining step is to deploy
the `DilutionMonitorRSC` on the **Reactive testnet (Lasna)** so it listens for
`NewAttestation` and fires the callback.

## 1. Fund the deployer with REACT on Lasna

- Reactive testnet (Lasna): RPC `https://lasna-rpc.rnk.dev/`, chainId `5318007`.
- Get REACT from the Reactive faucet (see https://dev.reactive.network/ -> faucet),
  funding `0x490a2F2fE7fB40003585333D5df3C4588f33F11f`.

## 2. Deploy the RSC

```bash
cd contracts
set -a; . ./.env; set +a                  # PRIVATE_KEY
export REGISTRY_ADDRESS=0xe359bdB2cA1A152Ae62E2496F140ea192Ce0d824
export CALLBACK_ADDRESS=0xa516891eE1a4b0c4a149D1241e2EE00702B7332a
export RSC_FUND_WEI=2000000000000000000     # ~2 REACT for subscription + callback gas (adjust)

forge script script/DeployRSC.s.sol:DeployRSC \
  --rpc-url https://lasna-rpc.rnk.dev/ --broadcast -vv
```

Origin and destination both default to Unichain Sepolia (1301).

## 3. Fund the callback (destination-side gas)

The `VeritasRegistryCallback` pays the proxy for each callback. Top it up so it can
service dilution callbacks:

```bash
cast send 0xa516891eE1a4b0c4a149D1241e2EE00702B7332a --value 0.005ether \
  --rpc-url https://sepolia.unichain.org --private-key $PRIVATE_KEY
```

## 4. Prove it end-to-end

Attest two near-duplicate images (oracle `npm run smoke` twice with the same
content but different owners, or the frontend). The RSC reacts to the second
`NewAttestation`, the callback runs `getNearDuplicates` + `incrementDilutionCount`,
and `registry.getCurrentDRS` for the first attestation rises from the on-chain
`saturateD(dilutionCount)` floor - with no oracle involvement. That is the
trustless, living-D channel.
