// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IRHBurnerPassIntegrationTarget {
    function rhBurnerPassRegistry() external view returns (address);
    function rhBurnerPassFeeVault() external view returns (address);
}

/// @title RHBurnerPassOfficialIntegrationRegistry
/// @notice Canonical allowlist of reviewed RHBurnerPass mint integrations.
/// @dev Approval is pinned to the exact deployed bytecode hash and canonical protocol bindings.
contract RHBurnerPassOfficialIntegrationRegistry {
    struct Integration {
        bytes32 codeHash;
        uint64 approvedAt;
        bool approved;
    }

    address public owner;
    address public pendingOwner;
    address public immutable bootstrapper;
    address public immutable canonicalFeeVault;
    address public canonicalRegistry;

    mapping(address target => Integration integration) private _integrations;

    error OnlyOwner();
    error OnlyBootstrapperOrOwner();
    error ZeroAddress();
    error RegistryAlreadyBound();
    error RegistryNotBound();
    error TargetHasNoCode();
    error CodeHashMismatch();
    error WrongProtocolRegistry();
    error WrongProtocolFeeVault();
    error TargetMissingIntegrationGetters();
    error NotPendingOwner();

    event CanonicalRegistryBound(address indexed registry);
    event IntegrationApproved(address indexed target, bytes32 indexed codeHash);
    event IntegrationRevoked(address indexed target);
    event OwnershipTransferStarted(address indexed previousOwner, address indexed pendingOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    constructor(address owner_, address canonicalFeeVault_) {
        if (owner_ == address(0) || canonicalFeeVault_ == address(0)) revert ZeroAddress();
        owner = owner_;
        bootstrapper = msg.sender;
        canonicalFeeVault = canonicalFeeVault_;
        emit OwnershipTransferred(address(0), owner_);
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert OnlyOwner();
        _;
    }

    /// @notice Permanently binds the protocol Registry once after deployment.
    /// @dev The deployer may perform this one bootstrap action even when a multisig is owner.
    function bindCanonicalRegistry(address registry_) external {
        if (msg.sender != owner && msg.sender != bootstrapper) revert OnlyBootstrapperOrOwner();
        if (registry_ == address(0)) revert ZeroAddress();
        if (canonicalRegistry != address(0)) revert RegistryAlreadyBound();
        canonicalRegistry = registry_;
        emit CanonicalRegistryBound(registry_);
    }

    /// @notice Approves a reviewed target at the exact code hash supplied by the protocol owner.
    function approveIntegration(address target, bytes32 expectedCodeHash) external onlyOwner {
        if (canonicalRegistry == address(0)) revert RegistryNotBound();
        if (target == address(0)) revert ZeroAddress();
        if (target.code.length == 0) revert TargetHasNoCode();

        bytes32 currentCodeHash = target.codehash;
        if (currentCodeHash != expectedCodeHash) revert CodeHashMismatch();
        _assertCanonicalBindings(target);

        _integrations[target] = Integration({
            codeHash: currentCodeHash,
            approvedAt: uint64(block.timestamp),
            approved: true
        });

        emit IntegrationApproved(target, currentCodeHash);
    }

    function revokeIntegration(address target) external onlyOwner {
        _integrations[target].approved = false;
        emit IntegrationRevoked(target);
    }

    /// @notice True only while approval, code hash, Registry, and FeeVault all still match.
    function isOfficialIntegration(address target) public view returns (bool) {
        Integration memory integration = _integrations[target];
        if (!integration.approved || canonicalRegistry == address(0)) return false;
        if (target.code.length == 0 || target.codehash != integration.codeHash) return false;

        try IRHBurnerPassIntegrationTarget(target).rhBurnerPassRegistry() returns (address registry_) {
            if (registry_ != canonicalRegistry) return false;
        } catch {
            return false;
        }

        try IRHBurnerPassIntegrationTarget(target).rhBurnerPassFeeVault() returns (address feeVault_) {
            if (feeVault_ != canonicalFeeVault) return false;
        } catch {
            return false;
        }

        return true;
    }

    function integrationInfo(address target) external view returns (bytes32 codeHash, uint64 approvedAt, bool approved) {
        Integration memory integration = _integrations[target];
        return (integration.codeHash, integration.approvedAt, integration.approved);
    }

    function beginOwnershipTransfer(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner, newOwner);
    }

    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert NotPendingOwner();
        address previousOwner = owner;
        owner = pendingOwner;
        pendingOwner = address(0);
        emit OwnershipTransferred(previousOwner, owner);
    }

    function _assertCanonicalBindings(address target) private view {
        address targetRegistry;
        address targetFeeVault;

        try IRHBurnerPassIntegrationTarget(target).rhBurnerPassRegistry() returns (address registry_) {
            targetRegistry = registry_;
        } catch {
            revert TargetMissingIntegrationGetters();
        }

        try IRHBurnerPassIntegrationTarget(target).rhBurnerPassFeeVault() returns (address feeVault_) {
            targetFeeVault = feeVault_;
        } catch {
            revert TargetMissingIntegrationGetters();
        }

        if (targetRegistry != canonicalRegistry) revert WrongProtocolRegistry();
        if (targetFeeVault != canonicalFeeVault) revert WrongProtocolFeeVault();
    }
}
