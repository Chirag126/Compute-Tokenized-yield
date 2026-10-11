// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {RevenueDistributor} from "../src/RevenueDistributor.sol";
import {ComputeAssetToken} from "../src/ComputeAssetToken.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockRevenueToken is ERC20 {
    constructor() ERC20("Mock Revenue Token", "MREV") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract RejectingRevenueToken is ERC20 {
    bool public rejectTransfers;

    constructor() ERC20("Rejecting Revenue Token", "RREV") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function setRejectTransfers(bool reject) external {
        rejectTransfers = reject;
    }

    function transfer(address to, uint256 value) public override returns (bool) {
        require(!rejectTransfers, "payout rejected");
        return super.transfer(to, value);
    }
}
contract ReentrantRevenueToken is ERC20 {
    address public target;
    uint256 public distributionId;
    bool public attempted;
    bool public nestedClaimSucceeded;

    constructor() ERC20("Reentrant Revenue Token", "RRT") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function configure(address target_, uint256 distributionId_) external {
        target = target_;
        distributionId = distributionId_;
    }

    function transfer(address to, uint256 value) public override returns (bool) {
        if (!attempted && msg.sender == target) {
            attempted = true;
            (nestedClaimSucceeded,) = target.call(
                abi.encodeWithSignature("claim(uint256)", distributionId)
            );
        }

        return super.transfer(to, value);
    }
}
contract RevenueDistributorTest is Test {
    RevenueDistributor distributor;
    ComputeAssetToken assetToken;
    MockRevenueToken revenueToken;

    address admin = makeAddr("admin");
    address holderA = makeAddr("holderA");
    address holderB = makeAddr("holderB");
    address attacker = makeAddr("attacker");

    uint256 constant ASSET_ID = 1;
    address constant REGISTRY = address(0x1234);

    function setUp() public {
        distributor = new RevenueDistributor(admin);

        assetToken = new ComputeAssetToken("Compute Asset 001", "CA001", ASSET_ID, REGISTRY, admin);

        revenueToken = new MockRevenueToken();

        vm.startPrank(admin);

        assetToken.mint(holderA, 600 ether);
        assetToken.mint(holderB, 400 ether);

        vm.stopPrank();

        vm.startPrank(holderA);
        assetToken.delegate(holderA);
        vm.stopPrank();

        vm.startPrank(holderB);
        assetToken.delegate(holderB);
        vm.stopPrank();

        revenueToken.mint(admin, 2_000 ether);
    }

    function _createSnapshot() internal returns (uint256 snapshotBlock) {
        vm.roll(block.number + 1);

        snapshotBlock = block.number;

        vm.roll(block.number + 1);
    }

    function _approveAndDeposit(uint256 snapshotBlock, uint256 amount) internal returns (uint256 distributionId) {
        vm.startPrank(admin);

        revenueToken.approve(address(distributor), amount);

        distributionId = distributor.depositRevenue(address(assetToken), address(revenueToken), snapshotBlock, amount);

        vm.stopPrank();
    }

    function test_Constructor() public view {
        assertTrue(distributor.hasRole(distributor.DEFAULT_ADMIN_ROLE(), admin));

        assertTrue(distributor.hasRole(distributor.REVENUE_MANAGER_ROLE(), admin));
    }

    function test_DepositRevenue() public {
        uint256 snapshotBlock = _createSnapshot();

        uint256 distributionId = _approveAndDeposit(snapshotBlock, 1_000 ether);

        assertEq(distributionId, 1);

        RevenueDistributor.Distribution memory distribution = distributor.getDistribution(distributionId);

        assertEq(distribution.distributionId, 1);

        assertEq(distribution.token, address(assetToken));

        assertEq(distribution.revenueToken, address(revenueToken));

        assertEq(distribution.snapshotBlock, snapshotBlock);

        assertEq(distribution.totalSupply, 1_000 ether);

        assertEq(distribution.amount, 1_000 ether);

        assertGt(distribution.amountPerToken, 0);

        assertEq(distribution.claimedAmount, 0);

        assertTrue(distribution.active);

        assertEq(revenueToken.balanceOf(address(distributor)), 1_000 ether);
    }

    function test_ClaimDistributesAccordingToHistoricalOwnership() public {
        uint256 snapshotBlock = _createSnapshot();

        _approveAndDeposit(snapshotBlock, 1_000 ether);

        vm.startPrank(holderA);

        uint256 beforeBalance = revenueToken.balanceOf(holderA);

        uint256 claimed = distributor.claim(1);

        uint256 afterBalance = revenueToken.balanceOf(holderA);

        vm.stopPrank();

        assertEq(claimed, 600 ether);

        assertEq(afterBalance - beforeBalance, 600 ether);
    }

    function test_CannotClaimTwice() public {
        uint256 snapshotBlock = _createSnapshot();

        _approveAndDeposit(snapshotBlock, 1_000 ether);

        vm.startPrank(holderA);

        distributor.claim(1);

        vm.expectRevert(RevenueDistributor.AlreadyClaimed.selector);

        distributor.claim(1);

        vm.stopPrank();
    }

    function test_NoOwnershipCannotClaim() public {
        uint256 snapshotBlock = _createSnapshot();

        _approveAndDeposit(snapshotBlock, 1_000 ether);

        vm.startPrank(attacker);

        vm.expectRevert(RevenueDistributor.NothingToClaim.selector);

        distributor.claim(1);

        vm.stopPrank();
    }

    function test_MultipleDistributions() public {
        uint256 firstSnapshot = _createSnapshot();

        _approveAndDeposit(firstSnapshot, 1_000 ether);

        vm.startPrank(holderA);

        assetToken.transfer(holderB, 200 ether);

        vm.stopPrank();

        uint256 secondSnapshot = _createSnapshot();

        _approveAndDeposit(secondSnapshot, 1_000 ether);

        vm.startPrank(holderA);

        distributor.claim(1);
        distributor.claim(2);

        vm.stopPrank();

        vm.startPrank(holderB);

        distributor.claim(1);
        distributor.claim(2);

        vm.stopPrank();

        assertEq(revenueToken.balanceOf(holderA), 600 ether + 400 ether);

        assertEq(revenueToken.balanceOf(holderB), 400 ether + 600 ether);
    }

    function test_DeactivateDistribution() public {
        uint256 snapshotBlock = _createSnapshot();

        _approveAndDeposit(snapshotBlock, 1_000 ether);

        vm.startPrank(admin);

        distributor.deactivateDistribution(1);

        vm.stopPrank();

        RevenueDistributor.Distribution memory distribution = distributor.getDistribution(1);

        assertFalse(distribution.active);
    }

    function test_DeactivatedDistributionCannotBeClaimed() public {
        uint256 snapshotBlock = _createSnapshot();

        _approveAndDeposit(snapshotBlock, 1_000 ether);

        vm.startPrank(admin);

        distributor.deactivateDistribution(1);

        vm.stopPrank();

        vm.startPrank(holderA);

        vm.expectRevert(RevenueDistributor.DistributionInactive.selector);

        distributor.claim(1);

        vm.stopPrank();
    }

    function test_InvalidSnapshotReverts() public {
        uint256 snapshotBlock = block.number;

        vm.startPrank(admin);

        revenueToken.approve(address(distributor), 1_000 ether);

        vm.expectRevert(RevenueDistributor.InvalidSnapshot.selector);

        distributor.depositRevenue(address(assetToken), address(revenueToken), snapshotBlock, 1_000 ether);

        vm.stopPrank();
    }

    function test_FutureSnapshotReverts() public {
        uint256 futureBlock = block.number + 10;

        vm.startPrank(admin);

        revenueToken.approve(address(distributor), 1_000 ether);

        vm.expectRevert(RevenueDistributor.InvalidSnapshot.selector);

        distributor.depositRevenue(address(assetToken), address(revenueToken), futureBlock, 1_000 ether);

        vm.stopPrank();
    }

    function test_ZeroRevenueReverts() public {
        uint256 snapshotBlock = _createSnapshot();

        vm.startPrank(admin);

        vm.expectRevert(RevenueDistributor.InvalidAmount.selector);

        distributor.depositRevenue(address(assetToken), address(revenueToken), snapshotBlock, 0);

        vm.stopPrank();
    }

    function test_UnauthorizedDepositReverts() public {
        uint256 snapshotBlock = _createSnapshot();

        vm.startPrank(attacker);

        vm.expectRevert();

        distributor.depositRevenue(address(assetToken), address(revenueToken), snapshotBlock, 1_000 ether);

        vm.stopPrank();
    }

    function test_PauseBlocksDeposit() public {
        uint256 snapshotBlock = _createSnapshot();

        vm.startPrank(admin);

        distributor.pause();

        vm.stopPrank();

        vm.startPrank(admin);

        revenueToken.approve(address(distributor), 1_000 ether);

        vm.expectRevert();

        distributor.depositRevenue(address(assetToken), address(revenueToken), snapshotBlock, 1_000 ether);

        vm.stopPrank();
    }

    function test_PauseBlocksClaim() public {
        uint256 snapshotBlock = _createSnapshot();

        _approveAndDeposit(snapshotBlock, 1_000 ether);

        vm.startPrank(admin);

        distributor.pause();

        vm.stopPrank();

        vm.startPrank(holderA);

        vm.expectRevert();

        distributor.claim(1);

        vm.stopPrank();
    }

    function test_HistoricalSupplyIsUsed() public {
        uint256 snapshotBlock = _createSnapshot();

        vm.startPrank(admin);

        assetToken.mint(admin, 1_000 ether);

        vm.stopPrank();

        uint256 distributionId = _approveAndDeposit(snapshotBlock, 1_000 ether);

        RevenueDistributor.Distribution memory distribution = distributor.getDistribution(distributionId);

        assertEq(distribution.totalSupply, 1_000 ether);

        assertEq(distribution.amount, 1_000 ether);
    }

    function test_MintAfterSnapshotDoesNotChangeHistoricalEntitlement() public {
        uint256 snapshotBlock = _createSnapshot();

        vm.startPrank(admin);

        assetToken.mint(admin, 1_000 ether);

        vm.stopPrank();

        _approveAndDeposit(snapshotBlock, 1_000 ether);

        vm.startPrank(holderA);

        uint256 beforeBalance = revenueToken.balanceOf(holderA);

        distributor.claim(1);

        uint256 afterBalance = revenueToken.balanceOf(holderA);

        vm.stopPrank();

        assertEq(afterBalance - beforeBalance, 600 ether);
    }

    function test_BurnAfterSnapshotDoesNotChangeHistoricalEntitlement() public {
        uint256 snapshotBlock = _createSnapshot();

        vm.startPrank(admin);

        assetToken.burn(holderA, 400 ether);

        vm.stopPrank();

        _approveAndDeposit(snapshotBlock, 1_000 ether);

        vm.startPrank(holderA);

        uint256 beforeBalance = revenueToken.balanceOf(holderA);

        distributor.claim(1);

        uint256 afterBalance = revenueToken.balanceOf(holderA);

        vm.stopPrank();

        assertEq(afterBalance - beforeBalance, 600 ether);
    }

    function test_TwoHoldersReceiveExactlyTheirHistoricalShare() public {
        uint256 snapshotBlock = _createSnapshot();

        _approveAndDeposit(snapshotBlock, 1_000 ether);

        vm.startPrank(holderA);

        distributor.claim(1);

        vm.stopPrank();

        vm.startPrank(holderB);

        distributor.claim(1);

        vm.stopPrank();

        assertEq(revenueToken.balanceOf(holderA), 600 ether);

        assertEq(revenueToken.balanceOf(holderB), 400 ether);
    }

    function test_TransferAfterSnapshotDoesNotChangeClaim() public {
        uint256 snapshotBlock = _createSnapshot();

        vm.startPrank(holderA);

        assetToken.transfer(holderB, 600 ether);

        vm.stopPrank();

        _approveAndDeposit(snapshotBlock, 1_000 ether);

        vm.startPrank(holderA);

        distributor.claim(1);

        vm.stopPrank();

        vm.startPrank(holderB);

        distributor.claim(1);

        vm.stopPrank();

        assertEq(revenueToken.balanceOf(holderA), 600 ether);

        assertEq(revenueToken.balanceOf(holderB), 400 ether);
    }

    function test_RoundingDoesNotOverDistribute() public {
        uint256 snapshotBlock = _createSnapshot();

        _approveAndDeposit(snapshotBlock, 1_000 ether);

        vm.startPrank(holderA);

        distributor.claim(1);

        vm.stopPrank();

        vm.startPrank(holderB);

        distributor.claim(1);

        vm.stopPrank();

        uint256 distributed = revenueToken.balanceOf(holderA) + revenueToken.balanceOf(holderB);

        assertLe(distributed, 1_000 ether);
    }

    function test_DistributionClaimedAmountMatchesClaims() public {
        uint256 snapshotBlock = _createSnapshot();

        _approveAndDeposit(snapshotBlock, 1_000 ether);

        vm.startPrank(holderA);

        distributor.claim(1);

        vm.stopPrank();

        vm.startPrank(holderB);

        distributor.claim(1);

        vm.stopPrank();

        RevenueDistributor.Distribution memory distribution = distributor.getDistribution(1);

        assertEq(distribution.claimedAmount, 1_000 ether);
    }

    function testFuzz_DepositPositiveAmount(uint96 amount) public {
        // Revenue must be large enough to produce a non-zero
        // amountPerToken at the current 1e18 precision.
        vm.assume(uint256(amount) >= 1_000);

        uint256 snapshotBlock = _createSnapshot();

        revenueToken.mint(admin, uint256(amount));

        vm.startPrank(admin);

        revenueToken.approve(address(distributor), uint256(amount));

        uint256 distributionId =
            distributor.depositRevenue(address(assetToken), address(revenueToken), snapshotBlock, uint256(amount));

        vm.stopPrank();

        assertEq(distributionId, 1);
    }

    function test_RoundingDustRemainsUnclaimed() public {
        uint256 snapshotBlock = _createSnapshot();

        // 1001 wei produces 1000 wei of claims with the current 60/40 split.
        _approveAndDeposit(snapshotBlock, 1001);

        vm.prank(holderA);
        distributor.claim(1);

        vm.prank(holderB);
        distributor.claim(1);

        assertEq(revenueToken.balanceOf(holderA), 600);
        assertEq(revenueToken.balanceOf(holderB), 400);

        RevenueDistributor.Distribution memory distribution =
            distributor.getDistribution(1);

        assertEq(distribution.claimedAmount, 1000);
        assertEq(revenueToken.balanceOf(address(distributor)), 1);
    }

    function test_FailedPayoutRollsBackClaimAccounting() public {
        uint256 snapshotBlock = _createSnapshot();
        RejectingRevenueToken rejectingToken = new RejectingRevenueToken();

        rejectingToken.mint(admin, 1000 ether);

        vm.startPrank(admin);
        rejectingToken.approve(address(distributor), 1000 ether);
        distributor.depositRevenue(
            address(assetToken),
            address(rejectingToken),
            snapshotBlock,
            1000 ether
        );
        vm.stopPrank();

        rejectingToken.setRejectTransfers(true);

        vm.expectRevert();
        vm.prank(holderA);
        distributor.claim(1);

        assertEq(distributor.claimedAmount(1, holderA), 0);

        RevenueDistributor.Distribution memory distribution =
            distributor.getDistribution(1);

        assertEq(distribution.claimedAmount, 0);
        assertEq(rejectingToken.balanceOf(address(distributor)), 1000 ether);
    }
    function test_ReentrantClaimCannotClaimTwice() public {
        uint256 snapshotBlock = _createSnapshot();
        ReentrantRevenueToken maliciousToken = new ReentrantRevenueToken();

        maliciousToken.mint(admin, 1000 ether);

        vm.startPrank(admin);
        maliciousToken.approve(address(distributor), 1000 ether);
        distributor.depositRevenue(
            address(assetToken),
            address(maliciousToken),
            snapshotBlock,
            1000 ether
        );
        maliciousToken.configure(address(distributor), 1);
        vm.stopPrank();

        vm.prank(holderA);
        uint256 claimed = distributor.claim(1);

        assertEq(claimed, 600 ether);
        assertTrue(maliciousToken.attempted());
        assertFalse(maliciousToken.nestedClaimSucceeded());
        assertEq(distributor.claimedAmount(1, holderA), 600 ether);

        RevenueDistributor.Distribution memory distribution =
            distributor.getDistribution(1);
        assertEq(distribution.claimedAmount, 600 ether);
        assertEq(maliciousToken.balanceOf(holderA), 600 ether);
    }
    function test_ClaimsStopAfterDeadline() public {
        uint256 snapshotBlock = _createSnapshot();
        _approveAndDeposit(snapshotBlock, 1000 ether);

        RevenueDistributor.Distribution memory d = distributor.getDistribution(1);
        vm.warp(uint256(d.claimDeadline) + 1);

        vm.expectRevert(RevenueDistributor.ClaimDeadlinePassed.selector);
        vm.prank(holderA);
        distributor.claim(1);
    }

    function test_RecoveryIsBlockedBeforeDelayEnds() public {
        uint256 snapshotBlock = _createSnapshot();
        _approveAndDeposit(snapshotBlock, 1000 ether);

        RevenueDistributor.Distribution memory d = distributor.getDistribution(1);
        vm.warp(uint256(d.claimDeadline) + 7 days);

        vm.expectRevert(RevenueDistributor.RecoveryTooEarly.selector);
        vm.prank(admin);
        distributor.recoverUnclaimedRevenue(1);
    }

    function test_UnauthorizedRecoveryReverts() public {
        uint256 snapshotBlock = _createSnapshot();
        _approveAndDeposit(snapshotBlock, 1000 ether);

        RevenueDistributor.Distribution memory d = distributor.getDistribution(1);
        vm.warp(uint256(d.claimDeadline) + 7 days + 1);

        vm.expectRevert();
        vm.prank(attacker);
        distributor.recoverUnclaimedRevenue(1);
    }

    function test_RecoveryTransfersOnlyUnclaimedBalance() public {
        uint256 snapshotBlock = _createSnapshot();
        _approveAndDeposit(snapshotBlock, 1000 ether);

        vm.prank(holderA);
        distributor.claim(1);

        address recoveryTreasury = makeAddr("recoveryTreasury");
        vm.prank(admin);
        distributor.setTreasury(recoveryTreasury);

        RevenueDistributor.Distribution memory d = distributor.getDistribution(1);
        vm.warp(uint256(d.claimDeadline) + 7 days + 1);

        vm.prank(admin);
        uint256 recovered = distributor.recoverUnclaimedRevenue(1);

        assertEq(recovered, 400 ether);
        assertEq(revenueToken.balanceOf(holderA), 600 ether);
        assertEq(revenueToken.balanceOf(recoveryTreasury), 400 ether);
        assertEq(revenueToken.balanceOf(address(distributor)), 0);

        d = distributor.getDistribution(1);
        assertTrue(d.recovered);
        assertEq(d.claimedAmount, 600 ether);
    }

    function test_RecoveryCannotExecuteTwice() public {
        uint256 snapshotBlock = _createSnapshot();
        _approveAndDeposit(snapshotBlock, 1000 ether);

        RevenueDistributor.Distribution memory d = distributor.getDistribution(1);
        vm.warp(uint256(d.claimDeadline) + 7 days + 1);

        vm.prank(admin);
        distributor.recoverUnclaimedRevenue(1);

        vm.expectRevert(RevenueDistributor.AlreadyRecovered.selector);
        vm.prank(admin);
        distributor.recoverUnclaimedRevenue(1);
    }}
