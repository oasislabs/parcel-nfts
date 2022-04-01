// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "erc721a/contracts/ERC721A.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract NFT is ERC721A, Ownable {
    string public baseURI;
    uint256 public maxMintQty;
    uint256 public premintPrice;
    uint256 public mintPrice;

    constructor(
        string name,
        string symbol,
        uint256 maxMintQty,
        uint256 premintPrice,
        uint256 mintPrice
    ) ERC721A(name, symbol) {}

    function mint(uint256 quality) external payable {
        // require(msg.value == )
        _safeMint(msg.sender, quantity);
    }

    function _baseURI() internal pure override returns (string memory) {
        return baseURI;
    }
}
