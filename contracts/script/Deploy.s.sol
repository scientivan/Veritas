// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {HookMiner} from "@uniswap/v4-periphery/src/utils/HookMiner.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";

import {VeritasOracle} from "../src/VeritasOracle.sol";
import {VeritasRegistry} from "../src/VeritasRegistry.sol";
import {VeritasHook} from "../src/VeritasHook.sol";
import {VeritasRegistryCallback} from "../src/VeritasRegistryCallback.sol";
import {IVeritasRegistry} from "../src/interfaces/IVeritasRegistry.sol";

/**
 * @notice Deploys the Veritas stack to Unichain Sepolia (or any v4 chain).
 *
 * Order: VeritasOracle -> VeritasRegistry -> VeritasHook (CREATE2-mined) -> VeritasRegistryCallback,
 * then sets the callback as the registry's dilution updater. Deploy the DilutionMonitorRSC separately
 * with DeployRSC.s.sol on the Reactive Network.
 *
 * Required env:
 *   PRIVATE_KEY             - deployer key
 *   POOL_MANAGER            - canonical v4 PoolManager on the target chain
 * Optional env:
 *   OPERATOR_1/2/3          - oracle operator signer addresses (default: deployer as sole operator)
 *   ORACLE_QUORUM           - signatures required (default: number of operators)
 *   ATTEST_FEE_WEI          - attestation fee (default 0)
 *   DISPUTE_BOND_WEI        - dispute bond (default 0)
 *   REACTIVE_CALLBACK_PROXY - Reactive Callback Proxy for this chain (enables the on-chain D channel)
 */
contract Deploy is Script {
    // Canonical CREATE2 deployer used by Foundry for salted `new` in scripts.
    address internal constant CREATE2_DEPLOYER = 0x4e59b44847b379578588920cA78FbF26c0B4956C;

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        IPoolManager manager = IPoolManager(vm.envAddress("POOL_MANAGER"));
        (address[] memory operators, uint8 quorum) = _operators(vm.addr(pk));

        vm.startBroadcast(pk);
        VeritasOracle oracle = new VeritasOracle(operators, quorum, vm.addr(pk));
        VeritasRegistry registry = new VeritasRegistry(
            oracle, vm.envOr("ATTEST_FEE_WEI", uint256(0)), vm.envOr("DISPUTE_BOND_WEI", uint256(0)), vm.addr(pk)
        );
        VeritasHook hook = _deployHook(manager, registry);
        address callbackAddr = _maybeDeployCallback(registry);
        vm.stopBroadcast();

        _report(address(oracle), address(registry), address(hook), callbackAddr, address(manager));
    }

    function _deployHook(IPoolManager manager, VeritasRegistry registry) internal returns (VeritasHook hook) {
        uint160 flags = uint160(
            Hooks.BEFORE_INITIALIZE_FLAG | Hooks.BEFORE_SWAP_FLAG | Hooks.AFTER_SWAP_FLAG
                | Hooks.AFTER_SWAP_RETURNS_DELTA_FLAG
        );
        bytes memory ctorArgs = abi.encode(manager, IVeritasRegistry(address(registry)));
        (address hookAddr, bytes32 salt) =
            HookMiner.find(CREATE2_DEPLOYER, flags, type(VeritasHook).creationCode, ctorArgs);
        hook = new VeritasHook{salt: salt}(manager, IVeritasRegistry(address(registry)));
        require(address(hook) == hookAddr, "Deploy: hook address mismatch");
    }

    function _maybeDeployCallback(VeritasRegistry registry) internal returns (address callbackAddr) {
        address callbackProxy = vm.envOr("REACTIVE_CALLBACK_PROXY", address(0));
        if (callbackProxy == address(0)) return address(0);
        VeritasRegistryCallback callback =
            new VeritasRegistryCallback(callbackProxy, IVeritasRegistry(address(registry)));
        registry.setDilutionUpdater(address(callback));
        callbackAddr = address(callback);
    }

    function _report(address oracle, address registry, address hook, address callbackAddr, address manager) internal {
        console2.log("VeritasOracle          :", oracle);
        console2.log("VeritasRegistry        :", registry);
        console2.log("VeritasHook            :", hook);
        console2.log("VeritasRegistryCallback:", callbackAddr);
        console2.log("PoolManager            :", manager);
        if (callbackAddr == address(0)) {
            console2.log("NOTE: set REACTIVE_CALLBACK_PROXY then re-run to enable on-chain dilution (D) via Reactive.");
        }

        string memory json = "deployment";
        vm.serializeAddress(json, "oracle", oracle);
        vm.serializeAddress(json, "registry", registry);
        vm.serializeAddress(json, "hook", hook);
        vm.serializeAddress(json, "registryCallback", callbackAddr);
        vm.serializeAddress(json, "poolManager", manager);
        string memory out = vm.serializeUint(json, "chainId", block.chainid);
        vm.writeJson(out, "./deployments/latest.json");
    }

    function _operators(address deployer) internal view returns (address[] memory operators, uint8 quorum) {
        address op1 = vm.envOr("OPERATOR_1", deployer);
        address op2 = vm.envOr("OPERATOR_2", address(0));
        address op3 = vm.envOr("OPERATOR_3", address(0));

        uint8 count = 1;
        if (op2 != address(0)) count++;
        if (op3 != address(0)) count++;

        operators = new address[](count);
        operators[0] = op1;
        if (count > 1) operators[1] = op2;
        if (count > 2) operators[2] = op3;

        quorum = uint8(vm.envOr("ORACLE_QUORUM", uint256(count)));
    }
}
