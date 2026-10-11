// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {ProtocolController} from "../src/ProtocolController.sol";
import {ComputeAssetRegistry} from "../src/ComputeAssetRegistry.sol";
import {RevenueDistributor} from "../src/RevenueDistributor.sol";

contract MockPausableTarget {
    bool public paused;

    function pause() external {
        paused = true;
    }

    function unpause() external {
        paused = false;
    }
}

contract ProtocolControllerTest is Test {
    ProtocolController controller;
    MockPausableTarget target;

    address admin = makeAddr("admin");
    address pauser = makeAddr("pauser");
    address attacker = makeAddr("attacker");

    bytes32 constant REGISTRY_ID = keccak256("COMPUTE_ASSET_REGISTRY");

    
    function test_ControllerCanPauseAndUnpauseRealManagedContracts() public {
        ComputeAssetRegistry registry = new ComputeAssetRegistry(admin);
        RevenueDistributor distributor = new RevenueDistributor(admin);

        vm.startPrank(admin);

        // Grant controller the target contracts' admin role.
        registry.grantRole(
            registry.DEFAULT_ADMIN_ROLE(),
            address(controller)
        );
        distributor.grantRole(
            distributor.DEFAULT_ADMIN_ROLE(),
            address(controller)
        );

        controller.registerManagedContract(
            keccak256("COMPUTE_ASSET_REGISTRY"),
            address(registry)
        );

        controller.registerManagedContract(
            keccak256("REVENUE_DISTRIBUTOR"),
            address(distributor)
        );

        vm.stopPrank();

        // Exercise the actual permission path used by deployment.
        vm.startPrank(pauser);

        controller.pauseManagedContract(
            keccak256("COMPUTE_ASSET_REGISTRY")
        );
        controller.pauseManagedContract(
            keccak256("REVENUE_DISTRIBUTOR")
        );

        assertTrue(registry.paused());
        assertTrue(distributor.paused());

        controller.unpauseManagedContract(
            keccak256("COMPUTE_ASSET_REGISTRY")
        );
        controller.unpauseManagedContract(
            keccak256("REVENUE_DISTRIBUTOR")
        );

        vm.stopPrank();

        assertFalse(registry.paused());
        assertFalse(distributor.paused());
    }


    function setUp() public {
        controller = new ProtocolController(admin);
        target = new MockPausableTarget();

        vm.startPrank(admin);

        controller.grantRole(controller.PAUSER_ROLE(), pauser);

        vm.stopPrank();
    }

    function test_ConstructorGrantsAdminRoles() public view {
        assertTrue(controller.hasRole(controller.DEFAULT_ADMIN_ROLE(), admin));

        assertTrue(controller.hasRole(controller.ASSET_MANAGER_ROLE(), admin));

        assertTrue(controller.hasRole(controller.REVENUE_MANAGER_ROLE(), admin));

        assertTrue(controller.hasRole(controller.TOKEN_MANAGER_ROLE(), admin));

        assertTrue(controller.hasRole(controller.PAUSER_ROLE(), admin));
    }

    function test_RegisterManagedContract() public {
        vm.startPrank(admin);

        controller.registerManagedContract(REGISTRY_ID, address(target));

        vm.stopPrank();

        assertEq(controller.getManagedContract(REGISTRY_ID), address(target));

        assertTrue(controller.isManagedContract(REGISTRY_ID));
    }

    function test_RegisterZeroAddressReverts() public {
        vm.startPrank(admin);

        vm.expectRevert(ProtocolController.InvalidTarget.selector);

        controller.registerManagedContract(REGISTRY_ID, address(0));

        vm.stopPrank();
    }

    function test_DuplicateRegistrationReverts() public {
        vm.startPrank(admin);

        controller.registerManagedContract(REGISTRY_ID, address(target));

        vm.expectRevert(ProtocolController.TargetAlreadyRegistered.selector);

        controller.registerManagedContract(REGISTRY_ID, address(target));

        vm.stopPrank();
    }

    function test_UnauthorizedRegistrationReverts() public {
        vm.startPrank(attacker);

        vm.expectRevert();

        controller.registerManagedContract(REGISTRY_ID, address(target));

        vm.stopPrank();
    }

    function test_RemoveManagedContract() public {
        vm.startPrank(admin);

        controller.registerManagedContract(REGISTRY_ID, address(target));

        controller.removeManagedContract(REGISTRY_ID);

        vm.stopPrank();

        assertEq(controller.getManagedContract(REGISTRY_ID), address(0));

        assertFalse(controller.isManagedContract(REGISTRY_ID));
    }

    function test_RemoveUnknownContractReverts() public {
        vm.startPrank(admin);

        vm.expectRevert(ProtocolController.TargetNotRegistered.selector);

        controller.removeManagedContract(REGISTRY_ID);

        vm.stopPrank();
    }

    function test_PauserCanPauseManagedContract() public {
        vm.startPrank(admin);

        controller.registerManagedContract(REGISTRY_ID, address(target));

        vm.stopPrank();

        vm.startPrank(pauser);

        controller.pauseManagedContract(REGISTRY_ID);

        vm.stopPrank();

        assertTrue(target.paused());
    }

    function test_PauserCanUnpauseManagedContract() public {
        vm.startPrank(admin);

        controller.registerManagedContract(REGISTRY_ID, address(target));

        vm.stopPrank();

        vm.startPrank(pauser);

        controller.pauseManagedContract(REGISTRY_ID);
        controller.unpauseManagedContract(REGISTRY_ID);

        vm.stopPrank();

        assertFalse(target.paused());
    }

    function test_UnauthorizedPauseReverts() public {
        vm.startPrank(admin);

        controller.registerManagedContract(REGISTRY_ID, address(target));

        vm.stopPrank();

        vm.startPrank(attacker);

        vm.expectRevert();

        controller.pauseManagedContract(REGISTRY_ID);

        vm.stopPrank();
    }

    function test_PauseUnknownContractReverts() public {
        vm.startPrank(pauser);

        vm.expectRevert(ProtocolController.TargetNotRegistered.selector);

        controller.pauseManagedContract(REGISTRY_ID);

        vm.stopPrank();
    }

    function test_ControllerPause() public {
        vm.startPrank(admin);

        controller.pause();

        vm.stopPrank();

        assertTrue(controller.paused());
    }

    function test_ControllerUnpause() public {
        vm.startPrank(admin);

        controller.pause();
        controller.unpause();

        vm.stopPrank();

        assertFalse(controller.paused());
    }

    function testFuzz_RegisterDifferentContractIds(bytes32 contractId) public {
        vm.assume(contractId != bytes32(0));

        vm.startPrank(admin);

        controller.registerManagedContract(contractId, address(target));

        vm.stopPrank();

        assertEq(controller.getManagedContract(contractId), address(target));
    }
}
