// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

interface IProtocolPausable {
    function pause() external;
    function unpause() external;
}

contract ProtocolController is AccessControl, Pausable {
    bytes32 public constant ASSET_MANAGER_ROLE = keccak256("ASSET_MANAGER_ROLE");

    bytes32 public constant REVENUE_MANAGER_ROLE = keccak256("REVENUE_MANAGER_ROLE");

    bytes32 public constant TOKEN_MANAGER_ROLE = keccak256("TOKEN_MANAGER_ROLE");

    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    error InvalidAdmin();
    error InvalidTarget();
    error TargetAlreadyRegistered();
    error TargetNotRegistered();

    event ManagedContractRegistered(bytes32 indexed contractId, address indexed contractAddress);

    event ManagedContractRemoved(bytes32 indexed contractId, address indexed contractAddress);

    event ManagedContractPaused(bytes32 indexed contractId, address indexed contractAddress);

    event ManagedContractUnpaused(bytes32 indexed contractId, address indexed contractAddress);

    mapping(bytes32 => address) private _managedContracts;

    constructor(address admin) {
        if (admin == address(0)) {
            revert InvalidAdmin();
        }

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ASSET_MANAGER_ROLE, admin);
        _grantRole(REVENUE_MANAGER_ROLE, admin);
        _grantRole(TOKEN_MANAGER_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
    }

    /**
     * @notice Register a protocol contract that can be centrally controlled.
     */
    function registerManagedContract(bytes32 contractId, address contractAddress)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        if (contractAddress == address(0)) {
            revert InvalidTarget();
        }

        if (_managedContracts[contractId] != address(0)) {
            revert TargetAlreadyRegistered();
        }

        _managedContracts[contractId] = contractAddress;

        emit ManagedContractRegistered(contractId, contractAddress);
    }

    /**
     * @notice Remove a managed contract from the controller registry.
     */
    function removeManagedContract(bytes32 contractId) external onlyRole(DEFAULT_ADMIN_ROLE) {
        address contractAddress = _managedContracts[contractId];

        if (contractAddress == address(0)) {
            revert TargetNotRegistered();
        }

        delete _managedContracts[contractId];

        emit ManagedContractRemoved(contractId, contractAddress);
    }

    /**
     * @notice Pause a registered protocol contract.
     */
    function pauseManagedContract(bytes32 contractId) external onlyRole(PAUSER_ROLE) {
        address contractAddress = _managedContracts[contractId];

        if (contractAddress == address(0)) {
            revert TargetNotRegistered();
        }

        IProtocolPausable(contractAddress).pause();

        emit ManagedContractPaused(contractId, contractAddress);
    }

    /**
     * @notice Unpause a registered protocol contract.
     */
    function unpauseManagedContract(bytes32 contractId) external onlyRole(PAUSER_ROLE) {
        address contractAddress = _managedContracts[contractId];

        if (contractAddress == address(0)) {
            revert TargetNotRegistered();
        }

        IProtocolPausable(contractAddress).unpause();

        emit ManagedContractUnpaused(contractId, contractAddress);
    }

    function getManagedContract(bytes32 contractId) external view returns (address) {
        return _managedContracts[contractId];
    }

    function isManagedContract(bytes32 contractId) external view returns (bool) {
        return _managedContracts[contractId] != address(0);
    }

    /**
     * @notice Pause the controller itself.
     */
    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    /**
     * @notice Unpause the controller itself.
     */
    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }
}
