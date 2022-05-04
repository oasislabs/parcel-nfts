import { promises as fs } from 'fs';
import path from 'path';

import canonicalize from 'canonicalize';
import { TASK_COMPILE } from 'hardhat/builtin-tasks/task-names';
import { HardhatUserConfig, task, types } from 'hardhat/config';

import '@nomiclabs/hardhat-waffle';
import '@typechain/hardhat';
import 'hardhat-watcher';
import 'solidity-coverage';

const TASK_EXPORT_ABIS = 'export-abis';
const TASK_NFT_SET_BASE_URI = 'set-nft-base-uri';
const TASK_NFT_MINT_TO = 'airdrop-nfts';
const TASK_NFT_GET_ROYALTY = 'get-nft-royalty';
const TASK_DESCRIBE_NFT = 'describe-nft';
const TASK_DESCRIBE_TREASURY = 'describe-treasury';

task(TASK_COMPILE, async (_args, hre, runSuper) => {
  await runSuper();
  await hre.run(TASK_EXPORT_ABIS);
});

task(TASK_EXPORT_ABIS, async (_args, hre) => {
  const srcDir = path.basename(hre.config.paths.sources);
  const outDir = path.join(hre.config.paths.root, 'abis');

  const [artifactNames] = await Promise.all([
    hre.artifacts.getAllFullyQualifiedNames(),
    fs.mkdir(outDir, { recursive: true }),
  ]);

  await Promise.all(
    artifactNames.map(async (fqn) => {
      const { abi, contractName, sourceName } = await hre.artifacts.readArtifact(fqn);
      if (abi.length === 0 || !sourceName.startsWith(srcDir)) return;
      await fs.writeFile(`${path.join(outDir, contractName)}.json`, `${canonicalize(abi)}\n`);
    }),
  );
});

task(TASK_NFT_SET_BASE_URI, "Sets an NFT's base URI.")
  .addParam('nftAddr', 'The NFT contract address.', null, types.string)
  .addParam('baseUri', 'The base URI.', null, types.string)
  .setAction(async (args) => {
    const { ethers } = await import('hardhat');
    const signers = await ethers.getSigners();
    const NFT = await ethers.getContractFactory('NFT');
    const nft = NFT.connect(signers[0]).attach(args.nftAddr);
    const tx = await nft.setFinalBaseURI(args.baseUri);
    console.log(tx.hash);
  });

task(TASK_NFT_MINT_TO, 'Mints tokens to a set of addresses.')
  .addParam('nftAddr', 'The NFT contract address.', null, types.string)
  .addVariadicPositionalParam(
    'recipientCounts',
    'Space separated pairs of address,count',
    [],
    types.string,
  )
  .setAction(async (args) => {
    const recipients = [];
    const counts = [];
    for (const rc of args.recipientCounts) {
      const [recipient, countStr] = rc.split(',');
      const count = parseInt(countStr, 10);
      if (!recipient || recipient.length !== 42 || !countStr || !Number.isFinite(count)) {
        throw new TypeError(`invalid address,count: ${rc}`);
      }
      recipients.push(recipient);
      counts.push(count);
    }
    const { ethers } = await import('hardhat');
    const signers = await ethers.getSigners();
    const NFT = await ethers.getContractFactory('NFT');
    const nft = NFT.connect(signers[0]).attach(args.nftAddr);
    const tx = await nft.mintTo(recipients, counts);
    console.log(tx.hash);
  });

task(TASK_NFT_GET_ROYALTY, 'Retrieves the royalty for the NFT item.')
  .addParam('nftAddr', 'The NFT contract address.', null, types.string)
  .addParam('tokenId', 'The token ID.', null, types.int)
  .setAction(async (args) => {
    const { ethers } = await import('hardhat');
    const NFT = await ethers.getContractFactory('NFT');
    const nft = NFT.attach(args.nftAddr).connect(ethers.provider);
    const [_, royalty] = await nft.callStatic.royaltyInfo(args.tokenId, 10_000);
    console.log(royalty.toNumber() / 10_000);
  });

task(TASK_DESCRIBE_NFT, 'Gets the details of the NFT.')
  .addParam('nftAddr', 'The NFT contract address.', null, types.string)
  .setAction(async (args) => {
    const { ethers } = await import('hardhat');
    const NFT = await ethers.getContractFactory('NFT');
    const nft = NFT.attach(args.nftAddr).connect(ethers.provider);

    const [treasury, hasBegunPublicSale, ...numericProps] = await Promise.all([
      nft.callStatic.treasury(),
      nft.callStatic.hasBegunPublicSale(),
      nft.callStatic.collectionSize(),
      nft.callStatic.maxPremintCount(),
      nft.callStatic.premintPrice(),
      nft.callStatic.maxMintCount(),
      nft.callStatic.mintPrice(),
    ]);
    const [collectionSize, maxPremintCount, premintPrice, maxMintCount, mintPrice] =
      numericProps.map((bn) => bn.toNumber());

    console.log(
      JSON.stringify(
        {
          treasury,
          hasBegunPublicSale,
          collectionSize,
          maxPremintCount,
          premintPrice,
          maxMintCount,
          mintPrice,
        },
        undefined,
        2,
      ),
    );
  });

task(TASK_DESCRIBE_TREASURY, 'Gets the details of the NFT treasury.')
  .addParam('nftAddr', 'The NFT contract address.', null, types.string)
  .setAction(async (args) => {
    const { ethers } = await import('hardhat');
    const NFT = await ethers.getContractFactory('NFT');
    const nft = NFT.attach(args.nftAddr).connect(ethers.provider);
    const treasury = await nft.callStatic.treasury();
    const RevenueShare = await ethers.getContractFactory('RevenueShare');
    const revenueShare = RevenueShare.attach(treasury).connect(ethers.provider);
    const [denominator, mintFee, royaltyFee] = (
      await Promise.all([
        revenueShare.callStatic.denominator(),
        revenueShare.callStatic.mintFeePercentNumerator(),
        revenueShare.callStatic.royaltyFeePercentNumerator(),
      ])
    ).map((bn) => bn.toNumber());
    console.log(
      JSON.stringify(
        {
          treasury,
          mintFee: (mintFee / denominator) * 100,
          royaltyFee: (royaltyFee / denominator) * 100,
        },
        undefined,
        2,
      ),
    );
  });

const config: HardhatUserConfig = {
  networks: {
    hardhat: {
      chainId: 1337, // @see https://hardhat.org/metamask-issue.html
    },
    'emerald-testnet': {
      url: 'https://testnet.emerald.oasis.dev',
      accounts: process.env.EMERALD_TESTNET_PRIVATE_KEY
        ? [process.env.EMERALD_TESTNET_PRIVATE_KEY]
        : [],
    },
    'emerald-mainnet': {
      url: 'https://emerald.oasis.dev',
      accounts: process.env.EMERALD_MAINNET_PRIVATE_KEY
        ? [process.env.EMERALD_MAINNET_PRIVATE_KEY]
        : [],
    },
  },
  solidity: {
    version: '0.8.9',
    settings: {
      optimizer: {
        enabled: true,
        runs: (1 << 32) - 1,
      },
    },
  },
  watcher: {
    compile: {
      tasks: ['compile'],
      files: ['./contracts/'],
    },
    test: {
      tasks: ['test'],
      files: ['./contracts/', './test'],
    },
    coverage: {
      tasks: ['coverage'],
      files: ['./contracts/', './test'],
    },
  },
  mocha: {
    require: ['ts-node/register/files'],
    timeout: 20000,
  },
};

export default config;
