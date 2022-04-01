// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "erc721a/contracts/ERC721A.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract NFT is ERC721A, Ownable {
    uint256 public maxMintQty;
    uint256 public mintPrice;
    uint256 public premintPrice;
    mapping(address => bool) public premintList;
    bool public hasBegunPublicSale;

    string private baseURI;
    bool private hasSetFinalBaseURI;

    address payable private treasury;

    constructor(
        string memory _name,
        string memory _symbol,
        string memory _initialBaseURI,
        uint256 _maxMintQty,
        uint256 _premintPrice,
        uint256 _mintPrice,
        address payable _treasury
    ) ERC721A(_name, _symbol) {
        baseURI = _initialBaseURI;
        require(_maxMintQty > 0, "maxMintQty == 0");
        maxMintQty = _maxMintQty;
        premintPrice = _premintPrice;
        mintPrice = _mintPrice;
        treasury = _treasury;
    }

    function mint(uint256 _quantity) external payable {
        uint256 newNumMinted = _numberMinted(msg.sender) + _quantity;
        require(newNumMinted <= maxMintQty, "num. minted exceeds max");

        uint256 price = mintPrice;
        if (premintList[msg.sender]) {
            price = premintPrice;
            if (newNumMinted == maxMintQty) {
                delete premintList[msg.sender];
            }
        }
        require(msg.value == price * _quantity, "incorrect payment amount");
        treasury.transfer(msg.value);

        _safeMint(msg.sender, _quantity);
    }

    function addToPremintList(address[] calldata addresses) external onlyOwner {
        for(uint256 i; i < addresses.length; ++i) {
            premintList[addresses[i]] = true;
        }
    }

    function removeFromPremintList(address[] calldata addresses) external onlyOwner {
        for(uint256 i; i < addresses.length; ++i) {
            delete premintList[addresses[i]];
        }
    }

    function beginPublicSale() external onlyOwner {
        hasBegunPublicSale = true;
    }

    function setFinalBaseURI(string calldata _finalBaseURI) external onlyOwner {
        require(!hasSetFinalBaseURI, "final baseURI already set");
        baseURI = _finalBaseURI;
    }

    function _baseURI() internal view override returns (string memory) {
        return baseURI;
    }
}
