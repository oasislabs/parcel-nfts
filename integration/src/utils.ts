import type { Signer } from '@ethersproject/abstract-signer';
import type { Identity } from '@oasislabs/parcel';
import { Parcel } from '@oasislabs/parcel';

export function wrapErr(e: any, msg: string): Error {
  console.error(e);
  throw Object.assign(new Error(`${msg}: ${e.message ?? e.toString()}`), { source: e });
}

export async function getOrCreateParcelIdentity(
  parcel: Parcel,
  ethSigner: Signer,
): Promise<Identity> {
  try {
    return await parcel.getCurrentIdentity();
  } catch (e: any) {
    if (e?.response?.status !== 404) {
      throw wrapErr(e, 'failed to fetch Parcel identity');
    }
  }
  console.log('creating parcel identity');
  // The identity does not exist, so create one.
  try {
    const [ethAddress, proof] = await Promise.all([
      ethSigner.getAddress(),
      ethSigner.signMessage('parcel.createIdentity'),
    ]);
    return await parcel.createIdentity({
      ethAddress,
      proof,
    });
  } catch (e) {
    throw wrapErr(e, 'failed to create Parcel identity');
  }
}
