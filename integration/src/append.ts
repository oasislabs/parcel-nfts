import type { Signer } from '@ethersproject/abstract-signer';
import type Parcel from '@oasislabs/parcel';
import type { DocumentId, Token, TokenId } from '@oasislabs/parcel';
import type { BigNumber } from 'ethers';
import type store2 from 'store2';

import { IFutureParcelNFT, IFutureParcelNFT__factory } from '@oasislabs/parcel-nfts-contracts';

import { ValidationErrors } from './index.js';
import { wrapErr } from './utils.js';

type NftId = number;

type Plan = {
  create: Map<NftId, File[]>;
  append: Map<NftId, [Token, File[]]>;
};

const COST_PER_FILE = 3;
const COST_PER_GB = 50;

export class Appendle {
  #plan!: Plan;
  #paid = false;

  private constructor(
    public readonly nft: IFutureParcelNFT,
    public readonly network: 'emerald-mainnet' | 'emerald-testnet',
    private readonly files: Map<number, File[]>,
    private readonly progress: typeof store2,
  ) {}

  public get paid(): boolean {
    return this.#paid;
  }

  public static async create(
    signer: Signer,
    nftAddr: string,
    filesList: FileList,
  ): Promise<Appendle> {
    const store2P = import('store2');
    const validationErrors: string[] = [];

    let networkName: 'emerald-mainnet' | 'emerald-testnet' | undefined;
    const chainId = await signer.getChainId();
    if (chainId === 0xa515 || chainId === 1337) networkName = 'emerald-testnet';
    else if (chainId === 0xa516) networkName = 'emerald-mainnet';
    else validationErrors.push('network must be Emerald Mainnet or Emerald Testnet');

    const nft = IFutureParcelNFT__factory.connect(nftAddr, signer);
    try {
      const isFutureParcelNft = await nft.callStatic.supportsInterface('0xf6b2dddc');
      if (!isFutureParcelNft) {
        validationErrors.push(`contract at ${nftAddr} does not implement IFutureParcelNFT`);
      }
    } catch (e: any) {
      validationErrors.push(
        `contract at ${nftAddr} could not be determined to be an IFutureParcelNFT`,
      );
    }

    const files = new Map<number, File[]>();
    for (let i = 0; i < filesList.length; ++i) {
      const f = filesList[i];
      if (f.name.startsWith('.')) continue;
      const path = f.webkitRelativePath;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const [_rootDir, nftIdStr, _fileName, ...extraPath] = f.webkitRelativePath.split('/');
      if (extraPath.length > 0) {
        validationErrors.push(`unexpected file: ${path}`);
        continue;
      }
      let nftId: number;
      try {
        nftId = Number.parseInt(nftIdStr, 10);
      } catch (e: any) {
        validationErrors.push(`${nftIdStr} in ${path} is not an NFT ID`);
        continue;
      }
      let nftFiles = files.get(nftId);
      if (!nftFiles) {
        nftFiles = [];
        files.set(nftId, nftFiles);
      }
      nftFiles.push(f);
    }

    if (validationErrors.length !== 0) {
      throw new ValidationErrors(validationErrors);
    }

    const progress = (await store2P).default.namespace(networkName!);
    return new Appendle(nft, networkName!, files, progress);
  }

