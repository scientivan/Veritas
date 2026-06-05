// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {VeritasRegistry} from "../src/VeritasRegistry.sol";
import {VeritasRegistryCallback} from "../src/VeritasRegistryCallback.sol";
import {IVeritasRegistry} from "../src/interfaces/IVeritasRegistry.sol";

/**
 * @notice Deploys ONLY the VeritasRegistryCallback against the already-live registry and wires it
 *         as the registry's dilutionUpdater. Unlike Deploy.s.sol this does not redeploy the stack.
 *
 * Required env:
 *   PRIVATE_KEY             - deployer key (must be the registry owner)
 *   REGISTRY_ADDRESS        - the live VeritasRegistry
 *   REACTIVE_CALLBACK_PROXY - Reactive Callback Proxy for Unichain Sepolia
 *                             (0x9299472A6399Fd1027ebF067571Eb3e3D7837FC4)
 * Optional env:
 *   CALLBACK_FUNDING_WEI    - value to seed the callback with (it pays the proxy for callback gas)
 */
contract DeployCallback is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address registryAddr = vm.envAddress("REGISTRY_ADDRESS");
        address callbackProxy = vm.envAddress("REACTIVE_CALLBACK_PROXY");
        uint256 funding = vm.envOr("CALLBACK_FUNDING_WEI", uint256(0));

        VeritasRegistry registry = VeritasRegistry(registryAddr);

        vm.startBroadcast(pk);
        VeritasRegistryCallback callback =
            new VeritasRegistryCallback{value: funding}(callbackProxy, IVeritasRegistry(registryAddr));
        registry.setDilutionUpdater(address(callback));
        vm.stopBroadcast();

        console2.log("VeritasRegistryCallback:", address(callback));
        console2.log("registry.dilutionUpdater set to callback");
        console2.log("Next: deploy DilutionMonitorRSC on Reactive (Lasna) with DeployRSC.s.sol,");
        console2.log("  CALLBACK_ADDRESS =", address(callback));
    }
}
