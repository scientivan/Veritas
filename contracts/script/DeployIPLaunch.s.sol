// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {IVeritasRegistry} from "../src/interfaces/IVeritasRegistry.sol";
import {IPLaunchRegistry} from "../src/IPLaunchRegistry.sol";

/**
 * @notice Deploys IPLaunchRegistry — the DRS-gated IP token registry that bridges
 *         the v2 DRS attestation system with the v1 IP tokenization / bonding curve
 *         launchpad infrastructure.
 *
 * Required env:
 *   PRIVATE_KEY         - deployer key
 *   DRS_REGISTRY        - deployed VeritasRegistry (v2) address
 *
 * Usage (Unichain Sepolia):
 *   forge script script/DeployIPLaunch.s.sol \
 *     --rpc-url $RPC_URL \
 *     --broadcast \
 *     --verify
 *
 * After deployment, update LAUNCH_REGISTRY_ADDRESS in frontend/src/lib/contracts.ts.
 */
contract DeployIPLaunch is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address drsRegistryAddr = vm.envAddress("DRS_REGISTRY");

        vm.startBroadcast(pk);
        IPLaunchRegistry launchRegistry = new IPLaunchRegistry(IVeritasRegistry(drsRegistryAddr));
        vm.stopBroadcast();

        console2.log("=== IPLaunchRegistry deployed ===");
        console2.log("IPLaunchRegistry:", address(launchRegistry));
        console2.log("Backed by DRS Registry:", drsRegistryAddr);
        console2.log("DRS_GATE:", launchRegistry.DRS_GATE());
        console2.log("");
        console2.log("Update frontend/src/lib/contracts.ts:");
        console2.log("  LAUNCH_REGISTRY_ADDRESS =", address(launchRegistry));
    }
}
