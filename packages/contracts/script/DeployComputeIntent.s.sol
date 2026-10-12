// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script} from "forge-std/Script.sol";
import {ComputeIntentRegistry} from "../src/ComputeIntentRegistry.sol";

contract DeployComputeIntent is Script {
    function run() external returns (ComputeIntentRegistry registry) {
        uint256 privateKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(privateKey);
        registry = new ComputeIntentRegistry();
        vm.stopBroadcast();

    }
}
