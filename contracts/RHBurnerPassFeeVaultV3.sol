// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IRHBurnerPassFactoryPartnerView {
    function isOfficialMint(address mint) external view returns (bool);
    function partnerOf(address mint) external view returns (address);
}

/// @title RHBurnerPassFeeVaultV3
/// @notice Fixed 0.00005 ETH delegated-mint fee with immutable 90% protocol / 10% integration-partner economics.
/// @dev Partner funds are pull-based and never included in treasury-withdrawable protocol revenue.
contract RHBurnerPassFeeVaultV3 {
    uint256 public constant FEE_PER_NFT = 0.00005 ether;
    uint256 public constant PARTNER_BPS = 1_000;
    uint256 public constant BPS_DENOMINATOR = 10_000;

    address public immutable treasury;
    IRHBurnerPassFactoryPartnerView public immutable factory;

    uint256 public protocolAccrued;
    uint256 public totalPartnerLiability;
    mapping(address partner => uint256 amount) public partnerAccrued;

    error InvalidAddress();
    error WrongFee();
    error OnlyTreasury();
    error WithdrawFailed();
    error ZeroQuantity();
    error UnofficialMint();
    error NoPartner();
    error NothingToClaim();

    event ProtocolFeeCollected(
        address indexed mintContract,
        address indexed vault,
        address indexed burner,
        address partner,
        uint256 quantity,
        uint256 totalFee,
        uint256 protocolShare,
        uint256 partnerShare
    );
    event ProtocolFeesWithdrawn(address indexed treasury, uint256 amount);
    event PartnerFeesClaimed(address indexed partner, uint256 amount);

    constructor(address treasury_, address factory_) {
        if (treasury_ == address(0) || factory_ == address(0)) revert InvalidAddress();
        treasury = treasury_;
        factory = IRHBurnerPassFactoryPartnerView(factory_);
    }

    function quote(uint256 quantity) public pure returns (uint256) {
        return FEE_PER_NFT * quantity;
    }

    function collect(address vault, address burner, uint256 quantity) external payable {
        if (quantity == 0) revert ZeroQuantity();
        if (!factory.isOfficialMint(msg.sender)) revert UnofficialMint();
        uint256 expected = quote(quantity);
        if (msg.value != expected) revert WrongFee();

        address partner = factory.partnerOf(msg.sender);
        if (partner == address(0)) revert NoPartner();

        uint256 partnerShare = (expected * PARTNER_BPS) / BPS_DENOMINATOR;
        uint256 protocolShare = expected - partnerShare;

        partnerAccrued[partner] += partnerShare;
        totalPartnerLiability += partnerShare;
        protocolAccrued += protocolShare;

        emit ProtocolFeeCollected(
            msg.sender,
            vault,
            burner,
            partner,
            quantity,
            expected,
            protocolShare,
            partnerShare
        );
    }

    /// @notice Anyone may trigger a claim, but ETH can only be delivered to the credited partner address.
    function claimPartnerFees(address partner) external {
        uint256 amount = partnerAccrued[partner];
        if (amount == 0) revert NothingToClaim();
        partnerAccrued[partner] = 0;
        totalPartnerLiability -= amount;
        (bool ok,) = payable(partner).call{value: amount}("");
        if (!ok) revert WithdrawFailed();
        emit PartnerFeesClaimed(partner, amount);
    }

    function withdrawProtocolFees() external {
        if (msg.sender != treasury) revert OnlyTreasury();
        uint256 amount = protocolAccrued;
        if (amount == 0) revert NothingToClaim();
        protocolAccrued = 0;
        (bool ok,) = payable(treasury).call{value: amount}("");
        if (!ok) revert WithdrawFailed();
        emit ProtocolFeesWithdrawn(treasury, amount);
    }
}
