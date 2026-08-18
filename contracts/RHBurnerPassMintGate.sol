// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IRHBurnerPassRegistry {
    function isAuthorized(address vault, address burner, address target) external view returns (bool);
}

interface IRHBurnerPassFeeVault {
    function quote(uint256 quantity) external view returns (uint256);
    function collect(address vault, address burner, uint256 quantity) external payable;
}

/// @title RHBurnerPassMintGate
/// @notice Reusable helper for mints that resolve eligibility to a vault while the burner sends the transaction.
abstract contract RHBurnerPassMintGate {
    IRHBurnerPassRegistry public immutable rhBurnerPassRegistry;
    IRHBurnerPassFeeVault public immutable rhBurnerPassFeeVault;

    mapping(address vault => uint256 quantity) public claimedByVault;

    error UnauthorizedBurner();
    error AllocationExceeded();
    error ZeroQuantity();
    error InvalidProtocolAddress();

    constructor(address registry_, address feeVault_) {
        if (registry_ == address(0) || feeVault_ == address(0)) revert InvalidProtocolAddress();
        rhBurnerPassRegistry = IRHBurnerPassRegistry(registry_);
        rhBurnerPassFeeVault = IRHBurnerPassFeeVault(feeVault_);
    }

    function isAuthorizedMinter(address caller, address vault) public view returns (bool) {
        if (caller == vault) return true;
        return rhBurnerPassRegistry.isAuthorized(vault, caller, address(this));
    }

    function rhBurnerPassFee(address caller, address vault, uint256 quantity) public view returns (uint256) {
        if (caller == vault) return 0;
        return rhBurnerPassFeeVault.quote(quantity);
    }

    /// @dev Key allocation usage to the vault, never msg.sender, so multiple burners cannot multiply one WL allocation.
    function _consumeVaultAllocation(address vault, uint256 quantity, uint256 maxAllocation) internal {
        if (quantity == 0) revert ZeroQuantity();
        if (!isAuthorizedMinter(msg.sender, vault)) revert UnauthorizedBurner();

        uint256 next = claimedByVault[vault] + quantity;
        if (next > maxAllocation) revert AllocationExceeded();
        claimedByVault[vault] = next;
    }

    function _collectRHBurnerPassFee(address vault, uint256 quantity) internal {
        if (msg.sender == vault) return;
        uint256 fee = rhBurnerPassFeeVault.quote(quantity);
        rhBurnerPassFeeVault.collect{value: fee}(vault, msg.sender, quantity);
    }
}
