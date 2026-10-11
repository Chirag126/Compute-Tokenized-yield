// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {ComputeAssetToken} from "../src/ComputeAssetToken.sol";

contract ComputeAssetTokenTest is Test {
    ComputeAssetToken token;

    address admin = makeAddr("admin");
    address holderA = makeAddr("holderA");
    address holderB = makeAddr("holderB");
    address attacker = makeAddr("attacker");

    uint256 constant ASSET_ID = 1;
    address constant REGISTRY = 0x1234567890123456789012345678901234567890;

    function setUp() public {
        token = new ComputeAssetToken("Compute Asset 001", "CA001", ASSET_ID, REGISTRY, admin);
    }

    function test_Constructor() public view {
        assertEq(token.name(), "Compute Asset 001");
        assertEq(token.symbol(), "CA001");
        assertEq(token.assetId(), ASSET_ID);
        assertEq(token.registry(), REGISTRY);

        assertTrue(token.hasRole(token.DEFAULT_ADMIN_ROLE(), admin));

        assertTrue(token.hasRole(token.TOKEN_MANAGER_ROLE(), admin));
    }

    function test_Mint() public {
        vm.startPrank(admin);

        token.mint(holderA, 1_000 ether);

        vm.stopPrank();

        assertEq(token.balanceOf(holderA), 1_000 ether);
        assertEq(token.totalSupply(), 1_000 ether);
    }

    function test_MultipleHolders() public {
        vm.startPrank(admin);

        token.mint(holderA, 400 ether);
        token.mint(holderB, 600 ether);

        vm.stopPrank();

        assertEq(token.balanceOf(holderA), 400 ether);
        assertEq(token.balanceOf(holderB), 600 ether);
        assertEq(token.totalSupply(), 1_000 ether);
    }

    function test_Transfer() public {
        vm.startPrank(admin);
        token.mint(holderA, 1_000 ether);
        vm.stopPrank();

        vm.startPrank(holderA);
        token.transfer(holderB, 250 ether);
        vm.stopPrank();

        assertEq(token.balanceOf(holderA), 750 ether);
        assertEq(token.balanceOf(holderB), 250 ether);
    }

    function test_Burn() public {
        vm.startPrank(admin);

        token.mint(holderA, 1_000 ether);
        token.burn(holderA, 300 ether);

        vm.stopPrank();

        assertEq(token.balanceOf(holderA), 700 ether);
        assertEq(token.totalSupply(), 700 ether);
    }

    function test_DelegationCreatesHistoricalCheckpoint() public {
        vm.startPrank(admin);
        token.mint(holderA, 1_000 ether);
        vm.stopPrank();

        vm.startPrank(holderA);
        token.delegate(holderA);
        vm.stopPrank();

        uint256 snapshotBlock = block.number;

        vm.roll(block.number + 1);

        assertEq(token.getPastVotes(holderA, snapshotBlock), 1_000 ether);
    }

    function test_HistoricalOwnershipChangesAfterTransfer() public {
        // Mint 1,000 tokens to holder A.
        vm.startPrank(admin);

        token.mint(holderA, 1_000 ether);

        vm.stopPrank();

        // Holder A delegates to itself so ERC20Votes tracks its voting power.
        vm.startPrank(holderA);

        token.delegate(holderA);

        vm.stopPrank();

        // Move to a clean block containing the 1,000-token checkpoint.
        vm.roll(block.number + 1);

        // Record the historical block.
        uint256 snapshotBlock = block.number;

        // IMPORTANT:
        // Move to a NEW block before performing the transfer.
        vm.roll(block.number + 1);

        // Transfer 400 tokens after the snapshot.
        vm.startPrank(holderA);

        token.transfer(holderB, 400 ether);

        vm.stopPrank();

        // Holder B delegates after receiving the tokens.
        vm.startPrank(holderB);

        token.delegate(holderB);

        vm.stopPrank();

        // Move forward so the new checkpoints are finalized.
        vm.roll(block.number + 1);

        // Historical snapshot:
        // A had 1,000 tokens.
        // B had 0 tokens.
        assertEq(token.getPastVotes(holderA, snapshotBlock), 1_000 ether);

        assertEq(token.getPastVotes(holderB, snapshotBlock), 0);

        // Current historical block:
        // A has 600 tokens.
        // B has 400 tokens.
        assertEq(token.getPastVotes(holderA, block.number - 1), 600 ether);

        assertEq(token.getPastVotes(holderB, block.number - 1), 400 ether);
    }

    function test_RevertWhen_UnauthorizedMint() public {
        vm.startPrank(attacker);

        vm.expectRevert(
            abi.encodeWithSelector(
                bytes4(keccak256("AccessControlUnauthorizedAccount(address,bytes32)")),
                attacker,
                token.TOKEN_MANAGER_ROLE()
            )
        );

        token.mint(holderA, 100 ether);

        vm.stopPrank();
    }

    function test_RevertWhen_MintZeroAmount() public {
        vm.startPrank(admin);

        vm.expectRevert(ComputeAssetToken.InvalidAmount.selector);

        token.mint(holderA, 0);

        vm.stopPrank();
    }

    function test_RevertWhen_MintToZeroAddress() public {
        vm.startPrank(admin);

        vm.expectRevert(ComputeAssetToken.InvalidRecipient.selector);

        token.mint(address(0), 100 ether);

        vm.stopPrank();
    }

    function test_RevertWhen_BurnZeroAmount() public {
        vm.startPrank(admin);

        vm.expectRevert(ComputeAssetToken.InvalidAmount.selector);

        token.burn(holderA, 0);

        vm.stopPrank();
    }

    function test_RevertWhen_UnauthorizedBurn() public {
        vm.startPrank(attacker);

        vm.expectRevert(
            abi.encodeWithSelector(
                bytes4(keccak256("AccessControlUnauthorizedAccount(address,bytes32)")),
                attacker,
                token.TOKEN_MANAGER_ROLE()
            )
        );

        token.burn(holderA, 100 ether);

        vm.stopPrank();
    }

    function test_PauseBlocksMint() public {
        vm.startPrank(admin);

        token.pause();

        vm.expectRevert(abi.encodeWithSignature("EnforcedPause()"));

        token.mint(holderA, 100 ether);

        vm.stopPrank();
    }

    function test_PauseBlocksBurn() public {
        vm.startPrank(admin);

        token.mint(holderA, 1_000 ether);
        token.pause();

        vm.expectRevert(abi.encodeWithSignature("EnforcedPause()"));

        token.burn(holderA, 100 ether);

        vm.stopPrank();
    }

    function test_PauseBlocksTransfers() public {
        vm.startPrank(admin);

        token.mint(holderA, 1_000 ether);
        token.pause();

        vm.stopPrank();

        vm.startPrank(holderA);

        vm.expectRevert(abi.encodeWithSignature("EnforcedPause()"));

        token.transfer(holderB, 100 ether);

        vm.stopPrank();
    }

    function test_UnpauseRestoresTransfers() public {
        vm.startPrank(admin);

        token.mint(holderA, 1_000 ether);
        token.pause();
        token.unpause();

        vm.stopPrank();

        vm.startPrank(holderA);

        token.transfer(holderB, 100 ether);

        vm.stopPrank();

        assertEq(token.balanceOf(holderA), 900 ether);
        assertEq(token.balanceOf(holderB), 100 ether);
    }

    function test_RevertWhen_UnauthorizedPause() public {
        vm.startPrank(attacker);

        vm.expectRevert(
            abi.encodeWithSelector(
                bytes4(keccak256("AccessControlUnauthorizedAccount(address,bytes32)")),
                attacker,
                token.DEFAULT_ADMIN_ROLE()
            )
        );

        token.pause();

        vm.stopPrank();
    }

    function testFuzz_Mint(address recipient, uint128 amount) public {
        vm.assume(recipient != address(0));
        vm.assume(amount > 0);

        vm.startPrank(admin);

        token.mint(recipient, amount);

        vm.stopPrank();

        assertEq(token.balanceOf(recipient), amount);
        assertEq(token.totalSupply(), amount);
    }
}
