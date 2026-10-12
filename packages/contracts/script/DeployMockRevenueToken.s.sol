// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {MockRevenueToken} from "../test/mocks/MockRevenueToken.sol";

contract DeployMockRevenueToken is Script {
    function run() external returns (MockRevenueToken token) {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerPrivateKey);
        token = new MockRevenueToken();
        vm.stopBroadcast();

        console2.log("MockRevenueToken:", address(token));
        console2.log("Deployer:", vm.addr(deployerPrivateKey));
    }
}
