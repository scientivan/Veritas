#!/usr/bin/env bash
# Verify the live Veritas contracts on Sourcify (keyless) and, if UNISCAN_API_KEY
# is set in .env, on Uniscan (the Etherscan-powered Unichain explorer the judges read).
#
# Get a key (Etherscan API v2 unified key works for Unichain Sepolia 1301):
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

ORACLE_ARGS=$(cast abi-encode 'constructor(address[],uint8,address)' "[$DEPLOYER]" 1 $DEPLOYER)
REGISTRY_ARGS=$(cast abi-encode 'constructor(address,uint256,uint256,address)' $ORACLE 0 0 $DEPLOYER)
HOOK_ARGS=$(cast abi-encode 'constructor(address,address)' $PM $REGISTRY)

verify() { # <addr> <contract> <args> <extra-flags...>
  local addr=$1 contract=$2 args=$3; shift 3
  forge verify-contract "$addr" "$contract" --chain-id 1301 --constructor-args "$args" "$@" 2>&1 | tail -3
}

echo "### Sourcify (keyless) ###"
SRC=(--verifier sourcify --verifier-url https://sourcify.dev/server/)
verify $ORACLE   src/VeritasOracle.sol:VeritasOracle     "$ORACLE_ARGS"   "${SRC[@]}"
verify $REGISTRY src/VeritasRegistry.sol:VeritasRegistry "$REGISTRY_ARGS" "${SRC[@]}"
verify $HOOK     src/VeritasHook.sol:VeritasHook         "$HOOK_ARGS"     "${SRC[@]}"

if [ -n "${UNISCAN_API_KEY:-}" ]; then
  echo "### Uniscan (Etherscan) ###"
  ETH=(--verifier etherscan --verifier-url https://sepolia.uniscan.xyz/api --etherscan-api-key "$UNISCAN_API_KEY")
  verify $ORACLE   src/VeritasOracle.sol:VeritasOracle     "$ORACLE_ARGS"   "${ETH[@]}"
  verify $REGISTRY src/VeritasRegistry.sol:VeritasRegistry "$REGISTRY_ARGS" "${ETH[@]}"
  verify $HOOK     src/VeritasHook.sol:VeritasHook         "$HOOK_ARGS"     "${ETH[@]}"
else
  echo "### Uniscan skipped (set UNISCAN_API_KEY in contracts/.env to enable) ###"
fi
