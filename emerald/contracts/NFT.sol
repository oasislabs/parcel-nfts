// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "erc721a/contracts/ERC721A.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract NFT is ERC721A, Ownable {
    string private baseURI;

    uint256 public immutable collectionSize;
    uint256 public immutable maxPremintCount;
    uint256 public immutable maxMintCount;
    uint256 public immutable mintPrice;
    uint256 public immutable premintPrice;
    address payable private immutable treasury;

    bool private hasSetFinalBaseURI;
    bool public hasBegunPublicSale;

    constructor(
        string memory _name,
        string memory _symbol,
        string memory _initialBaseURI,
        address payable _treasury,
        uint256 _collectionSize,
        uint256 _premintPrice,
        uint256 _maxPremintCount,
        uint256 _mintPrice,
        uint256 _maxMintCount
    ) ERC721A(_name, _symbol) {
        require(_collectionSize > 0, "_collectionSize == 0");
        require(_maxPremintCount > 0, "_maxPremintCount == 0");
        require(_maxMintCount > 0, "_maxMintCount == 0");

        baseURI = _initialBaseURI;
        treasury = _treasury;
        collectionSize = _collectionSize;

        maxPremintCount = _maxPremintCount;
        premintPrice = _premintPrice;

        maxMintCount = _maxMintCount;
        mintPrice = _mintPrice;
    }

    function mint(uint256 _count) external payable {
        require(
            _totalMinted() + _count <= collectionSize,
            "insufficient remaining items"
        );

        (uint256 premintSlotCount, uint256 premintedCount) = getPremintCounts(
            msg.sender
        );
        uint256 numMinted = _numberMinted(msg.sender);
        uint256 price;
        if (!hasBegunPublicSale) {
            assert(numMinted == premintedCount);
            require(
                premintedCount + _count <= premintSlotCount,
                "insufficient premint slots"
            );
            setPremintCounts(
                msg.sender,
                premintSlotCount,
                premintedCount + _count
            );
            price = premintPrice;
        } else {
            require(
                numMinted - premintedCount + _count <= maxMintCount,
                "insufficient premint slots"
            );
            price = mintPrice;
        }

        require(msg.value == price * _count, "incorrect payment amount");
        treasury.transfer(msg.value);

        _safeMint(msg.sender, _count);
    }

    function mintTo(address whom, uint256 _count) external onlyOwner {
        _safeMint(whom, _count);
    }

    function grantPremint(address[] calldata addresses) external onlyOwner {
        require(!hasBegunPublicSale, "public sale has already begun");
        for (uint256 i; i < addresses.length; ++i) {
            (, uint256 premintedCount) = getPremintCounts(addresses[i]);
            // Set the number of premint slots available to the maximum number of slots.
            // Premint grantees will not be able to mint past the max even if granted twice.
            setPremintCounts(addresses[i], maxPremintCount, premintedCount);
        }
    }

    function revokePremint(address[] calldata addresses) external onlyOwner {
        require(!hasBegunPublicSale, "public sale has already begun");
        for (uint256 i; i < addresses.length; ++i) {
            (, uint256 premintedCount) = getPremintCounts(addresses[i]);
            // Set the slot count to the preminted count to grant no further premints
            // while maintaining a useful invariant that `preminted <= slots`.
            setPremintCounts(addresses[i], premintedCount, premintedCount);
        }
    }

    function beginPublicSale() external onlyOwner {
        hasBegunPublicSale = true;
    }

    function setFinalBaseURI(string calldata _finalBaseURI) external onlyOwner {
        require(!hasSetFinalBaseURI, "final baseURI already set");
        baseURI = _finalBaseURI;
    }

    function setPremintCounts(
        address _owner,
        uint256 _slotCount,
        uint256 _premintedCount
    ) internal {
        require(_slotCount < type(uint32).max, "too many slots");
        require(_premintedCount < type(uint32).max, "too many preminted");
        assert(_premintedCount <= _slotCount);
        uint256 packed = ((_slotCount & 0xffffffff) << 32) |
            (_premintedCount & 0xffffffff);
        _setAux(_owner, uint64(packed));
    }

    function getPremintCounts(address _owner)
        internal
        view
        returns (uint256 slotCount, uint256 premintedCount)
    {
        uint64 packed = _getAux(_owner);
        slotCount = packed >> 32;
        premintedCount = packed & 0xffffffff;
        assert(premintedCount <= maxPremintCount);
    }

    function _baseURI() internal view override returns (string memory) {
        return baseURI;
    }
}
