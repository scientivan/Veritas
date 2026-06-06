// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolModifyLiquidityTest} from "@uniswap/v4-core/src/test/PoolModifyLiquidityTest.sol";

/**
 * @notice Deploys a persistent PoolModifyLiquidityTest router so the frontend can let
 *         any connected wallet add / remove real liquidity on the Veritas v4 pools.
 *         (The pool tokens are Uniswap TestERC20 with a public mint, so users can fund
 *         themselves in-app first.)
 *
 * Env: PRIVATE_KEY, POOL_MANAGER
 */
contract DeployRouter is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        IPoolManager manager = IPoolManager(vm.envAddress("POOL_MANAGER"));
        vm.startBroadcast(pk);
        PoolModifyLiquidityTest router = new PoolModifyLiquidityTest(manager);
        vm.stopBroadcast();
        console2.log("PoolModifyLiquidityTest router:", address(router));
    }
}
