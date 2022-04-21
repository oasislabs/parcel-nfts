// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

/// @notice A simple `PaymentSplitter`-like contract specialized for NFT revenue types.
contract RevenueShare {
    event PaymentsDisbursed();
    event MintPaymentReceived(uint256 amount);
    event RoyaltyPaymentReceived(uint256 amount);

    address payable private immutable artist;
    address payable private immutable facilitator;

    uint256 public constant denominator = 10_000;
    uint256 public immutable mintFeePercentNumerator;
    /// @dev should be calculated as `royaltyFee / totalRoyalty * denominator`.
    uint256 public immutable royaltyFeePercentNumerator;

    constructor(
        address payable _artist,
        address payable _facilitator,
        uint256 _mintFeePercentTimes10k,
        uint256 _royaltyFeePercentTimes10k
    ) {
        require(
            _mintFeePercentTimes10k <= denominator,
            "mintFeePercent numerator > denominator"
        );
        require(
            _royaltyFeePercentTimes10k <= denominator,
            "royaltyFeePercent numerator > denominator"
        );

        artist = _artist;
        facilitator = _facilitator;
        mintFeePercentNumerator = _mintFeePercentTimes10k;
        royaltyFeePercentNumerator = _royaltyFeePercentTimes10k;
    }

    function receiveMintPayment() external payable {
        emit MintPaymentReceived(msg.value);
        splitPayment(msg.value, mintFeePercentNumerator);
    }

    receive() external payable {
        emit RoyaltyPaymentReceived(msg.value);
        splitPayment(msg.value, royaltyFeePercentNumerator);
    }

    function splitPayment(uint256 _amount, uint256 _numerator) internal {
        uint256 facilitatorFee = (_amount * _numerator) / denominator;
        facilitator.transfer(facilitatorFee);
        artist.transfer(_amount - facilitatorFee);
    }
}
