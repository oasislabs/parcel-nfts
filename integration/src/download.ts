import type { Signer } from '@ethersproject/abstract-signer';
import type { DocumentId, EscrowedAsset, Identity, Token, TokenId } from '@oasislabs/parcel';
import Parcel from '@oasislabs/parcel';

import { getOrCreateParcelIdentity, wrapErr } from './utils';

/**
 * Downloads tokenized data from Parcel.
 * @param parcel the Parcel instance, perhaps created by calling `makeParcel`.
 * @param ethSigner the `ethers.Signer` that was used to call `makeParcel` (or has been linked to a pre-existing Parcel identity)
 * @param nftContractAddr the address of the NFT contract bridgable to Parcel.
 * @param nftTokenId the index of the item for which to download data.
 */
export async function downloadTokenizedData(
  parcel: Parcel,
  ethSigner: Signer,
  nftContractAddr: string,
  nftTokenId: number,
  parcelTokenId: TokenId,
  options?: Partial<{
    bridgeTimeoutSeconds: number;
    /** Blob polyfill, if needed. */
    Blob: typeof Blob;
    /** Alternative download function used in tests. */
    saveFile: (data: string | Blob, filename?: string) => void;
    /** The Parcel bridge adapter address used in tests. */
    bridgeAdapterAddress: string;
  }>,
): Promise<void> {
  const signerAddr = await ethSigner.getAddress();

  const [{ NFTFactory }, bridgeAdapter] = await Promise.all([
    import('@oasislabs/parcel-nfts-contracts'),
    import('@oasislabs/parcel-evm-contracts').then(async ({ EmeraldBridgeAdapterV1 }) => {
      return EmeraldBridgeAdapterV1.connect(ethSigner, options?.bridgeAdapterAddress);
    }),
  ]);
  const nft = NFTFactory.connect(nftContractAddr, ethSigner);

  const unlockToken = async () => {
    console.log('downloadTokenizedData:', 'unlocking token');
    try {
      await bridgeAdapter.unlockERC721(signerAddr, nft.address, nftTokenId, []);
    } catch (e: any) {
      throw wrapErr(e, 'failed to unlock token from Parcel bridge adapter');
    }
  };

  // Lock token into Parcel bridge adapter to recieve on Parcel (if not already).
  if ((await nft.callStatic.ownerOf(nftTokenId)) !== bridgeAdapter.address) {
    console.log('downloadTokenizedData: locking NFT into Parcel bridge adapter');
    await nft['safeTransferFrom(address,address,uint256)'](
      signerAddr,
      bridgeAdapter.address,
      nftTokenId,
    );
  }

  // Authenticate to Parcel.
  let parcelIdentity: Identity;
  try {
    parcelIdentity = await getOrCreateParcelIdentity(parcel, ethSigner);
  } catch (e: any) {
    throw wrapErr(e, 'failed to obtain Parcel identity');
  }

  // Obtain the Parcel token.
  let parcelToken: Token;
  try {
    parcelToken = await parcel.getToken(parcelTokenId);
  } catch (e: any) {
    throw wrapErr(e, 'failed to fetch Parcel token');
  }

  // Get the Parcel token's assets.
  let tokenAssets: EscrowedAsset[];
  try {
    tokenAssets = (await parcelToken.searchAssets()).results;
    if (tokenAssets.length > 1) {
      console.warn(
        'found',
        tokenAssets.length,
        'assets in token',
        parcelTokenId,
        'but only the first will be downloaded',
      );
    }
    if (tokenAssets.length === 0) {
      console.error('token', parcelTokenId, 'has no assets?');
      await unlockToken();
      throw new Error('there are no assets');
    }
  } catch (e: any) {
    throw wrapErr(e, 'failed to fetch Parcel token assets');
  }

  // Wait until the Parcel identity has received the Parcel token.
  console.log('downloadTokenizedData: waiting for Parcel to receive bridged token');
  waitForToken: try {
    for (
      let elapsedTime = 0;
      elapsedTime < (options?.bridgeTimeoutSeconds ?? 15);
      elapsedTime += 1
    ) {
      const { balance } = await parcelIdentity.getTokenBalance(parcelTokenId);
      if (balance > 0) break waitForToken;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    throw new Error('timed out');
  } catch (e: any) {
    throw wrapErr(e, 'failed to wait for token to be bridged');
  }

  // Download the asset.
  console.log('downloadTokenizedData: downloading data asset');
  try {
    const docId = tokenAssets[0].id as DocumentId;
    const dataChunks = [];
    for await (const chunk of parcel.downloadDocument(docId)) {
      dataChunks.push(chunk);
    }
    const data = new (options?.Blob ?? Blob)(dataChunks);
    const saveAs = options?.saveFile ?? (await import('file-saver')).saveAs;
    saveAs(data, parcelToken.name);
  } catch (e: any) {
    throw wrapErr(e, 'failed to download private asset');
  }

  await unlockToken();
}
