// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title RHBurnerPassFeeVaultV2
/// @notice Production-design fixed per-NFT protocol fee collector for official RHBurnerPass integrations.
/// @dev The fee is permanently fixed in bytecode. Treasury is supplied once at deployment and is immutable forever.
contract RHBurnerPassFeeVaultV2 {
    uint256 public constant FEE_PER_NFT = 0.00005 ether;

    address public immutable treasury;

    error InvalidTreasury();
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

    constructor(address treasury_) {
        if (treasury_ == address(0)) revert InvalidTreasury();
        treasury = treasury_;
    }

    function quote(uint256 quantity) public pure returns (uint256) {
        return FEE_PER_NFT * quantity;
    }

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
