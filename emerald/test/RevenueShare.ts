import { expect } from 'chai';
import { Wallet } from 'ethers';
import { ethers } from 'hardhat';

import { RevenueShare } from '../typechain-types';

const denominator = 10_000;
const mintFeePercent = 5;
const creatorRoyaltyPercent = 3;
const royaltyFeePercent = 2.5;

describe('RevenueShare', () => {
  let revenueShare: RevenueShare;

  let artist: Wallet;
  let facilitator: Wallet;

  beforeEach(async () => {
    const deployer = (await ethers.getSigners())[0];
    const provider = deployer.provider!;

    artist = ethers.Wallet.createRandom().connect(provider);
    facilitator = ethers.Wallet.createRandom().connect(provider);

    const mintFeePercentNumerator = (mintFeePercent * denominator) / 100;
    const royaltyFeePercentNumerator = Math.floor(
      (royaltyFeePercent * denominator) / (creatorRoyaltyPercent + royaltyFeePercent),
    );

    const RevenueShare = await ethers.getContractFactory('RevenueShare');
    revenueShare = await RevenueShare.deploy(
      artist.address,
      facilitator.address,
      mintFeePercentNumerator,
      royaltyFeePercentNumerator,
    );
  });

  it('receive mint payment', async () => {
    // Try receiving a zero mint payment, just in case.
    await expect(revenueShare.receiveMintPayment({ value: 0 })).not.to.be.reverted;
    expect(await revenueShare.callStatic.artistBalance()).to.equal(0);
    expect(await revenueShare.callStatic.facilitatorBalance()).to.equal(0);

    // 1 wei is too small to be split, so it should all go to the artist.
    await expect(revenueShare.receiveMintPayment({ value: 1 })).not.to.be.reverted;
    expect(await revenueShare.callStatic.artistBalance()).to.equal(1);
    expect(await revenueShare.callStatic.facilitatorBalance()).to.equal(0);

    // Try a normal payment.
    await expect(revenueShare.receiveMintPayment({ value: 100 }))
      .to.emit(revenueShare, 'MintPaymentReceived')
      .withArgs(100);
    expect(await revenueShare.callStatic.artistBalance()).to.equal(95 + 1);
    expect(await revenueShare.callStatic.facilitatorBalance()).to.equal(5);

    await expect(revenueShare.disburse()).to.emit(revenueShare, 'PaymentsDisbursed');
    expect(await artist.getBalance().then((b) => b.toNumber())).to.equal(96);
    expect(await facilitator.getBalance().then((b) => b.toNumber())).to.equal(5);
  });

  it('receive royalty payment', async () => {
    // Try receiving a zero mint payment, just in case.
    await expect(revenueShare.fallback({ value: 0 })).not.to.be.reverted;
    expect(await revenueShare.callStatic.artistBalance()).to.equal(0);
    expect(await revenueShare.callStatic.facilitatorBalance()).to.equal(0);

    // 1 wei is too small to be split, so it should all go to the artist.
    await expect(revenueShare.fallback({ value: 1 })).not.to.be.reverted;
    expect(await revenueShare.callStatic.artistBalance()).to.equal(1);
    expect(await revenueShare.callStatic.facilitatorBalance()).to.equal(0);

    // Try a normal payment.
    const salePrice = 400;
    const totalRoyalty = (creatorRoyaltyPercent + royaltyFeePercent) / 100; // 0.055
    const royaltyPayment = salePrice * totalRoyalty; // 22
    await expect(revenueShare.fallback({ value: royaltyPayment }))
      .to.emit(revenueShare, 'RoyaltyPaymentReceived')
      .withArgs(royaltyPayment);
    expect(await revenueShare.callStatic.artistBalance()).to.equal(13 + 1);
    expect(await revenueShare.callStatic.facilitatorBalance()).to.equal(9); // oops! rounding

    await expect(revenueShare.disburse()).to.emit(revenueShare, 'PaymentsDisbursed');
    expect(await artist.getBalance().then((b) => b.toNumber())).to.equal(14);
    expect(await facilitator.getBalance().then((b) => b.toNumber())).to.equal(9);
  });
});
