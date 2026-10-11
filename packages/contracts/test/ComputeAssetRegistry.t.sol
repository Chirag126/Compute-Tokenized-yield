// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {ComputeAssetRegistry} from "../src/ComputeAssetRegistry.sol";

contract ComputeAssetRegistryTest is Test {
    ComputeAssetRegistry registry;

    address admin = makeAddr("admin");
    address assetManager = makeAddr("assetManager");
    address provider = makeAddr("provider");
    address attacker = makeAddr("attacker");

    bytes32 externalAssetId = keccak256("vast-ai-instance-001");

    string metadataURI = "ipfs://compute-asset-001";

    function setUp() public {
        registry = new ComputeAssetRegistry(admin);

        vm.startPrank(admin);

        registry.grantRole(registry.ASSET_MANAGER_ROLE(), assetManager);

        vm.stopPrank();
    }

    function test_InitialRoles() public view {
        assertTrue(registry.hasRole(registry.DEFAULT_ADMIN_ROLE(), admin));

        assertTrue(registry.hasRole(registry.ASSET_MANAGER_ROLE(), admin));

        assertTrue(registry.hasRole(registry.ASSET_MANAGER_ROLE(), assetManager));
    }

    function test_RegisterAsset() public {
        vm.prank(assetManager);

        uint256 assetId = registry.registerAsset(externalAssetId, provider, metadataURI);

        assertEq(assetId, 1);
        assertEq(registry.nextAssetId(), 2);
        assertTrue(registry.assetExists(assetId));

        ComputeAssetRegistry.ComputeAsset memory asset = registry.getAsset(assetId);

        assertEq(asset.assetId, 1);
        assertEq(asset.externalAssetId, externalAssetId);
        assertEq(asset.provider, provider);
        assertEq(asset.metadataURI, metadataURI);

        assertEq(uint256(asset.status), uint256(ComputeAssetRegistry.AssetStatus.Active));

        assertGt(asset.createdAt, 0);
        assertEq(asset.createdAt, asset.updatedAt);
    }

    function test_RegisterMultipleAssets() public {
        vm.startPrank(assetManager);

        uint256 firstAssetId = registry.registerAsset(externalAssetId, provider, metadataURI);

        uint256 secondAssetId =
            registry.registerAsset(keccak256("vast-ai-instance-002"), provider, "ipfs://compute-asset-002");

        vm.stopPrank();

        assertEq(firstAssetId, 1);
        assertEq(secondAssetId, 2);
        assertEq(registry.nextAssetId(), 3);
    }

    function test_RevertWhen_UnauthorizedRegistration() public {
        vm.startPrank(attacker);

        vm.expectRevert(
            abi.encodeWithSelector(
                bytes4(keccak256("AccessControlUnauthorizedAccount(address,bytes32)")),
                attacker,
                registry.ASSET_MANAGER_ROLE()
            )
        );

        registry.registerAsset(externalAssetId, provider, metadataURI);
    }

    function test_RevertWhen_ExternalAssetIdIsZero() public {
        vm.prank(assetManager);

        vm.expectRevert(ComputeAssetRegistry.InvalidExternalAssetId.selector);

        registry.registerAsset(bytes32(0), provider, metadataURI);
    }

    function test_RevertWhen_ProviderIsZero() public {
        vm.prank(assetManager);

        vm.expectRevert(ComputeAssetRegistry.InvalidProvider.selector);

        registry.registerAsset(externalAssetId, address(0), metadataURI);
    }

    function test_RevertWhen_MetadataIsEmpty() public {
        vm.prank(assetManager);

        vm.expectRevert(ComputeAssetRegistry.InvalidMetadataURI.selector);

        registry.registerAsset(externalAssetId, provider, "");
    }

    function test_UpdateAssetStatus() public {
        vm.prank(assetManager);

        uint256 assetId = registry.registerAsset(externalAssetId, provider, metadataURI);

        vm.prank(assetManager);

        registry.setAssetStatus(assetId, ComputeAssetRegistry.AssetStatus.Paused);

        ComputeAssetRegistry.ComputeAsset memory asset = registry.getAsset(assetId);

        assertEq(uint256(asset.status), uint256(ComputeAssetRegistry.AssetStatus.Paused));
    }

    function test_UpdateMetadata() public {
        vm.prank(assetManager);

        uint256 assetId = registry.registerAsset(externalAssetId, provider, metadataURI);

        string memory newURI = "ipfs://compute-asset-001-v2";

        vm.prank(assetManager);

        registry.updateAssetMetadata(assetId, newURI);

        ComputeAssetRegistry.ComputeAsset memory asset = registry.getAsset(assetId);

        assertEq(asset.metadataURI, newURI);
    }

    function test_RevertWhen_UpdatingRetiredAsset() public {
        vm.prank(assetManager);

        uint256 assetId = registry.registerAsset(externalAssetId, provider, metadataURI);

        vm.prank(assetManager);

        registry.setAssetStatus(assetId, ComputeAssetRegistry.AssetStatus.Retired);

        vm.prank(assetManager);

        vm.expectRevert(abi.encodeWithSelector(ComputeAssetRegistry.AssetAlreadyRetired.selector, assetId));

        registry.setAssetStatus(assetId, ComputeAssetRegistry.AssetStatus.Active);
    }

    function test_RevertWhen_AssetDoesNotExist() public {
        vm.expectRevert(abi.encodeWithSelector(ComputeAssetRegistry.AssetDoesNotExist.selector, 999));

        registry.getAsset(999);
    }

    function test_PauseBlocksRegistration() public {
        vm.prank(admin);
        registry.pause();

        vm.prank(assetManager);

        vm.expectRevert(abi.encodeWithSignature("EnforcedPause()"));

        registry.registerAsset(externalAssetId, provider, metadataURI);
    }

    function test_UnpauseRestoresRegistration() public {
        vm.prank(admin);
        registry.pause();

        vm.prank(admin);
        registry.unpause();

        vm.prank(assetManager);

        uint256 assetId = registry.registerAsset(externalAssetId, provider, metadataURI);

        assertEq(assetId, 1);
    }

    function testFuzz_RegisterAsset(bytes32 randomExternalAssetId, address randomProvider) public {
        vm.assume(randomExternalAssetId != bytes32(0));
        vm.assume(randomProvider != address(0));

        vm.prank(assetManager);

        uint256 assetId = registry.registerAsset(randomExternalAssetId, randomProvider, metadataURI);

        assertEq(assetId, 1);

        ComputeAssetRegistry.ComputeAsset memory asset = registry.getAsset(assetId);

        assertEq(asset.externalAssetId, randomExternalAssetId);

        assertEq(asset.provider, randomProvider);
    }
}
