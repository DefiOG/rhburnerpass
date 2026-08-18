// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title RHBurnerPassFeeVault
/// @notice Transparent per-NFT protocol fee collector for official RHBurnerPass integrations.
/// @dev Fee and treasury are immutable. Deploy a new fee vault to change economics.
contract RHBurnerPassFeeVault {
    uint256 public constant MAX_FEE_PER_NFT = 0.0005 ether;

    address public immutable treasury;
    uint256 public immutable feePerNFT;

    error InvalidTreasury();
    error FeeAboveMaximum();
    error WrongFee();
    error OnlyTreasury();
    error WithdrawFailed();
    error ZeroQuantity();

    event ProtocolFeeCollected(
        address indexed mintContract,
        address indexed vault,
        address indexed burner,
        uint256 quantity,
        uint256 fee
    );
    event FeesWithdrawn(address indexed treasury, uint256 amount);

    constructor(address treasury_, uint256 feePerNFT_) {
        if (treasury_ == address(0)) revert InvalidTreasury();
        if (feePerNFT_ > MAX_FEE_PER_NFT) revert FeeAboveMaximum();
        treasury = treasury_;
        feePerNFT = feePerNFT_;
    }

    function quote(uint256 quantity) public view returns (uint256) {
        return feePerNFT * quantity;
    }

    /// @notice Called by a compatible mint during a successful mint transaction.
    /// @dev If the outer mint reverts, this collection also reverts atomically.
    function collect(address vault, address burner, uint256 quantity) external payable {
        if (quantity == 0) revert ZeroQuantity();
        uint256 expected = quote(quantity);
        if (msg.value != expected) revert WrongFee();
        emit ProtocolFeeCollected(msg.sender, vault, burner, quantity, msg.value);
    }

    function withdraw() external {
        if (msg.sender != treasury) revert OnlyTreasury();
        uint256 amount = address(this).balance;
        (bool ok,) = payable(treasury).call{value: amount}("");
        if (!ok) revert WithdrawFailed();
        emit FeesWithdrawn(treasury, amount);
    }
}
