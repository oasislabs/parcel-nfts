import { randomBytes } from 'crypto';

import chai, { expect } from 'chai';
import { Signer } from 'ethers';
import { ethers } from 'hardhat';
import { FakeContract, smock } from '@defi-wonderland/smock';

import { NFT, RevenueShare } from '../typechain-types';

chai.use(smock.matchers);

const collectionSize = 10;
const royaltyPercent = 5;

describe('NFT', () => {
  let signers: Signer[];
  let signerAddrs: string[];
  let revenueShare: FakeContract<RevenueShare>;
  let nft: NFT;

  async function deployNft(
    opts?: Partial<{
      collectionSize: number;
      maxPremintCount: number;
      premintPrice: number;
      maxMintCount: number;
      mintPrice: number;
    }>,
  ): Promise<NFT> {
    const NFT = await ethers.getContractFactory('NFT');
    return NFT.deploy(
      'Test',
      'TEST',
      '',
      revenueShare.address,
      opts?.collectionSize ?? collectionSize,
      opts?.premintPrice ?? 1,
      opts?.maxPremintCount ?? 3,
      opts?.mintPrice ?? 2,
      opts?.maxMintCount ?? 2,
      (royaltyPercent * 10_000) / 100,
    );
  }

  beforeEach(async () => {
    signers = (await ethers.getSigners()).slice(1);
    signerAddrs = await Promise.all(signers.map((s) => s.getAddress()));
    revenueShare = await smock.fake('RevenueShare');
    nft = await deployNft();
  });

  it('setFinalBaseURI', async () => {
    const eve = signers[0];
    await expect(nft.connect(eve).setFinalBaseURI('eve')).to.be.reverted;
    await expect(nft.setFinalBaseURI('test')).not.to.be.reverted;
    expect(await nft.callStatic.baseURI()).to.equal('test');
    await expect(nft.setFinalBaseURI('evil')).to.be.reverted;
  });

  it('mintTo', async () => {
    const recipients = signerAddrs.slice(0, 4);

    // require onlyOwner
    const eve = signers[0];
    await expect(nft.connect(eve).mintTo([recipients[0]], [1])).to.be.reverted;

    // require same lengths
    await expect(nft.mintTo(recipients.slice(0, 2), [1])).to.be.reverted;

    const mintBalances = [1, 2, 3, 4];
    nft.mintTo(recipients, mintBalances);
    expect(nft.mintTo([recipients[0]], [1])).to.be.reverted; // No more items left.

    const balances = await Promise.all(
      recipients.map(async (r) => {
        const bal = await nft.callStatic.balanceOf(r);
        return bal.toNumber();
      }),
    );
    expect(balances).to.deep.equal(mintBalances);
  });

  it('batchTransfer', async () => {
    const collectionSize = 100;
    const nft = await deployNft({ collectionSize });
    const owner = await nft.callStatic.owner();
    expect(nft.mintTo([owner], [collectionSize])).not.to.be.reverted;

    const recipients = [];
    const ids = [];
    for (let i = 0; i < collectionSize; i++) {
      recipients.push('0x' + randomBytes(20).toString('hex'));
      ids.push(i);
    }
    const transferTx = nft.safeTransferFromBatch(owner, recipients, ids);
    expect(transferTx).not.to.be.reverted;
    const receipt = await (await transferTx).wait();
    const gasUsed = receipt.cumulativeGasUsed;
    expect(gasUsed.toNumber()).to.be.lessThan(5_000_000);
    expect(await nft.callStatic.balanceOf(recipients[collectionSize - 1])).to.equal(1);
  });

  it('tokenURI', async () => {
    nft.mintTo([signerAddrs[0]], [collectionSize]);
    await nft.setFinalBaseURI('ipfs://whatever/');
    expect(await nft.callStatic.tokenURI(collectionSize - 1)).to.equal(`ipfs://whatever/9`);
  });

  it('royaltyInfo', async () => {
    const [payee, amount] = await nft.callStatic.royaltyInfo(0, 100);
    expect(payee).to.equal(revenueShare.address);
    expect(amount.toNumber()).to.equal(royaltyPercent);
  });

  it('grantPremint/revokePremint', async () => {
    // require onlyOwner
    const eve = signers[7];
    await expect(nft.connect(eve).grantPremint(signerAddrs)).to.be.reverted;
    await expect(nft.connect(eve).revokePremint(signerAddrs)).to.be.reverted;

    const [p0a, p1a] = signerAddrs.slice(0, 2);
    const [p0, p1] = signers.slice(0, 2);

    const nftByP0 = nft.connect(p0);
    const nftByP1 = nft.connect(p1);

    await nft.grantPremint([p0a, p1a]);

    // Not premint listed.
    expect(nft.connect(eve).mint(1, { value: 1 })).to.be.reverted;

    // Preminting should not affect the ability to be given a token.
    await nft.mintTo([p0a], [1]);

    // Mint some, then get revoked, then mint all remaining slots.
    await nftByP0.mint(1, { value: 1 });
    expect(await nft.callStatic.balanceOf(p0a)).to.equal(1 + 1);
    await nft.revokePremint([p0a]);
    await expect(nftByP0.mint(1, { value: 1 })).to.be.reverted;
    await nft.grantPremint([p0a]);
    await expect(nftByP0.mint(3, { value: 3 })).to.be.reverted; // Not enough slots.
    await expect(nftByP0.mint(2, { value: 1 })).to.be.reverted; // Wrong payment.
    await expect(nftByP0.mint(2, { value: 3 })).to.be.reverted; // Wrong payment.
    expect(await nftByP0.mint(2, { value: 2 })).to.changeEtherBalance(revenueShare, 2);
    expect(await nft.callStatic.balanceOf(p0a)).to.equal(3 + 1);

    // Preminting should not affect the ability to be given a token.
    await nft.mintTo([p0a], [1]);
    expect(await nft.callStatic.balanceOf(p0a)).to.equal(3 + 2);

    // Be premintlisted but then miss the sale.
    await expect(nftByP1.callStatic.mint(1, { value: 1 })).not.to.be.reverted;
    await nft.beginPublicSale();
    await expect(nftByP1.callStatic.mint(1, { value: 1 })).to.be.reverted; // Too late.
    expect(await nftByP1.callStatic.mint(1, { value: 2 })).to.changeEtherBalance(revenueShare, 2); // Can still regular int.
  });

  it('public mint', async () => {
    const [p0a] = signerAddrs.slice(0, 2);
    const [p0] = signers.slice(0, 2);
    const nftByP0 = nft.connect(p0);

    await nft.beginPublicSale();

    // Minting should not affect the ability to be given a token.
    await nft.mintTo([p0a], [1]);

    await nftByP0.mint(1, { value: 2 });
    expect(await nft.callStatic.balanceOf(p0a)).to.equal(1 + 1);
    await expect(nftByP0.mint(2, { value: 4 })).to.be.reverted; // Not enough slots.
    await expect(nftByP0.mint(1, { value: 1 })).to.be.reverted; // Wrong payment.
    await expect(nftByP0.mint(1, { value: 3 })).to.be.reverted; // Wrong payment.
    await expect(nftByP0.mint(1, { value: 2 })).not.to.be.reverted;
    expect(await nft.callStatic.balanceOf(p0a)).to.equal(2 + 1);

    // Preminting should not affect the ability to be given a token.
    await nft.mintTo([p0a], [1]);
    expect(await nft.callStatic.balanceOf(p0a)).to.equal(2 + 2);

    expect(revenueShare.receiveMintPayment.atCall(1)).to.be.calledWith();
  });
});