  /** Returns the cost in ROSE of executing the appendle. */
  public async calculateCost(): Promise<number> {
    if (!this.#plan) throw new Error('calculateCost: not yet planned');
    let newFiles = 0;
    let newFilesSize = 0;
    this.#forEachFile((f, nftId) => {
      if (!this.progress.get(filePaymentCacheKey(this.nft.address, nftId, f))) {
        newFiles += 1;
        newFilesSize += f.size;
      }
    });
    const fileCost = newFiles * COST_PER_FILE;
    const dataCost = (newFilesSize / 1024 / 1024 / 1024) * COST_PER_GB;
    const totalCost = fileCost + dataCost;
    return Math.round(totalCost * 1000) / 1000;
  }

  public async plan(parcel: Parcel): Promise<void> {
    if (this.#plan) return;

    const plan: Plan = { create: new Map(), append: new Map() };

    const nftIds = [...this.files.keys()];
    // 1. Get the existing Parcel token mapping for the tokens;
    let fetchedParcelTokens: Array<TokenId | null>;
    try {
      fetchedParcelTokens = await Promise.all(
        nftIds.map(async (id) => parseTokenIdU256(await this.nft.callStatic.getParcelToken(id))),
      );
    } catch (e) {
      throw wrapErr(e, 'failed to fetch existing Parcel token mapping');
    }

    for (let i = 0; i < nftIds.length; i++) {
      const nftId = nftIds[i];
      const files = this.files.get(nftId);
      if (!files) throw new Error(`plan: no files for token ID ${nftId}?`);
      const tid = fetchedParcelTokens[i];

      // If the Parcel token doesn't exist, write in the plan that we need to create it.
      if (tid === null) {
        plan.create.set(nftId, files);
        continue;
      }

      // If the Parcel token exists, record in the plan to append the *new* assets only
      let parcelToken: Token;
      try {
        parcelToken = await parcel.getToken(tid);
      } catch (e: any) {
        throw wrapErr(e, `failed to fetch Parcel token ${tid}`);
      }

      let existingAssets;
      try {
        existingAssets = (await parcelToken.searchAssets()).results;
      } catch (e: any) {
        throw wrapErr(e, `failed to fetch assets for Parcel token ${parcelToken.id}`);
      }
      const existingAssetNames = new Set<string>();
      for (const asset of existingAssets) {
        try {
          if (asset.type !== 'document') continue;
          const doc = await parcel.getDocument(asset.id as DocumentId);
          if (doc.details.title) existingAssetNames.add(doc.details.title);
        } catch (e: any) {
          throw wrapErr(e, `failed to fetch assets ${asset.id} in Parcel token ${parcelToken.id}`);
        }
      }

      const newFiles = this.files.get(nftIds[i])!.filter((f) => !existingAssetNames.has(f.name));
      plan.append.set(nftId, [parcelToken, newFiles]);
    }

    this.#plan = plan;
  }

  public async append(parcel: Parcel): Promise<void> {
    if (!this.#plan) throw new Error('append: not yet planned');
    if (!this.#paid) throw new Error('append: not yet paid');

    const { create, append } = this.#plan;

    const toUpload = new Map();
    for (const [k, v] of append) toUpload.set(k, v);

    const createdNftTokenIds: Array<[NftId, TokenId]> = [];
    for (const [nftId, files] of create) {
      const progressKey = `token-${nftId}`;
      let token: Token;
      const cachedTokenId = this.progress.get(progressKey);
      if (cachedTokenId) {
        try {
          token = await parcel.getToken(this.progress.get(progressKey));
        } catch (e) {
          throw wrapErr(e, `failed to get prevously created Parcel token for NFT ID ${nftId}`);
        }
      } else {
        try {
          token = await parcel.mintToken({
            grant: {
              condition: null, // Allow full access to the holder.
            },
            consumesAssets: true,
            transferability: {
              remote: {
                network: this.network,
                address: this.nft.address,
                tokenId: nftId,
              },
            },
          });
          this.progress.set(progressKey, token.id);
        } catch (e: any) {
          throw wrapErr(e, `failed to create Parcel token for NFT ID ${nftId}`);
        }
      }
      createdNftTokenIds.push([nftId, token.id]);
      toUpload.set(nftId, [token, files]);
    }

    try {
      const nftIds = [];
      const tokenIdU256s = [];
      const te = new TextEncoder();
      for (const [nftId, tokenId] of createdNftTokenIds.sort()) {
        nftIds.push(nftId);
        const tokenIdU256 = new Uint8Array(32);
        te.encodeInto(tokenId, tokenIdU256);
        tokenIdU256s.push(tokenIdU256);
      }
      await this.nft.setParcelTokens(nftIds, tokenIdU256s);
    } catch (e: any) {
      throw wrapErr(e, 'failed to set Parcel tokens on NFT contract');
    }

    for (const [nftId, [parcelToken, files]] of toUpload) {
      for (const file of files) {
        const progressKey = `doc-id-${nftId}-${file.name}`;
        let newAssetId = this.progress.get(progressKey);
        if (!newAssetId) {
          try {
            const doc = await parcel.uploadDocument(file, {
              owner: 'escrow',
              details: {
                title: file.name,
              },
              toApp: undefined,
            }).finished;
            newAssetId = doc.id;
            this.progress.set(progressKey, newAssetId);
          } catch (e: any) {
            throw wrapErr(e, `failed to add ${file.name} to Parcel token ${parcelToken.id}`);
          }
        }
        try {
          await parcelToken.addAsset(newAssetId);
        } catch (e: any) {
          throw wrapErr(e, `failed to add ${newAssetId} to Parcel token ${parcelToken.id}`);
        }
      }
    }
  }

  public async requestPayment(signer: Signer): Promise<void> {
    if (!this.#plan) throw new Error('requestPayment: not yet planned');
    if (this.#paid) return;
    const cost = await this.calculateCost();
    if (cost > 0) {
      const tx = await signer.sendTransaction({
        to: '0x45708C2Ac90A671e2C642cA14002C6f9C0750057',
        value: BigInt(Math.ceil(cost * 1e10)) * BigInt(1e8),
      });
      const mined = await tx.wait();
      if (mined.status !== 1) throw new Error(`payment tx ${tx.hash} failed`);
      this.#paid = mined.status === 1;
    } else {
      this.#paid = true;
    }
    this.#forEachFile((f, nftId) => {
      this.progress.set(filePaymentCacheKey(this.nft.address, nftId, f), true);
    });
  }

  #forEachFile(f: (f: File, nftId: NftId) => void): void {
    if (!this.#plan) return;
    const { create, append } = this.#plan;
    for (const [nftId, files] of create) for (const file of files) f(file, nftId);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for (const [nftId, [_token, files]] of append) for (const file of files) f(file, nftId);
  }
}

function filePaymentCacheKey(nftAddr: string, nftId: NftId, f: File): string {
  return `paid-${nftAddr}-${nftId}-${f.name}`;
}

function parseTokenIdU256(tokenIdU256: BigNumber): TokenId | null {
  if (tokenIdU256.isZero()) return null;
  const tokenIdBytes = parseHex(
    tokenIdU256
      .toHexString()
      .replace('0x', '')
      .replace(/(00)+$/, ''),
  );
  return new TextDecoder().decode(tokenIdBytes) as TokenId;
}

function parseHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }

  return bytes;
}
