// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {RevenueDistributor} from "../src/RevenueDistributor.sol";
import {ProtocolController} from "../src/ProtocolController.sol";

contract DeployRevenueDistributor is Script {
    address constant CONTROLLER =
        0xa06EBFe854F78BC16184E7e9111f7942634F9963;

    function run() external returns (RevenueDistributor distributor) {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address admin = vm.addr(deployerPrivateKey);

        vm.startBroadcast(deployerPrivateKey);

        distributor = new RevenueDistributor(admin);

        distributor.grantRole(
            distributor.DEFAULT_ADMIN_ROLE(),
            CONTROLLER
        );

        ProtocolController controller = ProtocolController(CONTROLLER);
        bytes32 distributorKey = keccak256("REVENUE_DISTRIBUTOR");

        address oldDistributor = controller.getManagedContract(distributorKey);

        if (oldDistributor != address(0)) {
            controller.removeManagedContract(distributorKey);
        }

        controller.registerManagedContract(distributorKey, address(distributor));

        vm.stopBroadcast();

        console2.log("Admin:", admin);
        console2.log("RevenueDistributor:", address(distributor));
        console2.log("Previous distributor:", oldDistributor);
        console2.log("Controller:", CONTROLLER);
        console2.log("Treasury:", distributor.treasury());
        console2.log("Claim period:", distributor.CLAIM_PERIOD());
        console2.log("Recovery delay:", distributor.RECOVERY_DELAY());
    }
}
