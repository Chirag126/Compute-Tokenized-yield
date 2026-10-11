// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";

import {ComputeAssetRegistry} from "../src/ComputeAssetRegistry.sol";
import {ComputeAssetToken} from "../src/ComputeAssetToken.sol";

contract DeployToken is Script {
    function run() external returns (ComputeAssetToken token) {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address admin = vm.addr(deployerPrivateKey);

        address registryAddress =
            vm.envOr(
                "REGISTRY_CONTRACT_ADDRESS",
            address(0x61283d563684E01A92650eb5a76dc26F42D9cDA0)
        );

        require(registryAddress != address(0), "Registry address missing");

        ComputeAssetRegistry registry =
            ComputeAssetRegistry(registryAddress);

        vm.startBroadcast(deployerPrivateKey);

        // Register the first compute asset.
        uint256 assetId = registry.registerAsset(
            keccak256("TCY_GPU_FLEET_001"),
            admin,
            "https://example.com/metadata/tcy-gpu-fleet-001.json"
        );

        // Deploy a token linked to this asset and registry.
        token = new ComputeAssetToken(
            "Tokenized Compute Yield GPU",
            "TCYGPU",
            assetId,
            registryAddress,
            admin
        );

        vm.stopBroadcast();

        console2.log("Asset ID:", assetId);
        console2.log("Registry:", registryAddress);
        console2.log("ComputeAssetToken:", address(token));
        console2.log("Admin:", admin);
    }
}
