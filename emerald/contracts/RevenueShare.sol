// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

/// @notice A simple `PaymentSplitter`-like contract specialized for NFT revenue types.
contract RevenueShare {
    event PaymentsDisbursed();
    event MintPaymentReceived(uint256 amount);
    event RoyaltyPaymentReceived(uint256 amount);

    address payable private immutable artist;
    address payable private immutable facilitator;

    uint256 public immutable mintFeeBps;
    /// @dev should be calculated as `royaltyFee / totalRoyalty * 10_000`.
    uint256 public immutable royaltyFeeBps;

    constructor(
        address payable _artist,
        address payable _facilitator,
        uint256 _mintFeeBps,
        uint256 _royaltyFeeBps
    ) {
        require(_mintFeeBps <= 10_000, "mintFee > 100%");
        require(_royaltyFeeBps <= 10_000, "royaltyFee > 100%");

        artist = _artist;
        facilitator = _facilitator;
        mintFeeBps = _mintFeeBps;
        royaltyFeeBps = _royaltyFeeBps;
    }

    function receiveMintPayment() external payable {
        emit MintPaymentReceived(msg.value);
        splitPayment(msg.value, mintFeeBps);
    }

    receive() external payable {
        emit RoyaltyPaymentReceived(msg.value);
        splitPayment(msg.value, royaltyFeeBps);
    }

    function splitPayment(uint256 _amount, uint256 _numerator) internal {
        uint256 facilitatorFee = (_amount * _numerator) / 10_000;
        facilitator.transfer(facilitatorFee);
        artist.transfer(_amount - facilitatorFee);
    }
}
