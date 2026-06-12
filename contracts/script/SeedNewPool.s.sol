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
 * Seeds the launchpad pool at attestation 0x29bf34507b2...
 * Token: 0xbE2c9dcd07F5c88728C05061Cb0BA6164fb73Af7 (currency0, < USDC)
 * PoolId: 0xa9a95a8a0f08bc89598ea0b81e47f4cfdfc1228512c112436e6b72f4632573ec
 * Currently raised ~10 USDC; hardCap = 1000 USDC.
 *
 * Run:
 *   forge script script/SeedNewPool.s.sol --broadcast --rpc-url https://sepolia.unichain.org
 */
contract SeedNewPool is Script {
    address constant HOOK      = 0xc3CfD4756d8d1B02B57d7b80082c1A95e515A0cc;
    address constant ROUTER    = 0xB50cEEC85d58f3925eee5Ea71790577f5a0df831;
    address constant USDC      = 0xD977AD033490EF42Db9E3B8Fc294425369b5A15a;
    address constant IP_TOKEN  = 0xbE2c9dcd07F5c88728C05061Cb0BA6164fb73Af7;

    bytes32 constant POOL_ID   = 0xa9a95a8a0f08bc89598ea0b81e47f4cfdfc1228512c112436e6b72f4632573ec;

    uint256 constant USDC_PER_BUY = 10 ether; // 10 USDC (18 dec)

    // MAX_SQRT_PRICE - 1
    uint160 constant SQRT_LIMIT = uint160(0xfFfd8963EFd1fC6A506488495d951d5263988d25);

    // Wallets 801-900 (fresh range, avoids all prior runs)
    uint256 constant START_WALLET = 801;
    uint256 constant END_WALLET   = 900;

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
            IVeritasHook.LaunchpadState memory state = IVeritasHook(HOOK).launchpads(POOL_ID);
            if (state.phase != 1) {
                console.log("Pool graduated after wallet", i - 1);
                break;
            }
            console.log("fundsRaised:", state.fundsRaised / 1e18, "USDC | wallet", i);

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
        console.log("Final fundsRaised:", final_.fundsRaised / 1e18, "USDC");
    }
}
