// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";

import {ComputeAssetRegistry} from "../src/ComputeAssetRegistry.sol";
import {ProtocolController} from "../src/ProtocolController.sol";
import {RevenueDistributor} from "../src/RevenueDistributor.sol";

contract Deploy is Script {
    function run()
        external
        returns (
            ComputeAssetRegistry registry,
            ProtocolController controller,
            RevenueDistributor distributor
        )
    {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address admin = vm.addr(deployerPrivateKey);

        vm.startBroadcast(deployerPrivateKey);

        registry = new ComputeAssetRegistry(admin);
        controller = new ProtocolController(admin);
        distributor = new RevenueDistributor(admin);

        // Allow the controller to invoke pause()/unpause() on these contracts.
        registry.grantRole(registry.DEFAULT_ADMIN_ROLE(), address(controller));
        distributor.grantRole(
            distributor.DEFAULT_ADMIN_ROLE(),
            address(controller)
        );

        // Register managed contracts for centralized pause management.
        controller.registerManagedContract(
            keccak256("COMPUTE_ASSET_REGISTRY"),
            address(registry)
        );
        controller.registerManagedContract(
            keccak256("REVENUE_DISTRIBUTOR"),
            address(distributor)
        );

        vm.stopBroadcast();

        console2.log("Admin:", admin);
        console2.log("ComputeAssetRegistry:", address(registry));
        console2.log("ProtocolController:", address(controller));
        console2.log("RevenueDistributor:", address(distributor));
    }
}
