import type Parcel from '@oasislabs/parcel';
import type { DocumentId, Token, TokenId } from '@oasislabs/parcel';
import type { JSONSchemaType } from 'ajv';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import type { Signer } from 'ethers';
import { NFTStorage } from 'nft.storage';
import store2 from 'store2';
import { get } from 'svelte/store';

import type { NFT } from '@oasislabs/parcel-nft-contracts';
import { NFTFactory } from '@oasislabs/parcel-nft-contracts';

import { provider as ethProvider } from '../stores/eth';

interface Manifest {
  /** The title of the NFT collection. */
  title: string;

  /** The ticker symbol of the NFT collection. */
  symbol: string;

  /** The initial base URI of the collection. The default is none. */
  initialBaseUri?: string;

  /** Configuration of mint-time parameters. */
  minting: MintingOptions;

  /** Configuration of each item in the collection. */
  nfts: NftDescriptor[];
}

interface MintingOptions {
  /** The maximum number of tokens mintable by an individual account. */
  maxQuantity: number;

  /** The quantity of ROSE paid for one token by premint-listed accounts. */
  premintPrice: number;

  /** The quantity of ROSE paid for one token by the general public. */
  mintPrice: number;
}

interface NftDescriptor {
  /** The title of the individual item. */
  title?: string;

  /** The description of the individual item. */
  description?: string;

  /** The name of the selected file that will be the item's public image. */
  publicImage: string;

  /** The name of the selected file that will be the item's private data. */
  privateData: string;

  /** Attribute data dumped directly into the NFT metadata JSON. */
  attributes: object[];
}

export const DOCUMENTATION = `interface Manifest {
  /** The title of the NFT collection. */
  title: string;

  /** The ticker symbol of the NFT collection. */
  symbol: string;

  /** The initial base URI of the collection. The default is none. */
  initialBaseUri?: string;

  /** Configuration of mint-time parameters. */
  minting: MintingOptions;

  /** Configuration of each item in the collection. */
  nfts: NftDescriptor[];
}

interface MintingOptions {
  /** The maximum number of tokens mintable by an individual account. */
  maxQuantity: number;

  /** The quantity of ROSE paid for one token by premint-listed accounts. */
  premintPrice: number;

  /** The quantity of ROSE paid for one token by the general public. */
  mintPrice: number;
}

interface NftDescriptor {
  /** The title of the individual item. */
  title?: string;

  /** The description of the individual item. */
  description?: string;

  /** The name of the selected file that will be the item's public image. */
  publicImage: string;

  /** The name of the selected file that will be the item's private data. */
  privateData: string;

  /** Attribute data dumped directly into the NFT metadata JSON. */
  attributes: object[];
}`;

const NFT_DESCRIPTOR_SCHEMA: JSONSchemaType<NftDescriptor> = {
  type: 'object',
  properties: {
    title: { type: 'string', nullable: true },
    description: { type: 'string', nullable: true },
    publicImage: { type: 'string' },
    privateData: { type: 'string' },
    attributes: { type: 'array', items: { type: 'object' }, uniqueItems: true },
  },
  required: ['publicImage', 'privateData'],
  additionalProperties: false,
};

const MINTING_OPTIONS_SCHEMA: JSONSchemaType<MintingOptions> = {
  type: 'object',
  properties: {
    maxQuantity: { type: 'integer', minimum: 0 },
    premintPrice: { type: 'integer', minimum: 0 },
    mintPrice: { type: 'integer', minimum: 0 },
  },
  required: ['maxQuantity', 'premintPrice', 'mintPrice'],
  additionalProperties: false,
};

const MANIFEST_SCHEMA: JSONSchemaType<Manifest> = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    symbol: { type: 'string' },
    initialBaseUri: { type: 'string', format: 'uri', nullable: true },
    minting: MINTING_OPTIONS_SCHEMA,
    nfts: { type: 'array', items: NFT_DESCRIPTOR_SCHEMA, uniqueItems: true },
  },
  required: ['title', 'symbol', 'minting', 'nfts'],
  additionalProperties: false,
};

export class Bundle {
  private constructor(
    public readonly manifest: Manifest,
    private readonly files: Map<string, File>,
  ) {}

  public static async create(filesList: FileList): Promise<Bundle> {
    const files = new Map<string, File>();
    for (let i = 0; i < filesList.length; ++i) {
      const f = filesList[i];
      files.set(f.name, f);
    }

    let manifestFile = files.get('manifest.json');
    if (manifestFile === undefined) {
      throw new ValidationErrors(['Missing manifest.json']);
    }
    let manifest: Manifest;
    try {
      const manifestData = await manifestFile.text();
      manifest = JSON.parse(manifestData);
    } catch (e) {
      throw new ValidationErrors([`Failed to load manifest.json: ${e}`]);
    }

    return new Bundle(manifest, files);
  }

  public validate(): void {
    const ajv = new Ajv({ allErrors: true });
    addFormats(ajv);

    const validate = ajv.compile(MANIFEST_SCHEMA);
    if (!validate(this.manifest)) {
      throw new ValidationErrors(
        validate.errors!.map((e) => {
          let target;
          if (e.instancePath === '') {
            target = 'manifest';
          } else {
            target = `manifest.nfts[${e.instancePath.split('/')[2]}]`;
          }
          return `${target} ${e.message}`;
        }),
      );
    }

    let missing: string[] = [];
    let seen = new Set<string>();
    let dupes: string[] = [];
    const checkMissingOrDuped = (fileName: string) => {
      if (!this.files.has(fileName)) missing.push(fileName);
      if (seen.has(fileName)) dupes.push(fileName);
      seen.add(fileName);
    };
    for (const descriptor of this.manifest.nfts) {
      checkMissingOrDuped(descriptor.publicImage);
      checkMissingOrDuped(descriptor.privateData);
    }
    const validationErrors = [
      ...missing.map((f) => `Missing: ${f}.`),
      ...dupes.map((f) => `Duplicated: ${f}.`),
    ];
    if (validationErrors.length !== 0) {
      throw new ValidationErrors(validationErrors);
    }
  }

  public async mint(): Promise<void> {
    const nft = new NFTFactory(get(ethProvider).getSigner());
    // nft.deploy(manifest.);
    // 1. create nft contract
    // 2. upload public images
    // 3. create parcel tokens
    // 4. upload nft attributes
    // 5. upload private data, add to tokens
  }
}

export class ValidationErrors {
  constructor(public readonly validationErrors: string[]) {}

  public appending(errorOrErrors: string | string[]): ValidationErrors {
    return new ValidationErrors([
      ...this.validationErrors,
      ...(Array.isArray(errorOrErrors) ? errorOrErrors : [errorOrErrors]),
    ]);
  }
}
