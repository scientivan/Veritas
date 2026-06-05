// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {DilutionMonitorRSC} from "../src/reactive/DilutionMonitorRSC.sol";

/**
 * @notice Deploys the DilutionMonitorRSC to the REACTIVE NETWORK (run with the Reactive RPC).
 *
 * Prerequisite: VeritasRegistry + VeritasRegistryCallback already deployed on the origin/destination
 * chain (Unichain Sepolia) via Deploy.s.sol.
 *
 * Required env:
 *   PRIVATE_KEY        - deployer key (funded with REACT for subscription + callback gas)
 *   REGISTRY_ADDRESS   - VeritasRegistry on the origin chain (the NewAttestation emitter)
 *   CALLBACK_ADDRESS   - VeritasRegistryCallback on the destination chain
 * Optional env (default to Unichain Sepolia, 1301):
 *   ORIGIN_CHAIN_ID, DESTINATION_CHAIN_ID
 *   RSC_FUND_WEI       - REACT to send to the RSC for gas (default 0)
 */
contract DeployRSC is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address registry = vm.envAddress("REGISTRY_ADDRESS");
        address callbackReceiver = vm.envAddress("CALLBACK_ADDRESS");
        uint256 originChainId = vm.envOr("ORIGIN_CHAIN_ID", uint256(1301));
        uint256 destinationChainId = vm.envOr("DESTINATION_CHAIN_ID", uint256(1301));
        uint256 fund = vm.envOr("RSC_FUND_WEI", uint256(0));

        vm.startBroadcast(pk);
        DilutionMonitorRSC rsc =
            new DilutionMonitorRSC{value: fund}(originChainId, registry, destinationChainId, callbackReceiver);
        vm.stopBroadcast();

        console2.log("DilutionMonitorRSC :", address(rsc));
        console2.log("  subscribed to NewAttestation on registry:", registry);
        console2.log("  callbacks to:", callbackReceiver);
        console2.log(
            "NOTE: VeritasRegistry.dilutionUpdater must equal the VeritasRegistryCallback (set in Deploy.s.sol)."
        );
    }
}
