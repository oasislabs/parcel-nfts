import type { ExternalProvider, Network } from '@ethersproject/providers';
import { Web3Provider } from '@ethersproject/providers';
import type { Writable } from 'svelte/store';
import { writable } from 'svelte/store';

import { unwritable } from './utils';

const providerStore: Writable<Web3Provider | undefined> = writable(
  undefined,
  function start(set: (provider?: Web3Provider) => void) {
    set(makeProvider());
  },
);
export const provider = unwritable(providerStore);

const networkStore: Writable<Network | undefined> = writable(
  undefined,
  function start(set: (provider?: Network) => void) {
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
  },
);
export const network = unwritable(networkStore);

const addressStore: Writable<string | undefined> = writable(
  undefined,
  function start(set: (address: string | undefined) => void) {
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
  },
);
export const address = unwritable(addressStore);

function makeProvider(): Web3Provider | undefined {
  const eth = getEth();
  return eth ? new Web3Provider(eth) : undefined;
}

function getEth(): ExternalProvider | undefined {
  const g = globalThis as any;
  return g.ethereum;
}

function isMetaMask(eth: any): eth is MetaMask {
  return eth?.isMetaMask;
}

interface MetaMask extends ExternalProvider {
  isMetamask?: boolean;
  on: (event: MetaMaskEvents, callback: (...args: any[]) => void) => void;
}

type MetaMaskEvents = 'connect' | 'disconnect' | 'accountsChanged' | 'chainChanged';
