// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {LPFeeLibrary} from "@uniswap/v4-core/src/libraries/LPFeeLibrary.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {SwapParams, ModifyLiquidityParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {TestERC20} from "@uniswap/v4-core/src/test/TestERC20.sol";
import {PoolModifyLiquidityTest} from "@uniswap/v4-core/src/test/PoolModifyLiquidityTest.sol";
import {PoolSwapTest} from "@uniswap/v4-core/src/test/PoolSwapTest.sol";

/**
 * Seed swaps and additional liquidity on all 4 ETH-ratio pools.
 * Also adds more LP positions so TVL and LpHistory are richer for demo.
 *
 * Env:
 *   PRIVATE_KEY   - deployer
 *   POOL_MANAGER  - 0x00B036B58a818B1BC34d502D3fE730Db729e62AC
 *   VERITAS_HOOK  - 0x0AaAef1B312243EfaAD238fb53403dC5761d60C4
 */
contract SeedSwaps is Script {
    uint24 constant TICK_SPACING = 60;
    address constant HOOK = 0x0AaAef1B312243EfaAD238fb53403dC5761d60C4;

    // 4 pools: (token0, token1)
    address[4] T0 = [
        0xeD55FB324761b65F62C524caC8dE39154C8797A5, // Portrait
        0x782BEc7Dc157a7a5b569ce07cF949DE803ac5508, // Forest
        0x22023CDF642e658b19A5352269600F7b4e24ACb8, // Urban
        0x202eA4453060d91A3b14BF5591751fB0eb40ca72  // Landscape
    ];
    address[4] T1 = [
        0xF0337F1aa72844F9a2628338DFf3bBcF77af0bf3, // Portrait
        0xE388f7DB82a0ca0923e970cea5cD2867a4452ef7, // Forest
        0x96a2d5f51FAe7ADF0740A9ec18987bD33f4D7CEa, // Urban
        0x6131802ED6D45982fB5AA270e007E349635BC338  // Landscape
    ];
    string[4] NAMES = ["Portrait", "Forest", "Urban", "Landscape"];

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        IPoolManager manager = IPoolManager(vm.envAddress("POOL_MANAGER"));

        vm.startBroadcast(pk);

        PoolModifyLiquidityTest lp = new PoolModifyLiquidityTest(manager);
        PoolSwapTest swapper = new PoolSwapTest(manager);

        for (uint256 i = 0; i < 4; i++) {
            TestERC20 t0 = TestERC20(T0[i]);
            TestERC20 t1 = TestERC20(T1[i]);

            // Approve large amounts.
            t0.mint(vm.addr(pk), 1e26);
            t1.mint(vm.addr(pk), 1e26);
            t0.approve(address(lp), type(uint256).max);
            t1.approve(address(lp), type(uint256).max);
            t0.approve(address(swapper), type(uint256).max);
            t1.approve(address(swapper), type(uint256).max);

            PoolKey memory key = PoolKey({
                currency0: Currency.wrap(address(t0)),
                currency1: Currency.wrap(address(t1)),
                fee: LPFeeLibrary.DYNAMIC_FEE_FLAG,
                tickSpacing: int24(TICK_SPACING),
                hooks: IHooks(HOOK)
            });

            // Add extra liquidity (5x more).
            lp.modifyLiquidity(
                key,
                ModifyLiquidityParams({
                    tickLower: TickMath.minUsableTick(int24(TICK_SPACING)),
                    tickUpper: TickMath.maxUsableTick(int24(TICK_SPACING)),
                    liquidityDelta: 5e18,
                    salt: bytes32(uint256(1))
                }),
                ""
            );

            // 3 swaps zeroForOne (buy ETH with asset tokens).
            for (uint256 s = 0; s < 3; s++) {
                swapper.swap(
                    key,
                    SwapParams({
                        zeroForOne: true,
                        amountSpecified: -int256(1e15 * (s + 1)),
                        sqrtPriceLimitX96: TickMath.MIN_SQRT_PRICE + 1
                    }),
                    PoolSwapTest.TestSettings({takeClaims: false, settleUsingBurn: false}),
                    ""
                );
            }

            // 1 swap oneForZero (sell ETH back).
            swapper.swap(
                key,
                SwapParams({
                    zeroForOne: false,
                    amountSpecified: -int256(1e12),
                    sqrtPriceLimitX96: TickMath.MAX_SQRT_PRICE - 1
                }),
                PoolSwapTest.TestSettings({takeClaims: false, settleUsingBurn: false}),
                ""
            );

            console2.log(string.concat("Seeded ", NAMES[i]));
        }

        vm.stopBroadcast();
    }
}
