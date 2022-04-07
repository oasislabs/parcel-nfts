import type { Writable } from 'svelte/store';
import { get, writable } from 'svelte/store';

import type { Identity } from '@oasislabs/parcel';
import Parcel from '@oasislabs/parcel';

import { address as ethAddress, provider as ethProvider } from './eth';
import { error } from './error';
import { unwritable } from './utils';

const parcelStore: Writable<Parcel | undefined> = writable(undefined, function start(set) {
  return ethAddress.subscribe(() => {
    set(undefined);
  });
});
export const parcel = unwritable(parcelStore);

function makeParcel(ethAddr: string): Parcel {
  const tokenProvider = {
    principal: ethAddr,
    scopes: ['parcel.full'],
    ethProviderUsingAccountIndex: 0,
  };
  return new Parcel(tokenProvider, {
    apiUrl: 'http://localhost:4242/v1',
    storageUrl: 'http://localhost:4244',
  });
}

const identityStore: Writable<Identity | undefined> = writable(
  undefined,
  function start(set: (identity?: Identity) => void) {
    return parcelStore.subscribe(async (parcel) => {
      if (!parcel) {
        set(undefined);
        return;
      }
      try {
        set(await parcel.getCurrentIdentity());
        return;
      } catch (e: any) {
        if (e?.response?.status !== 404) {
          error.set('Failed to fetch Parcel identity. Please try again later.');
          console.error('failed to fetch Parcel identity', e);
          return;
        }
      }
      // The identity does not exist, so create one.
      try {
        const signer = get(ethProvider)!.getSigner();
        set(
          await parcel.createIdentity({
            ethAddress: get(ethAddress)!,
            proof: await signer.signMessage('parcel.createIdentity'),
          }),
        );
      } catch (e) {
        error.set('Failed to create Parcel identity. Please try again later.');
        console.error('failed to create Parcel identity', e);
      }
    });
  },
);
export const identity = unwritable(identityStore);

export async function connect() {
  const ethAddr = get(ethAddress);
  if (!ethAddr) return;
  try {
    parcelStore.set(makeParcel(ethAddr));
  } catch (e) {
    console.error(e);
  }
}
