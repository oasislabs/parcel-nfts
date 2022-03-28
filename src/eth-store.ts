import type { Writable } from 'svelte/store';
import { writable, derived } from 'svelte/store';

import { ethers } from 'ethers';

const providerStore: Writable<ethers.providers.Web3Provider> = writable(undefined);

export const provider = {
	subscribe: providerStore.subscribe
};

const networkStore: Writable<ethers.providers.Network> = writable(undefined);

export const network = {
	subscribe: networkStore.subscribe
};

const signerStore: Writable<ethers.providers.JsonRpcSigner> = writable(undefined);

export const signer = {
	subscribe: signerStore.subscribe
};

export const account = derived(signer, async ($signer) => (await $signer).getAddress());

export async function init() {
	const provider = makeProvider();
	await provider.send('eth_requestAccounts', []);
	providerStore.set(provider);
	signerStore.set(provider.getSigner());
	networkStore.set(await provider.getNetwork());

	const eth = getEth();
	if (!isMetaMask(eth)) return;
	eth.on('accountsChanged', async () => {
		signerStore.set(provider.getSigner());
	});
	eth.on('chainChanged', async () => {
		window.location.reload(); // Per MetaMask's recommendation.
	});
}

function makeProvider(): ethers.providers.Web3Provider | undefined {
	const eth = getEth();
	return eth ? new ethers.providers.Web3Provider(eth) : undefined;
}

function getEth(): ethers.providers.ExternalProvider | undefined {
	const w = window as any;
	return w.ethereum ?? w.web3;
}

function isMetaMask(eth: any): eth is MetaMask {
	return eth?.isMetaMask;
}

interface MetaMask extends ethers.providers.ExternalProvider {
	isMetamask?: boolean;
	on?: (event: MetaMaskEvents, callback: (...args: any[]) => void) => void;
}

type MetaMaskEvents = 'connect' | 'disconnect' | 'accountsChanged' | 'chainChanged';
