import test from 'ava';
import { Blob } from 'node-fetch';

import { BridgeAdapterV1Factory } from '@oasislabs/parcel-evm-contracts';
import { NFTFactory } from '@oasislabs/parcel-nfts-contracts';
import ethers from 'ethers';

import { makeParcel, downloadTokenizedData } from '../src/index.js';

test('Parcel NFTs marketplace integration', async (t) => {
  t.timeout(10_000);

  const ethProvider = ethers.getDefaultProvider(
    process.env.WEB3_ENDPOINT ?? 'http://localhost:8545',
  );

  // Make the creator/deployer and user wallets.
  const makeWallet = (privateKey: string) => new ethers.Wallet(privateKey).connect(ethProvider);
  const deployerWallet = makeWallet(
    process.env.DEPLOYER_WALLET_KEY ??
      // Hardhat network account 0: 0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266
      '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
  );
  const userWallet = makeWallet(
    process.env.USER_WALLET_KEY ??
      // Hardhat network account 1: 0x70997970c51812dc3a010c7d01b50e0d17dc79c8
      '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
  );

  // Create Parcel instances for the creator/deployer and user.
  const parcelOpts = {
    apiUrl: process.env.PARCEL_API_URL ?? 'http://localhost:4242/v1',
    storageUrl: process.env.PARCEL_STORAGE_URL ?? 'http://localhost:4244',
  };
  const parcelCreator = await makeParcel(deployerWallet, parcelOpts);
  const parcelUser = await makeParcel(userWallet, parcelOpts);

  // Deploy the contracts.
  const bridgeAdapterAddr =
    process.env.BRIDGE_ADAPTER_V1_ADDR ?? '0x5FbDB2315678afecb367f032d93F642f64180aa3';
  const bridgeAdapter = new BridgeAdapterV1Factory().attach(bridgeAdapterAddr);
  if ((await ethProvider.getCode(bridgeAdapterAddr)) === '0x') {
    await new BridgeAdapterV1Factory(deployerWallet).deploy(0, 0); // It hasn't been deployed yet.
  }
  const nft = await new NFTFactory(deployerWallet).deploy(
    'Test NFT',
    'NFT',
    'ipfs://12345',
    deployerWallet.address, // treasury
    9, // collection size
    0, // premint price
    1, // max premint count
    0, // mint price
    2, // max mint count
  );
  const nftByCreator = nft;
  const nftByUser = nft.connect(userWallet);

  const nftTokenId = 0;
  await nftByCreator.mintTo(userWallet.address, 1); // Give the user an NFT, for convenience.

  const secretData = 'hunter2';

  // Set up the Parcel token and its doc.
  const [parcelToken, secretDoc] = await Promise.all([
    parcelCreator.mintToken({
      name: 'secretdata.txt',
      grant: {
        condition: null,
      },
      transferability: {
        remote: {
          network: 'emerald-testnet',
          address: nft.address,
          tokenId: nftTokenId,
        },
      },
    }),
    parcelCreator.uploadDocument(secretData, {
      owner: 'escrow',
      toApp: undefined,
    }).finished,
  ]);
  await parcelToken.addAsset(secretDoc.id);

  const savedFile: { filename?: string; data?: string } = {};

  await downloadTokenizedData(
    parcelUser,
    userWallet,
    nftByUser.address,
    nftTokenId,
    parcelToken.id,
    {
      Blob: Blob,
      bridgeAdapterAddress: bridgeAdapter.address,
      saveFile: async (data: string | Blob, filename?: string) => {
        savedFile.data = typeof data === 'string' ? data : await data.text();
        savedFile.filename = filename;
      },
    },
  );

  t.deepEqual(savedFile, {
    filename: parcelToken.name,
    data: secretData,
  });
});
