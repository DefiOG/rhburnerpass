// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IRHBurnerPassOfficialIntegrationRegistryView {
    function isOfficialIntegration(address target) external view returns (bool);
}

/// @title RHBurnerPassRegistryV2
/// @notice Vault-to-burner registry that only enables delegations for official integrations.
/// @dev Revocation is always allowed, even after an integration is removed from the official registry.
contract RHBurnerPassRegistryV2 {
    mapping(bytes32 delegationKey => bool enabled) private _delegations;

    IRHBurnerPassOfficialIntegrationRegistryView public immutable officialIntegrationRegistry;

    error ZeroAddress();
    error VaultCannotBeBurner();
    error UnofficialTarget();

    event BurnerAuthorizationSet(
        address indexed vault,
        address indexed burner,
        address indexed target,
        bool enabled
    );

    constructor(address officialIntegrationRegistry_) {
        if (officialIntegrationRegistry_ == address(0)) revert ZeroAddress();
        officialIntegrationRegistry = IRHBurnerPassOfficialIntegrationRegistryView(officialIntegrationRegistry_);
    }

    function setBurner(address burner, address target, bool enabled) external {
        if (burner == address(0) || target == address(0)) revert ZeroAddress();
        if (burner == msg.sender) revert VaultCannotBeBurner();
        if (enabled && !officialIntegrationRegistry.isOfficialIntegration(target)) revert UnofficialTarget();

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
