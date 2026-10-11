// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {ERC20Votes} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import {Nonces} from "@openzeppelin/contracts/utils/Nonces.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

contract ComputeAssetToken is ERC20, ERC20Permit, ERC20Votes, AccessControl, Pausable {
    bytes32 public constant TOKEN_MANAGER_ROLE = keccak256("TOKEN_MANAGER_ROLE");

    uint256 public immutable assetId;
    address public immutable registry;

    error InvalidAdmin();
    error InvalidRegistry();
    error InvalidAssetId();
    error InvalidRecipient();
    error InvalidAmount();

    constructor(string memory name_, string memory symbol_, uint256 assetId_, address registry_, address admin_)
        ERC20(name_, symbol_)
        ERC20Permit(name_)
    {
        if (assetId_ == 0) {
            revert InvalidAssetId();
        }

        if (registry_ == address(0)) {
            revert InvalidRegistry();
        }

        if (admin_ == address(0)) {
            revert InvalidAdmin();
        }

        assetId = assetId_;
        registry = registry_;

        _grantRole(DEFAULT_ADMIN_ROLE, admin_);
        _grantRole(TOKEN_MANAGER_ROLE, admin_);
    }

    function mint(address to, uint256 amount) external onlyRole(TOKEN_MANAGER_ROLE) whenNotPaused {
        if (to == address(0)) {
            revert InvalidRecipient();
        }

        if (amount == 0) {
            revert InvalidAmount();
        }

        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external onlyRole(TOKEN_MANAGER_ROLE) whenNotPaused {
        if (from == address(0)) {
            revert InvalidRecipient();
        }

        if (amount == 0) {
            revert InvalidAmount();
        }

        _burn(from, amount);
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    function _update(address from, address to, uint256 value) internal override(ERC20, ERC20Votes) whenNotPaused {
        super._update(from, to, value);
    }

    function nonces(address owner) public view override(ERC20Permit, Nonces) returns (uint256) {
        return super.nonces(owner);
    }
}
