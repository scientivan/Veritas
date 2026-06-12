// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Script.sol";

interface IERC20Mint {
    function mint(address to, uint256 amount) external;
    function approve(address spender, uint256 amount) external returns (bool);
}

interface IPoolSwapTest {
    struct TestSettings {
        bool takeClaims;
        bool settleUsingBurn;
    }

    struct PoolKey {
        address currency0;
        address currency1;
        uint24 fee;
        int24 tickSpacing;
        address hooks;
    }

    struct SwapParams {
        bool zeroForOne;
        int256 amountSpecified;
        uint160 sqrtPriceLimitX96;
    }

    function swap(
        PoolKey calldata key,
        SwapParams calldata params,
        TestSettings calldata testSettings,
        bytes calldata hookData
    ) external payable returns (int256);
}

/**
 * Seeds the bonding-curve launchpad by generating deterministic wallets,
 * funding each with ETH for gas + mock USDC, then buying the per-wallet max
 * on the curve. Runs until fundsRaised >= hardCap (graduation).
 *
 * Usage:
 *   forge script script/SeedCurve.s.sol --broadcast --rpc-url https://sepolia.unichain.org
 */
contract SeedCurve is Script {
    // Contracts: fixed hook (graduation overflow fixed 2026-06-07)
    address constant HOOK  = 0xc3CfD4756d8d1B02B57d7b80082c1A95e515A0cc;
    address constant ROUTER = 0xB50cEEC85d58f3925eee5Ea71790577f5a0df831;
    address constant USDC   = 0xD977AD033490EF42Db9E3B8Fc294425369b5A15a;
    // Pool: IP token 0xc858fe is currency0 (< 0xd977ad)
    address constant IP_TOKEN = 0xc858FE61C1f38D5c18C002aa37fAeA7Fefe7238A;

    // How much USDC each wallet spends per buy. Must stay under the 12-token/wallet limit.
    // cost(0 → 12 tokens) = 10.004 USDC at the starting price (b = 0.833 USDC/token).
    // Using 10 USDC gives netInput = 9.985 USDC → ~11.98 tokens (just under 12 limit).
    // At graduation price ~3.3 USDC/token: 10 USDC → ~3 tokens (always safe).
    uint256 constant USDC_PER_BUY = 10 ether; // 10 USDC (18 dec)

    // MAX_SQRT_PRICE - 1, used as limit for zeroForOne=false buys.
    uint160 constant SQRT_LIMIT = uint160(0xfFfd8963EFd1fC6A506488495d951d5263988d25);

    // Fresh pool: start from wallet 1.
    uint256 constant START_WALLET = 1;
    // 101 wallets x 9.985 USDC net = 1008.5 USDC > 1000 hardCap; graduation fires partway.
    uint256 constant END_WALLET = 101;

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        // Read current fundsRaised from the launchpad
        bytes32 poolId = 0x9b16df9753284cdecc8bf027f1905d985ca112cc037fd79aaa1427dc7592cb82;

        IPoolSwapTest.PoolKey memory key = IPoolSwapTest.PoolKey({
            currency0: IP_TOKEN,   // 0xc858FE... < 0xD977AD... so IP is currency0
            currency1: USDC,
            fee: 3000,
            tickSpacing: 60,
            hooks: HOOK
        });
        IPoolSwapTest.SwapParams memory params = IPoolSwapTest.SwapParams({
            zeroForOne: false,            // pay USDC (currency1) → receive IP (currency0)
            amountSpecified: -int256(USDC_PER_BUY),
            sqrtPriceLimitX96: SQRT_LIMIT
        });
        IPoolSwapTest.TestSettings memory settings = IPoolSwapTest.TestSettings({
            takeClaims: false,
            settleUsingBurn: false
        });

        for (uint256 i = START_WALLET; i <= END_WALLET; i++) {
            // Derive a deterministic private key from the loop index.
            uint256 seedKey = uint256(keccak256(abi.encodePacked("veritas-seed-wallet", i)));
            address seedWallet = vm.addr(seedKey);

            // --- Deployer funds the seed wallet ---
            vm.startBroadcast(deployerKey);
            // Gas on Unichain Sepolia is ~1.8M wei/unit; 0.000002 ETH covers
            // approve (~100k) + swap (~300k) = 400k × 1.8M wei = 7.2e11 wei, with margin.
            payable(seedWallet).transfer(0.000002 ether);
            IERC20Mint(USDC).mint(seedWallet, USDC_PER_BUY);
            vm.stopBroadcast();

            // --- Seed wallet approves and swaps ---
            vm.startBroadcast(seedKey);
            IERC20Mint(USDC).approve(ROUTER, type(uint256).max);
            try IPoolSwapTest(ROUTER).swap(key, params, settings, "") {
                // success: 10 USDC contributed
            } catch {
                // MaxBuyExceeded (wallet already used) or pool graduated, skip and continue.
                vm.stopBroadcast();
                continue;
            }
            vm.stopBroadcast();
        }
    }
}
