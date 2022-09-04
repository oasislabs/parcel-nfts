// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/utils/introspection/ERC165.sol";

interface IFutureParcelNFT is IERC165 {
    /// @dev This function should have semantics like `parcelTokenIds[i] = tokenIds[i]`.
    /// @dev This function should also generally be access controlled (e.g., `onlyOwner`).
    /// @param tokenIds A monotinically increasing list of NFT token IDs
    /// @param parcelTokenIds A Parcel token ID.
    function setParcelTokens(
        uint256[] calldata tokenIds,
        uint256[] calldata parcelTokenIds
    ) external;

    /// @notice Returns the Parcel token ID associated with the NFT with token ID `tokenId` or zero if it does not exist.
    function getParcelToken(uint256 tokenId) external view returns (uint256);
}
