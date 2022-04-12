import type { Writable } from 'svelte/store';
import { get, writable } from 'svelte/store';

import type { Identity, Parcel } from '@oasislabs/parcel';
import { makeParcel } from '@oasislabs/parcel-nfts';

import { address as ethAddress, provider as ethProvider } from './eth';
import { error } from './error';
import { unwritable } from './utils';

const parcelStore: Writable<Parcel | undefined> = writable(undefined, function start(set) {
  return ethAddress.subscribe(() => {
    set(undefined);
  });
});
export const parcel = unwritable(parcelStore);

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
      } catch (e: any) {
        error.set('Failed to fetch Parcel identity. Please try again later.');
        console.error('failed to fetch Parcel identity', e);
      }
    });
  },
);
export const identity = unwritable(identityStore);

export async function connect() {
  const provider = get(ethProvider);
  if (!provider) return;
  try {
    parcelStore.set(await makeParcel(provider.getSigner()));
  } catch (e) {
    console.error(e);
  }
}
