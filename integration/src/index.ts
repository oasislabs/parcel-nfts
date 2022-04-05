import type { Signer } from '@ethersproject/abstract-signer';
import type {
  DocumentId,
  EscrowedAsset,
  Identity,
  Parcel,
  Token,
  TokenId,
} from '@oasislabs/parcel';
import { EmeraldBridgeAdapterV1 } from '@oasislabs/parcel-evm-contracts';
import { NFTFactory } from '@oasislabs/parcel-nfts-contracts';
import { saveAs } from 'file-saver';

export interface Options {
  bridgeAdapterV1Addr: string;
}

export async function downloadTokenizedData(
  parcel: Parcel,
  ethSigner: Signer,
  nftContractAddr: string,
  nftTokenId: number,
  parcelTokenId: TokenId,
  options?: {
    bridgeTimeoutSeconds: number;
  },
): Promise<void> {
  const signerAddr = await ethSigner.getAddress();

  const nft = NFTFactory.connect(nftContractAddr, ethSigner);
  const bridgeAdapter = await EmeraldBridgeAdapterV1.connect(ethSigner);

  const unlockToken = async () => {
    try {
      await bridgeAdapter.unlockERC721(signerAddr, nft.address, nftTokenId, []);
    } catch (e: any) {
      throw wrapErr(e, 'failed to unlock token from Parcel bridge adapter');
    }
  };

  // Lock token into Parcel bridge adapter to recieve on Parcel (if not already).
  if ((await nft.callStatic.ownerOf(nftTokenId)) !== bridgeAdapter.address) {
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
  try {
    const docId = tokenAssets[0].id as DocumentId;
    const dataChunks = [];
    for await (const chunk of parcel.downloadDocument(docId)) {
      dataChunks.push(chunk);
    }
    const data = new Blob(dataChunks);
    saveAs(data, parcelToken.name);
  } catch (e: any) {
    throw wrapErr(e, 'failed to download private asset');
  }

  await unlockToken();
}

async function getOrCreateParcelIdentity(parcel: Parcel, ethSigner: Signer): Promise<Identity> {
  try {
    return parcel.getCurrentIdentity();
  } catch (e: any) {
    if (e?.response?.status !== 404) {
      throw wrapErr(e, 'failed to fetch Parcel identity');
    }
  }
  // The identity does not exist, so create one.
  try {
    const [ethAddress, proof] = await Promise.all([
      ethSigner.getAddress(),
      ethSigner.signMessage('parcel.createIdentity'),
    ]);
    return parcel.createIdentity({
      ethAddress,
      proof,
    });
  } catch (e) {
    throw wrapErr(e, 'failed to create Parcel identity');
  }
}

function wrapErr(e: any, msg: string): Error {
  console.error(e);
  throw Object.assign(new Error(`${msg}: ${e.message ?? e.toString()}`), { source: e });
}
