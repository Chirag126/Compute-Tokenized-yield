// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract ComputeIntentRegistry {
    event ComputeIntentRegistered(
        address indexed user,
        string provider,
        string offerId,
        uint256 timestamp
    );

    error EmptyProvider();
    error EmptyOfferId();

    function registerIntent(
        string calldata provider,
        string calldata offerId
    ) external {
        if (bytes(provider).length == 0) revert EmptyProvider();
        if (bytes(offerId).length == 0) revert EmptyOfferId();

        emit ComputeIntentRegistered(
            msg.sender,
            provider,
            offerId,
            block.timestamp
        );
    }
}
