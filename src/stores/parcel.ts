import type { Writable } from 'svelte/store';
import { get, writable } from 'svelte/store';

import type { Identity, TokenProvider } from '@oasislabs/parcel';
import Parcel from '@oasislabs/parcel';

import { address as ethAddress, provider as ethProvider } from './eth';
import { error } from './error';
import { unwritable } from './utils';

const parcelStore: Writable<Parcel> = writable(undefined, function start(set) {
	return ethAddress.subscribe(() => {
		set(undefined);
	});
});

function makeParcel(ethAddr?: string): Parcel {
	let tokenProvider: TokenProvider = '';
	if (ethAddr) {
		tokenProvider = {
			principal: ethAddr,
			scopes: ['parcel.safe'],
			ethProviderUsingAccountIndex: 0
		};
	}
	return new Parcel(tokenProvider, {
		apiUrl: 'http://localhost:4242/v1'
	});
}

const identityStore: Writable<Identity> = writable(undefined, function start(set) {
	return parcelStore.subscribe(async (parcel) => {
		if (!parcel) return;
		try {
			console.log('getting current identity');
			set(await parcel.getCurrentIdentity());
			return;
		} catch (e) {
			if (e?.response?.status !== 404) {
				error.set('Failed to fetch Parcel identity. Please try again later.');
				console.error('failed to fetch Parcel identity', e);
				return;
			}
		}
		// The identity does not exist, so create one.
		try {
			const signer = get(ethProvider).getSigner();
			console.log('creating identity');
			set(
				await makeParcel().createIdentity({
					ethAddress: get(ethAddress),
					proof: await signer.signMessage('parcel.createIdentity')
				})
			);
		} catch (e) {
			error.set('Failed to create Parcel identity. Please try again later.');
			console.error('failed to create Parcel identity', e);
		}
	});
});
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
