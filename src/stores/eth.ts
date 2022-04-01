import type { Writable } from 'svelte/store';
import { writable } from 'svelte/store';

import { ethers } from 'ethers';

import { unwritable } from './utils';

const providerStore: Writable<ethers.providers.Web3Provider> = writable(
  undefined,
  function start(set) {
    set(makeProvider());
  },
);
export const provider = unwritable(providerStore);

const networkStore: Writable<ethers.providers.Network> = writable(undefined, function start(set) {
  return providerStore.subscribe(async (provider) => {
    if (!provider) return;
    set(await provider.getNetwork());
    const eth = getEth();
    if (isMetaMask(eth)) {
      eth.on('chainChanged', async () => {
        window.location.reload(); // Per MetaMask's recommendation.
      });
    }
  });
});
export const network = unwritable(networkStore);

const addressStore: Writable<string> = writable(undefined, function start(set) {
  return providerStore.subscribe(async (provider) => {
    if (!provider) return;
    const accounts = await provider.send('eth_requestAccounts', []);
    set(accounts[0]);
    const eth = getEth();
    if (isMetaMask(eth)) {
      eth.on('accountsChanged', async (addresses: string[]) => {
        set(addresses[0]);
      });
    }
  });
});
export const address = unwritable(addressStore);

function makeProvider(): ethers.providers.Web3Provider | undefined {
  const eth = getEth();
  return eth ? new ethers.providers.Web3Provider(eth) : undefined;
}

function getEth(): ethers.providers.ExternalProvider | undefined {
  const g = globalThis as any;
  return g.ethereum;
}

function isMetaMask(eth: any): eth is MetaMask {
  return eth?.isMetaMask;
}

interface MetaMask extends ethers.providers.ExternalProvider {
  isMetamask?: boolean;
  on?: (event: MetaMaskEvents, callback: (...args: any[]) => void) => void;
}

type MetaMaskEvents = 'connect' | 'disconnect' | 'accountsChanged' | 'chainChanged';
