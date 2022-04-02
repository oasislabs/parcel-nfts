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
import { parcel as parcelStore } from '../stores/parcel';

const NFT_STORAGE_TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkaWQ6ZXRocjoweDM5NDAxMWUwNUI1ODU5RmFlNDIxQTk1ZjI3ODdFMDg4Nzg5OGJGNEUiLCJpc3MiOiJuZnQtc3RvcmFnZSIsImlhdCI6MTYzNTIyNzM1MjcyNSwibmFtZSI6InRlc3QifQ.xY5yiRm0aw5wWeRK3dMHWDTV6T0C55fSdEH9nJUOxN0';

function nftStorageLink(cid: string): string {
  return 'https://nftstorage.link/ipfs/' + cid;
}

export class Bundle {
  private readonly progress: typeof store2;

  private constructor(
    public readonly manifest: Manifest,
    private readonly files: Map<string, File>,
  ) {
    this.progress = store2.namespace(JSON.stringify([this.manifest.title, this.manifest.symbol]));
  }

  public static async create(filesList: FileList): Promise<Bundle> {
    const files = new Map<string, File>();
    for (let i = 0; i < filesList.length; ++i) {
      const f = filesList[i];
      files.set(f.name, f);
    }

    const manifestFile = files.get('manifest.json');
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

    const ajv = addFormats(new Ajv({ allErrors: true }));

    const validate = ajv.compile(MANIFEST_SCHEMA);
    if (!validate(manifest)) {
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

    const missing: string[] = [];
    const seen = new Set<string>();
    const dupes: string[] = [];
    const checkMissingOrDuped = (fileName: string) => {
      if (!files.has(fileName)) missing.push(fileName);
      if (seen.has(fileName)) dupes.push(fileName);
      seen.add(fileName);
    };
    for (const descriptor of manifest.nfts) {
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

    return new Bundle(manifest, files);
  }

  public async mint(): Promise<{ address: string; baseUri: string }> {
    const progressKey = 'result';
    if (this.progress.get(progressKey)) {
      return this.progress.get(progressKey);
    }

    const parcel = get(parcelStore);
    if (!parcel) throw new Error('not connected to Parcel');
    const provider = get(ethProvider);
    if (!provider) throw new Error('Eth provider not connected');
    const signer = provider.getSigner();
    const nftStorage = new NFTStorage({ token: NFT_STORAGE_TOKEN });

    function wrapErr(e: any, msg: string): Error {
      console.error(e);
      throw Object.assign(new Error(`${msg}: ${e.message ?? e.toString()}`), { source: e });
    }

    // 1: Upload public images.
    let imagesUpload: ImagesUpload;
    try {
      console.log('mint: uploading images');
      imagesUpload = await this.uploadPublicImages(nftStorage);
    } catch (e: any) {
      throw wrapErr(e, 'failed to upload public images');
    }

    // 2: Create the NFT contract.
    let nft: NFT;
    try {
      console.log('mint: deploying contract');
      nft = await this.deployNFTContract(signer);
    } catch (e: any) {
      throw wrapErr(e, 'failed to create NFT contract');
    }

    // 3. Create parcel tokens.
    let parcelTokens: Token[];
    try {
      console.log('mint: creating parcel tokens');
      parcelTokens = await this.createParcelTokens(parcel, nft);
    } catch (e: any) {
      throw wrapErr(e, 'failed to create Parcel tokens');
    }

    // 4. Upload nft attributes.
    let metadatasCid: string;
    try {
      console.log('mint: uploading token metadatas');
      metadatasCid = await this.uploadMetadatas(nftStorage, imagesUpload, parcelTokens);
    } catch (e: any) {
      throw wrapErr(e, 'failed to upload token metadatas');
    }

    // 5. Upload and tokenize private data.
    try {
      console.log('mint: uploading and tokenizing private data');
      await this.uploadAndTokenizePrivateData(parcel, parcelTokens);
    } catch (e: any) {
      throw wrapErr(e, 'failed to tokenize private data');
    }

    const result = {
      address: nft.address,
      baseUri: nftStorageLink(metadatasCid),
    };
    this.progress.set(progressKey, result);
    console.log('mint: done!');
    return result;
  }

  private async deployNFTContract(signer: Signer): Promise<NFT> {
    const progressKey = 'nftContract';
    const createdContractAddr: string = this.progress.get(progressKey);
    if (createdContractAddr) {
      return NFTFactory.connect(createdContractAddr, signer);
    }
    // TODO: revenue sharing
    const treasury = await signer.getAddress();
    const nftFactory = new NFTFactory(get(ethProvider).getSigner());
    const nftContract = await nftFactory.deploy(
      this.manifest.title,
      this.manifest.symbol,
      this.manifest.initialBaseUri ?? '',
      this.manifest.minting.maxQuantity,
      this.manifest.minting.premintPrice,
      this.manifest.minting.mintPrice,
      treasury,
    );
    this.progress.set(progressKey, nftContract.address);
    return nftContract;
  }

  private async uploadPublicImages(nftStorage: NFTStorage): Promise<ImagesUpload> {
    // This is idempotent, so there's no need to record progress.
    const filenames: string[] = [];
    const cid = await nftStorage.storeDirectory(
      this.manifest.nfts.map((descriptor, i) => {
        const file = this.files.get(descriptor.publicImage)!;
        const fileNameComps = file.name.split('.');
        const ext = fileNameComps.length > 1 ? fileNameComps.pop() : '';
        const storedFilename = `${i}.${ext}`;
        filenames.push(storedFilename);
        return new File([file], storedFilename, { type: file.type });
      }),
    );
    return {
      cid,
      filenames,
    };
  }

  private async createParcelTokens(parcel: Parcel, nft: NFT): Promise<Token[]> {
    const progressKey = 'parcelTokens';
    const createdTokens: { [key: string]: TokenId } = this.progress.get(progressKey) ?? {};
    const results = await Promise.allSettled(
      this.manifest.nfts.map(async (_, i) => {
        const name = `${this.manifest.title} #${i}`;
        if (createdTokens[name]) {
          console.log('skipping creating parcel token with name', `${name}`);
          return parcel.getToken(createdTokens[name]);
        }
        const token = await parcel.mintToken({
          name,
          grant: {
            condition: null, // Allow full access.
          },
          consumesAssets: true,
          transferability: {
            remote: {
              network: 'emerald-testnet', // TODO: chain id
              address: nft.address,
              tokenId: i,
            },
          },
        });
        createdTokens[name] = token.id;
        return token;
      }),
    );
    this.progress.set(progressKey, createdTokens);
    const tokens = [];
    for (const result of results) {
      if (result.status === 'rejected') {
        throw new Error(result.reason);
      }
      tokens.push(result.value);
    }
    return tokens;
  }

  private async uploadMetadatas(
    nftStorage: NFTStorage,
    { cid: imagesCid, filenames: imageFilenames }: ImagesUpload,
    parcelTokens: Token[],
  ): Promise<string> {
    // This is idempotent, so there's no need to record progress.
    const metadatas: File[] = [];
    for (let i = 0; i < this.manifest.nfts.length; ++i) {
      const descriptor = this.manifest.nfts[i];
      metadatas.push(
        new File(
          [
            JSON.stringify(
              {
                name: descriptor.title,
                description: descriptor.description,
                image: `${nftStorageLink(imagesCid)}/${imageFilenames[i]}`,
                parcel_token: parcelTokens[i].id,
                attributes: descriptor.attributes,
              },
              null,
              2,
            ),
          ],
          `${i}.json`,
          { type: 'application/json' },
        ),
      );
    }
    return nftStorage.storeDirectory(metadatas);
  }

  private async uploadAndTokenizePrivateData(parcel: Parcel, parcelTokens: Token[]): Promise<void> {
    const progressKey = 'tokenDocs';
    const tokDocs: { [key: TokenId]: { id?: DocumentId; tokenized?: boolean } } =
      this.progress.get(progressKey) ?? {};
    const results = await Promise.allSettled(
      this.manifest.nfts.map(async (descriptor, i) => {
        const token = parcelTokens[i] ?? {};
        if (tokDocs[token.id] === undefined) {
          tokDocs[token.id] = {};
        }
        if (tokDocs[token.id].id === undefined) {
          const doc = await parcel.uploadDocument(this.files.get(descriptor.privateData)!, {
            owner: 'escrow',
            toApp: undefined,
          }).finished;
          tokDocs[token.id].id = doc.id;
        } else {
          console.log(`skipping upload of token ${i}'s document`);
        }
        if (tokDocs[token.id].tokenized) {
          console.log('skipping tokenization of documents in token', i);
          return;
        }
        await parcelTokens[i].addAsset(tokDocs[token.id].id!);
        tokDocs[token.id].tokenized = true;
      }),
    );
    this.progress.set(progressKey, tokDocs);
    for (const result of results) {
      if (result.status === 'rejected') {
        throw new Error(`failed to tokenize document: ${result.reason}`);
      }
    }
  }
}

type ImagesUpload = {
  cid: string;
  filenames: string[];
};

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

export class ValidationErrors {
  constructor(public readonly validationErrors: string[]) {}

  public appending(errorOrErrors: string | string[]): ValidationErrors {
    return new ValidationErrors([
      ...this.validationErrors,
      ...(Array.isArray(errorOrErrors) ? errorOrErrors : [errorOrErrors]),
    ]);
  }
}
