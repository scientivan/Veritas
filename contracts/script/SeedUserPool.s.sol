// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Script.sol";

interface IERC20Mint {
    function mint(address to, uint256 amount) external;
    function approve(address spender, uint256 amount) external returns (bool);
}

interface IVeritasHook {
    struct LaunchpadState {
        uint8   phase;
        bool    migrating;
        bool    launchTokenIs0;
        uint256 curveAllocation;
        uint256 lpAllocation;
        uint256 tokensSold;
        uint256 fundsRaised;
        uint256 hardCap;
        uint256 curveA;
        uint256 curveB;
        uint160 graduationSqrtPriceX96;
        address veritasTreasury;
    }
    function launchpads(bytes32 poolId) external view returns (LaunchpadState memory);
}

interface IPoolSwapTest {
    struct TestSettings { bool takeClaims; bool settleUsingBurn; }
    struct PoolKey { address currency0; address currency1; uint24 fee; int24 tickSpacing; address hooks; }
    struct SwapParams { bool zeroForOne; int256 amountSpecified; uint160 sqrtPriceLimitX96; }
    function swap(PoolKey calldata, SwapParams calldata, TestSettings calldata, bytes calldata) external payable returns (int256);
}

/**
 * Seeds the user's 1000-USDC launchpad pool to graduation.
 *
 * Pool:  attestationId 0x1f6ba29ac32a2ea5cc6ef5fd21ea4de3bac982651faa18961f6cdee366da4ab0
 * Token: 0xa4dd007f6e1c78af5eecb3c9c8cbab381961402a (currency0)
 * PoolId: 0xeda24af8dffffdbdec19f7ac7a00cd965624928d6430f3f62d4a50d78702c130
 *
 * ~10 USDC already raised. This script adds wallets 201-310 x 10 USDC each
 * until graduation fires (hardCap = 1000 USDC).
 *
 * Run:
 *   forge script script/SeedUserPool.s.sol --broadcast --rpc-url https://sepolia.unichain.org
 */
contract SeedUserPool is Script {
    address constant HOOK   = 0xc3CfD4756d8d1B02B57d7b80082c1A95e515A0cc;
    address constant ROUTER = 0xB50cEEC85d58f3925eee5Ea71790577f5a0df831;
    address constant USDC   = 0xD977AD033490EF42Db9E3B8Fc294425369b5A15a;
    address constant IP_TOKEN = 0xa4DD007F6E1C78af5EeCb3c9C8cBab381961402A;

    bytes32 constant POOL_ID = 0xeda24af8dffffdbdec19f7ac7a00cd965624928d6430f3f62d4a50d78702c130;

    uint256 constant USDC_PER_BUY = 10 ether; // 10 USDC (18 dec)

    // MAX_SQRT_PRICE - 1
    uint160 constant SQRT_LIMIT = uint160(0xfFfd8963EFd1fC6A506488495d951d5263988d25);

    // Wallets 201-310 (distinct from SeedCurve's 1-101 range)
    uint256 constant START_WALLET = 201;
    uint256 constant END_WALLET   = 310;

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");

        IPoolSwapTest.PoolKey memory key = IPoolSwapTest.PoolKey({
            currency0: IP_TOKEN,
            currency1: USDC,
            fee: 3000,
            tickSpacing: 60,
            hooks: HOOK
        });
        IPoolSwapTest.SwapParams memory params = IPoolSwapTest.SwapParams({
            zeroForOne: false,
            amountSpecified: -int256(USDC_PER_BUY),
            sqrtPriceLimitX96: SQRT_LIMIT
        });
        IPoolSwapTest.TestSettings memory settings = IPoolSwapTest.TestSettings({
            takeClaims: false,
            settleUsingBurn: false
        });

        for (uint256 i = START_WALLET; i <= END_WALLET; i++) {
            // Check if pool already graduated before each wallet
            IVeritasHook.LaunchpadState memory state = IVeritasHook(HOOK).launchpads(POOL_ID);
            if (state.phase != 1) {
                        console.log("Pool graduated after wallet", i - 1);
                break;
            }
            console.log("fundsRaised (wei):", state.fundsRaised, "wallet", i);

            uint256 seedKey = uint256(keccak256(abi.encodePacked("veritas-seed-wallet", i)));
            address seedWallet = vm.addr(seedKey);

            vm.startBroadcast(deployerKey);
            payable(seedWallet).transfer(0.000002 ether);
            IERC20Mint(USDC).mint(seedWallet, USDC_PER_BUY);
            vm.stopBroadcast();

            vm.startBroadcast(seedKey);
            IERC20Mint(USDC).approve(ROUTER, type(uint256).max);
            try IPoolSwapTest(ROUTER).swap(key, params, settings, "") {
                // contributed 10 USDC
            } catch {
                vm.stopBroadcast();
                continue;
            }
            vm.stopBroadcast();
        }

        IVeritasHook.LaunchpadState memory final_ = IVeritasHook(HOOK).launchpads(POOL_ID);
        console.log("Final phase:", final_.phase);
        console.log("Final fundsRaised (wei):", final_.fundsRaised);
    }
}
