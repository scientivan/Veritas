#!/usr/bin/env bash
# Verify the live Veritas contracts on Uniscan via the Etherscan v2 unified API
# (one key covers every chain, incl. Unichain Sepolia 1301 -> shown on uniscan.xyz).
#
# Get a key:
#   https://etherscan.io/myapikey  ->  put UNISCAN_API_KEY=... in contracts/.env
#
#   ./verify.sh
set -euo pipefail
cd "$(dirname "$0")"
set -a; [ -f .env ] && . ./.env; set +a

DEPLOYER=0x490a2F2fE7fB40003585333D5df3C4588f33F11f
ORACLE=0x45b327808f4D719C574D4508DD46a8E7b4124bd3
REGISTRY=0xe359bdB2cA1A152Ae62E2496F140ea192Ce0d824
HOOK=0x0AaAef1B312243EfaAD238fb53403dC5761d60C4
PM=0x00B036B58a818B1BC34d502D3fE730Db729e62AC
CALLBACK=0xa516891eE1a4b0c4a149D1241e2EE00702B7332a
PROXY=0x9299472A6399Fd1027ebF067571Eb3e3D7837FC4

ORACLE_ARGS=$(cast abi-encode 'constructor(address[],uint8,address)' "[$DEPLOYER]" 1 $DEPLOYER)
REGISTRY_ARGS=$(cast abi-encode 'constructor(address,uint256,uint256,address)' $ORACLE 0 0 $DEPLOYER)
HOOK_ARGS=$(cast abi-encode 'constructor(address,address)' $PM $REGISTRY)
CALLBACK_ARGS=$(cast abi-encode 'constructor(address,address)' $PROXY $REGISTRY)

# Etherscan v2 unified endpoint, routed to Unichain Sepolia by chainid.
V2="https://api.etherscan.io/v2/api?chainid=1301"

verify() { # <addr> <contract> <args>
  local addr=$1 contract=$2 args=$3
  forge verify-contract "$addr" "$contract" \
    --verifier etherscan --verifier-url "$V2" --etherscan-api-key "$UNISCAN_API_KEY" \
    --constructor-args "$args" --watch 2>&1 | tail -4
  echo "---"
}

if [ -z "${UNISCAN_API_KEY:-}" ]; then
  echo "Set UNISCAN_API_KEY in contracts/.env first (https://etherscan.io/myapikey)."
  exit 1
fi

echo "### Uniscan (Etherscan v2, chainid 1301) ###"
verify $ORACLE   src/VeritasOracle.sol:VeritasOracle                       "$ORACLE_ARGS"
verify $REGISTRY src/VeritasRegistry.sol:VeritasRegistry                   "$REGISTRY_ARGS"
verify $HOOK     src/VeritasHook.sol:VeritasHook                           "$HOOK_ARGS"
verify $CALLBACK src/VeritasRegistryCallback.sol:VeritasRegistryCallback   "$CALLBACK_ARGS"
