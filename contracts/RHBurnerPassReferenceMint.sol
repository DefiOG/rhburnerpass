// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {RHBurnerPassMintGate} from "./RHBurnerPassMintGate.sol";

/// @title RHBurnerPassReferenceMint
/// @notice Mainnet reference ERC-721 showing vault eligibility + burner execution through RHBurnerPass.
/// @dev Reference integration for developers. It is intentionally simple, immutable, and non-upgradeable.
contract RHBurnerPassReferenceMint is ERC721, RHBurnerPassMintGate {
    using Strings for uint256;

    bytes32 public immutable merkleRoot;
    uint256 public immutable mintPrice;
    uint256 public immutable maxSupply;
    address public immutable projectTreasury;

    uint256 public nextTokenId = 1;

    error BadProof();
    error WrongPayment();
    error InvalidTreasury();
    error InvalidRoot();
    error InvalidMaxSupply();
    error SoldOut();
    error OnlyProjectTreasury();
    error WithdrawFailed();

    event ProtectedMint(
        address indexed vault,
        address indexed burner,
        uint256 quantity,
        uint256 projectPayment,
        uint256 protocolFee
    );

    constructor(
        address registry_,
        address feeVault_,
        bytes32 root_,
        uint256 mintPrice_,
        uint256 maxSupply_,
        address projectTreasury_
    )
        ERC721("RHBurnerPass Reference", "RHBPREF")
        RHBurnerPassMintGate(registry_, feeVault_)
    {
        if (root_ == bytes32(0)) revert InvalidRoot();
        if (maxSupply_ == 0) revert InvalidMaxSupply();
        if (projectTreasury_ == address(0)) revert InvalidTreasury();

        merkleRoot = root_;
        mintPrice = mintPrice_;
        maxSupply = maxSupply_;
        projectTreasury = projectTreasury_;
    }

    function mint(
        address vault,
        uint256 maxAllocation,
        uint256 quantity,
        bytes32[] calldata proof
    ) external payable {
        bytes32 leaf = keccak256(bytes.concat(keccak256(abi.encode(vault, maxAllocation))));
        if (!MerkleProof.verifyCalldata(proof, merkleRoot, leaf)) revert BadProof();
        if (quantity == 0 || nextTokenId + quantity - 1 > maxSupply) revert SoldOut();

        uint256 projectPayment = mintPrice * quantity;
        uint256 protocolFee = rhBurnerPassFee(msg.sender, vault, quantity);
        if (msg.value != projectPayment + protocolFee) revert WrongPayment();

        _consumeVaultAllocation(vault, quantity, maxAllocation);
        _collectRHBurnerPassFee(vault, quantity);

        for (uint256 i = 0; i < quantity; ++i) {
            _safeMint(msg.sender, nextTokenId++);
        }

        emit ProtectedMint(vault, msg.sender, quantity, projectPayment, protocolFee);
    }

    function totalMinted() external view returns (uint256) {
        return nextTokenId - 1;
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        bytes memory json = abi.encodePacked(
            '{"name":"RHBurnerPass Reference #', tokenId.toString(),
            '","description":"Mainnet reference NFT demonstrating vault-to-burner delegated minting through RHBurnerPass.",',
            '"attributes":[',
            '{"trait_type":"Protocol","value":"RHBurnerPass"},',
            '{"trait_type":"Network","value":"Robinhood Chain"},',
            '{"trait_type":"Purpose","value":"Reference Integration"}',
            ']}'
        );
        return string.concat("data:application/json;base64,", Base64.encode(json));
    }

    function withdrawProjectProceeds() external {
        if (msg.sender != projectTreasury) revert OnlyProjectTreasury();
        uint256 amount = address(this).balance;
        (bool ok,) = payable(projectTreasury).call{value: amount}("");
        if (!ok) revert WithdrawFailed();
    }
}
