// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title RHBurnerPassRegistry
/// @notice Minimal Robinhood Chain registry linking a vault wallet to a burner for one target mint contract.
/// @dev No custody, no token approvals, no private keys. A vault can only create/revoke its own delegations.
contract RHBurnerPassRegistry {
    mapping(bytes32 delegationKey => bool enabled) private _delegations;

    error ZeroAddress();
    error VaultCannotBeBurner();

    event BurnerAuthorizationSet(
        address indexed vault,
        address indexed burner,
        address indexed target,
        bool enabled
    );

    function setBurner(address burner, address target, bool enabled) external {
        if (burner == address(0) || target == address(0)) revert ZeroAddress();
        if (burner == msg.sender) revert VaultCannotBeBurner();

        _delegations[_key(msg.sender, burner, target)] = enabled;
        emit BurnerAuthorizationSet(msg.sender, burner, target, enabled);
    }

    function isAuthorized(address vault, address burner, address target) external view returns (bool) {
        if (vault == burner) return true;
        return _delegations[_key(vault, burner, target)];
    }

    function delegationKey(address vault, address burner, address target) external pure returns (bytes32) {
        return _key(vault, burner, target);
    }

    function _key(address vault, address burner, address target) private pure returns (bytes32) {
        return keccak256(abi.encode(vault, burner, target));
    }
}
