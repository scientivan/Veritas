// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {LPFeeLibrary} from "@uniswap/v4-core/src/libraries/LPFeeLibrary.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {SwapParams, ModifyLiquidityParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {TestERC20} from "@uniswap/v4-core/src/test/TestERC20.sol";
import {PoolModifyLiquidityTest} from "@uniswap/v4-core/src/test/PoolModifyLiquidityTest.sol";
import {PoolSwapTest} from "@uniswap/v4-core/src/test/PoolSwapTest.sol";
import {VeritasHook} from "../src/VeritasHook.sol";

/**
 * @notice Like DeployPool but initialised at a realistic ETH/imageToken ratio.
 *         Demonstrates a pool where token1 represents a high-value asset (e.g. ETH at ~$3000)
 *         and token0 is the image token (~$1), giving a 3000:1 price ratio.
 *
 * The initial tick for price ≈ 3000 (token1 per token0):
 *   price = 3000 → sqrtPrice = sqrt(3000) ≈ 54.77
 *   tick  = log(3000) / log(1.0001) ≈ 80069
 *
 * If token0 < token1 in address order (usual case after sort), price = token1/token0 = 3000
 * means 1 token0 buys 3000 token1.  LP provides ~0.001 token1 per token0 deposited, so the
 * initial position is almost entirely token0-sided — realistic for an imageToken/ETH pair.
 *
 * Required env:
 *   PRIVATE_KEY      - deployer (must own the attestation)
 *   POOL_MANAGER     - v4 PoolManager (0x00B036B58a818B1BC34d502D3fE730Db729e62AC)
 *   VERITAS_HOOK     - the hook (0x0AaAef1B312243EfaAD238fb53403dC5761d60C4)
 *   ATTESTATION_ID   - a low-DRS attestation owned by the deployer NOT yet pooled
 *   INIT_TICK        - optional; defaults to 80069 (≈ price 3000 for 18-decimal tokens)
 */
contract DeployPoolRealistic is Script {
    using PoolIdLibrary for PoolKey;

    uint24 constant BASE_FEE    = 3000;  // 0.30%
    uint24 constant MAX_FEE     = 10000; // 1.00%
    uint16 constant GATE        = 8500;  // DRS gate
    int24  constant TICK_SPACING = 60;
    int24  constant DEFAULT_TICK = 80069; // ln(3000)/ln(1.0001) ≈ 80069

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        IPoolManager manager = IPoolManager(vm.envAddress("POOL_MANAGER"));
        VeritasHook hook = VeritasHook(vm.envAddress("VERITAS_HOOK"));
        bytes32 attestationId = vm.envBytes32("ATTESTATION_ID");
        int24 initTick = vm.envOr("INIT_TICK", int256(DEFAULT_TICK)) == int256(DEFAULT_TICK)
            ? DEFAULT_TICK
            : int24(int256(vm.envInt("INIT_TICK")));

        vm.startBroadcast(pk);

        // 1. Deploy two TestERC20 tokens — token0 is the image token ($1), token1 is
        //    the ETH-equivalent token ($3000).  Sort by address.
        TestERC20 a = new TestERC20(1e27);
        TestERC20 b = new TestERC20(1e27);
        (TestERC20 imgToken, TestERC20 ethToken) = address(a) < address(b) ? (a, b) : (b, a);

        PoolKey memory key = PoolKey({
            currency0: Currency.wrap(address(imgToken)),
            currency1: Currency.wrap(address(ethToken)),
            fee: LPFeeLibrary.DYNAMIC_FEE_FLAG,
            tickSpacing: TICK_SPACING,
            hooks: IHooks(address(hook))
        });

        // 2. Register the pool against a low-DRS attestation.
        hook.registerPool(key, attestationId, BASE_FEE, MAX_FEE, GATE);

        // 3. Initialize at the realistic price — tick 80069 ≈ price 3000 (imgToken/ETH).
        uint160 sqrtPriceX96 = TickMath.getSqrtPriceAtTick(initTick);
        manager.initialize(key, sqrtPriceX96);

        // 4. Add a small amount of liquidity so the pool has reserves.
        //    At price 3000, a full-range 1e18 L position requires ~0.01826 imgToken
        //    and ~54.77 ETH-equivalent tokens — mint enough of each.
        PoolModifyLiquidityTest lp = new PoolModifyLiquidityTest(manager);
        PoolSwapTest swap = new PoolSwapTest(manager);

        // Mint 10^6 of each token (no decimals matter for TestERC20 mint).
        //
        ethToken.mint(vm.addr(pk), 1e24);

        imgToken.approve(address(lp), type(uint256).max);
        ethToken.approve(address(lp), type(uint256).max);
        imgToken.approve(address(swap), type(uint256).max);
        ethToken.approve(address(swap), type(uint256).max);

        // Full-range liquidity.
        lp.modifyLiquidity(
            key,
            ModifyLiquidityParams({
                tickLower: TickMath.minUsableTick(TICK_SPACING),
                tickUpper: TickMath.maxUsableTick(TICK_SPACING),
                liquidityDelta: 1e18,
                salt: bytes32(0)
            }),
            ""
        );

        // Small swap to exercise the hook's beforeSwap dynamic fee path.
        swap.swap(
            key,
            SwapParams({
                zeroForOne: true,
                amountSpecified: -1e12,
                sqrtPriceLimitX96: TickMath.MIN_SQRT_PRICE + 1
            }),
            PoolSwapTest.TestSettings({takeClaims: false, settleUsingBurn: false}),
            ""
        );

        vm.stopBroadcast();

        PoolId id = key.toId();
        console2.log("=== Realistic ETH-ratio pool opened ===");
        console2.log("  imgToken (token0, ~$1)   :", address(imgToken));
        console2.log("  ethToken (token1, ~$3000):", address(ethToken));
        console2.log("  attestationId            :", vm.toString(attestationId));
        console2.log("  poolId                   :", vm.toString(PoolId.unwrap(id)));
        console2.log("  init tick                :", initTick);
        console2.log("  sqrtPriceX96             :", sqrtPriceX96);
        console2.log("");
        console2.log("Update frontend/src/lib/livePools.ts with these addresses + poolId.");
        console2.log("Set ASSUMED_TOKEN0_PRICE_USD=1 and ASSUMED_TOKEN1_PRICE_USD=3000 in poolMeta.ts.");
    }
}
