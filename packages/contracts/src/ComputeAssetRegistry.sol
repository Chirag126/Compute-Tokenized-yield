// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

contract ComputeAssetRegistry is AccessControl, Pausable {
    bytes32 public constant ASSET_MANAGER_ROLE = keccak256("ASSET_MANAGER_ROLE");

    enum AssetStatus {
        Inactive,
        Active,
        Paused,
        Retired
    }

    struct ComputeAsset {
        uint256 assetId;
        bytes32 externalAssetId;
        address provider;
        string metadataURI;
        AssetStatus status;
        uint64 createdAt;
        uint64 updatedAt;
    }

    uint256 private _nextAssetId = 1;

    mapping(uint256 => ComputeAsset) private _assets;

    error AssetDoesNotExist(uint256 assetId);
    error InvalidExternalAssetId();
    error InvalidProvider();
    error InvalidMetadataURI();
    error AssetAlreadyRetired(uint256 assetId);

    event AssetRegistered(
        uint256 indexed assetId, bytes32 indexed externalAssetId, address indexed provider, string metadataURI
    );

    event AssetStatusUpdated(uint256 indexed assetId, AssetStatus previousStatus, AssetStatus newStatus);

    event AssetMetadataUpdated(uint256 indexed assetId, string previousMetadataURI, string newMetadataURI);

    constructor(address admin) {
        if (admin == address(0)) {
            revert InvalidProvider();
        }

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ASSET_MANAGER_ROLE, admin);
    }

    function registerAsset(bytes32 externalAssetId, address provider, string calldata metadataURI)
        external
        onlyRole(ASSET_MANAGER_ROLE)
        whenNotPaused
        returns (uint256 assetId)
    {
        if (externalAssetId == bytes32(0)) {
            revert InvalidExternalAssetId();
        }

        if (provider == address(0)) {
            revert InvalidProvider();
        }

        if (bytes(metadataURI).length == 0) {
            revert InvalidMetadataURI();
        }

        assetId = _nextAssetId++;

        uint64 timestamp = uint64(block.timestamp);

        _assets[assetId] = ComputeAsset({
            assetId: assetId,
            externalAssetId: externalAssetId,
            provider: provider,
            metadataURI: metadataURI,
            status: AssetStatus.Active,
            createdAt: timestamp,
            updatedAt: timestamp
        });

        emit AssetRegistered(assetId, externalAssetId, provider, metadataURI);
    }

    function setAssetStatus(uint256 assetId, AssetStatus newStatus)
        external
        onlyRole(ASSET_MANAGER_ROLE)
        whenNotPaused
    {
        ComputeAsset storage asset = _getAsset(assetId);

        if (asset.status == AssetStatus.Retired) {
            revert AssetAlreadyRetired(assetId);
        }

        AssetStatus previousStatus = asset.status;

        asset.status = newStatus;
        asset.updatedAt = uint64(block.timestamp);

        emit AssetStatusUpdated(assetId, previousStatus, newStatus);
    }

    function updateAssetMetadata(uint256 assetId, string calldata newMetadataURI)
        external
        onlyRole(ASSET_MANAGER_ROLE)
        whenNotPaused
    {
        if (bytes(newMetadataURI).length == 0) {
            revert InvalidMetadataURI();
        }

        ComputeAsset storage asset = _getAsset(assetId);

        string memory previousMetadataURI = asset.metadataURI;

        asset.metadataURI = newMetadataURI;
        asset.updatedAt = uint64(block.timestamp);

        emit AssetMetadataUpdated(assetId, previousMetadataURI, newMetadataURI);
    }

    function getAsset(uint256 assetId) external view returns (ComputeAsset memory) {
        return _getAsset(assetId);
    }

    function assetExists(uint256 assetId) external view returns (bool) {
        return assetId > 0 && assetId < _nextAssetId;
    }

    function nextAssetId() external view returns (uint256) {
        return _nextAssetId;
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    function _getAsset(uint256 assetId) internal view returns (ComputeAsset storage asset) {
        if (assetId == 0 || assetId >= _nextAssetId) {
            revert AssetDoesNotExist(assetId);
        }

        asset = _assets[assetId];
    }
}
