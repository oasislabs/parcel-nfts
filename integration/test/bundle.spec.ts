import { ValidateFunction } from 'ajv';
import test from 'ava';

import { Bundle } from '../src/index.js';

let validate: ValidateFunction<any>;

test.before(async () => {
  validate = await (Bundle as any).makeManifestValidator();
});

test('bundle validation - ok', async (t) => {
  t.true(
    validate({
      title: 'Test',
      symbol: 'TEST',
      initialBaseUri: 'ipfs://test',
      minting: {
        maxPremintCount: 2,
        premintPrice: 3,
        maxMintCount: 1,
        mintPrice: 6,
      },
      creatorRoyalty: 2,
      nfts: [
        {
          title: 'NFT 1',
          description: 'A test NFT',
          publicImage: 'image.png',
          privateData: 'secret.key',
          owner: '0x70997970c51812dc3a010c7d01b50e0d17dc79c8',
        },
      ],
    }),
    JSON.stringify(validate.errors),
  );
});

test('bundle validation - bad address', async (t) => {
  t.true(
    validate({
      title: 'Bad NFT',
      symbol: 'BAD',
      creatorRoyalty: 0,
      nfts: [
        {
          publicImage: 'image.png',
          privateData: 'secret.key',
          owner: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
        },
      ],
    }),
    JSON.stringify(validate.errors),
  );
  t.false(
    validate({
      title: 'Bad NFT',
      symbol: 'BAD',
      creatorRoyalty: 0,
      nfts: [
        {
          publicImage: 'image.png',
          privateData: 'secret.key',
          owner: '0x5FbDB2315678afecb367f032d93F642f64180aa333333',
        },
      ],
    }),
  );
});
