<script lang="ts">
  import { get } from 'svelte/store';

  import type { TokenId } from '@oasislabs/parcel';
  import { downloadTokenizedData } from '@oasislabs/parcel-nfts';
  import { NFTFactory } from '@oasislabs/parcel-nfts-contracts';

  import { error } from '../../stores/error';
  import {
    provider as ethProvider,
    address as ethAddress,
    network as ethNetwork,
  } from '../../stores/eth';
  import {
    parcel as parcelStore,
    identity as parcelIdentity,
    connect as connectToParcel,
  } from '../../stores/parcel';

  let nftContractAddr = '';
  let nftTokenId: number | undefined = undefined;

  async function download() {
    const parcel = get(parcelStore);
    const ethSigner = get(ethProvider)?.getSigner();
    if (!parcel) {
      error.set('Parcel not connected.');
      return;
    }
    if (!ethSigner) {
      error.set('Eth signer not connected.');
      return;
    }
    if (!nftContractAddr || nftTokenId === undefined || nftTokenId < 0) {
      error.set('Please fill out all fields.');
      return;
    }

    const nft = NFTFactory.connect(nftContractAddr, ethSigner);

    let tokenUri: string;
    try {
      tokenUri = await nft.callStatic.tokenURI(nftTokenId);
      if (!tokenUri.startsWith('https://')) {
        throw new TypeError(`invalid token URI returned from contract ("${tokenUri}")`);
      }
      console.log('download: the token URI is', tokenUri);
    } catch (e: any) {
      error.set('Failed to fetch token URI: ' + e?.message ?? e);
      return;
    }

    let tokenMetadata;
    try {
      tokenMetadata = await (await fetch(tokenUri)).json();
      console.log('download: the token metadata is', tokenMetadata);
    } catch (e: any) {
      error.set('Failed to fetch token metadata: ' + e?.message ?? e);
      return;
    }

    try {
      await downloadTokenizedData(
        parcel!,
        ethSigner,
        nftContractAddr,
        nftTokenId,
        tokenMetadata.parcel_token as TokenId,
      );
      console.log('download: completed. check your browser download menu');
    } catch (e: any) {
      error.set('failed to download data: ' + e?.message ?? e);
      console.error(e);
    }
  }
</script>

<h1 class="font-bold text-center text-xl">Download Tokenized Data</h1>
{#if $ethAddress && $ethNetwork}
  <p class="text-center">
    Connected to
    <span class="font-mono">{`${$ethAddress.slice(0, 7)}…${$ethAddress.slice(-5)}`}</span><br />
    on the
    {#if $ethNetwork?.chainId === 0xa515}
      <span>Emerald&nbsp;Testnet</span>.
    {:else if $ethNetwork?.chainId === 0xa516}
      <span>Emerald&nbsp;Mainnet</span>.
    {:else if $ethNetwork?.chainId === 1337}
      <span>Local&nbsp;Network</span>.
    {:else}
      <span class="text-red-500 font-bold">{$ethNetwork?.name ?? 'unknown'} network</span>.
    {/if}
  </p>
  {#if $ethNetwork?.chainId === 0xa515 || $ethNetwork?.chainId === 0xa516 || $ethNetwork?.chainId === 1337}
    {#if $parcelIdentity === undefined}
      <button class="block mx-auto" on:click={connectToParcel}>Connect to Parcel</button>
    {:else}
      <!-- <p class="text-center">Acting as Parcel identity: {$parcelIdentity.id}</p> -->
      {#if $error}
        <span class="text-red-500">{$error}</span>
      {/if}
      <form on:submit|preventDefault={download}>
        NFT contract addr:&nbsp;
        <input
          size="42"
          type="text"
          placeholder="0x..."
          pattern={'^(0x)?[0-9a-fA-F]{40}$'}
          required
          bind:value={nftContractAddr}
          title="Eth address"
        /><br />
        NFT token ID:
        <input class="w-20" type="number" min="0" max="10000" required bind:value={nftTokenId} /><br
        />
        <input type="submit" value="Download" />
      </form>
    {/if}
  {:else}
    <p class="text-center">Please connect to the Emerald Testnet or Emerald Mainnet.</p>
  {/if}
{:else}
  <p class="text-center">
    Connecting to <a href="https://metamask.io/" rel="nofollow" target="_blank">MetaMask</a>...
  </p>
{/if}
