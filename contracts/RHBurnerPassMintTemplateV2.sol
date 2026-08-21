// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {RHBurnerPassMintGate} from "./RHBurnerPassMintGate.sol";

/// @title RHBurnerPassMintTemplateV2
/// @notice Canonical self-service ERC-721 template deployed only through RHBurnerPassFactoryV2.
/// @dev Eligibility and claim usage belong to the vault; NFTs are delivered to msg.sender (vault or authorized burner).
contract RHBurnerPassMintTemplateV2 is ERC721, RHBurnerPassMintGate {
    using Strings for uint256;

    bytes32 public immutable merkleRoot;
    uint256 public immutable mintPrice;
    uint256 public immutable maxSupply;
    address public immutable projectTreasury;
    address public immutable rhBurnerPassFactory;
    string public baseTokenURI;

    uint256 public nextTokenId = 1;

    error BadProof();
    error WrongPayment();
    error InvalidTreasury();
    error InvalidFactory();
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
        address factory_,
        address registry_,
        address feeVault_,
        string memory name_,
        string memory symbol_,
        bytes32 root_,
        uint256 mintPrice_,
        uint256 maxSupply_,
        address projectTreasury_,
        string memory baseTokenURI_
    )
        ERC721(name_, symbol_)
        RHBurnerPassMintGate(registry_, feeVault_)
    {
        if (factory_ == address(0)) revert InvalidFactory();
        if (root_ == bytes32(0)) revert InvalidRoot();
        if (maxSupply_ == 0) revert InvalidMaxSupply();
        if (projectTreasury_ == address(0)) revert InvalidTreasury();

        rhBurnerPassFactory = factory_;
        merkleRoot = root_;
        mintPrice = mintPrice_;
        maxSupply = maxSupply_;
        projectTreasury = projectTreasury_;
        baseTokenURI = baseTokenURI_;
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
        if (bytes(baseTokenURI).length == 0) return "";
        return string.concat(baseTokenURI, tokenId.toString());
    }

    function withdrawProjectProceeds() external {
        if (msg.sender != projectTreasury) revert OnlyProjectTreasury();
        uint256 amount = address(this).balance;
        (bool ok,) = payable(projectTreasury).call{value: amount}("");
        if (!ok) revert WithdrawFailed();
    }
}
