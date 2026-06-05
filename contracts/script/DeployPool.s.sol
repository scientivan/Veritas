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
 * @notice Opens a REAL Uniswap v4 pool through the Veritas hook: deploys a token pair,
 *         registers the pool against a low-DRS attestation, initializes it (the hook's
 *         beforeInitialize gate must pass), adds liquidity, and does a swap so the hook's
 *         beforeSwap dynamic-fee path actually runs on-chain.
 *
 * Required env:
 *   PRIVATE_KEY      - deployer (must own the attestation)
 *   POOL_MANAGER     - v4 PoolManager (0x00B036B58a818B1BC34d502D3fE730Db729e62AC)
 *   VERITAS_HOOK     - the hook (0x0AaAef1B312243EfaAD238fb53403dC5761d60C4)
 *   ATTESTATION_ID   - a low-DRS attestation owned by the deployer
 */
contract DeployPool is Script {
    using PoolIdLibrary for PoolKey;

    uint24 constant BASE_FEE = 3000; // 0.30%
    uint24 constant MAX_FEE = 10000; // 1.00%
    uint16 constant GATE = 8500; // protocol DRS gate
    int24 constant TICK_SPACING = 60;

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        IPoolManager manager = IPoolManager(vm.envAddress("POOL_MANAGER"));
        VeritasHook hook = VeritasHook(vm.envAddress("VERITAS_HOOK"));
        bytes32 attestationId = vm.envBytes32("ATTESTATION_ID");
        address me = vm.addr(pk);

        vm.startBroadcast(pk);

        // 1. Token pair (sorted so currency0 < currency1).
        TestERC20 a = new TestERC20(1e27);
        TestERC20 b = new TestERC20(1e27);
        (TestERC20 t0, TestERC20 t1) = address(a) < address(b) ? (a, b) : (b, a);
        PoolKey memory key = PoolKey({
            currency0: Currency.wrap(address(t0)),
            currency1: Currency.wrap(address(t1)),
            fee: LPFeeLibrary.DYNAMIC_FEE_FLAG,
            tickSpacing: TICK_SPACING,
            hooks: IHooks(address(hook))
        });

        // 2. Register the pool against the attestation (hook authenticates msg.sender == owner).
        hook.registerPool(key, attestationId, BASE_FEE, MAX_FEE, GATE);

        // 3. Initialize at 1:1 - fires beforeInitialize, which re-checks the DRS gate.
        manager.initialize(key, TickMath.getSqrtPriceAtTick(0));

        // 4. Liquidity + swap through the v4 test routers so beforeSwap runs.
        PoolModifyLiquidityTest lp = new PoolModifyLiquidityTest(manager);
        PoolSwapTest swap = new PoolSwapTest(manager);
        t0.approve(address(lp), type(uint256).max);
        t1.approve(address(lp), type(uint256).max);
        t0.approve(address(swap), type(uint256).max);
        t1.approve(address(swap), type(uint256).max);

        lp.modifyLiquidity(
            key,
            ModifyLiquidityParams({tickLower: -600, tickUpper: 600, liquidityDelta: 1e21, salt: bytes32(0)}),
            ""
        );

        swap.swap(
            key,
            SwapParams({zeroForOne: true, amountSpecified: -1e15, sqrtPriceLimitX96: TickMath.MIN_SQRT_PRICE + 1}),
            PoolSwapTest.TestSettings({takeClaims: false, settleUsingBurn: false}),
            ""
        );

        vm.stopBroadcast();

        PoolId id = key.toId();
        uint24 appliedFee = BASE_FEE + uint24((uint256(MAX_FEE - BASE_FEE) * 0) / 10000); // DRS 0 -> baseFee
        console2.log("Pool opened through the Veritas hook.");
        console2.log("  token0        :", address(t0));
        console2.log("  token1        :", address(t1));
        console2.log("  attestationId :", vm.toString(attestationId));
        console2.log("  poolId        :", vm.toString(PoolId.unwrap(id)));
        console2.log("  dynamic LP fee at DRS 0 (hundredths of bip):", appliedFee);
        console2.log("  fee scales to maxFee as DRS rises: base + (max-base)*DRS/1e4");
    }
}
