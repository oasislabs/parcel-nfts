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
  title: string;
  symbol: string;
  nfts: NftDescriptor[];
}

interface NftDescriptor {
  title?: string;
  description?: string;
  publicImage: string;
  privateData: string;
  attributes: object[];
}

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

const MANIFEST_SCHEMA: JSONSchemaType<Manifest> = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    symbol: { type: 'string' },
    nfts: { type: 'array', items: NFT_DESCRIPTOR_SCHEMA, uniqueItems: true },
  },
  required: ['title', 'symbol', 'nfts'],
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

  public async validate(): Promise<void> {
    const ajv = new Ajv({ allErrors: true });
    addFormats(ajv);

    const validate = ajv.compile(MANIFEST_SCHEMA);
    if (!validate(this.manifest)) {
      throw new ValidationErrors(validate.errors!.map((e) => e.toString()));
    }

    let missing: string[] = [];
    let seen = new Set<string>();
    let dupes: string[] = [];
    const checkMissingOrDuped = (fileName: string) => {
      if (!this.files.has(fileName)) missing.push(fileName);
      if (seen.has(fileName)) dupes.push(fileName);
      seen.add(fileName);
    };
    this.manifest.nfts.forEach((descriptor, i) => {
      checkMissingOrDuped(descriptor.publicImage);
      checkMissingOrDuped(descriptor.privateData);
    });
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
