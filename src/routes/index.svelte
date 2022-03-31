<script lang="ts">
  import { onMount } from 'svelte';

  import { error } from '../stores/error';

  import { address as ethAddress, network as ethNetwork } from '../stores/eth';

  import { identity as parcelIdentity, connect as connectToParcel } from '../stores/parcel';

  function processUploadBundle(e: Event) {
    console.log(e);
  }
</script>

<h1 class="font-bold text-center text-xl">Mint NFTs</h1>
{#if $error}
  <span class="text-red-500">{$error}</span>
{/if}
{#if $ethAddress && $ethNetwork}
  <p class="text-center">
    Connected to
    <span class="font-mono">{`${$ethAddress.substr(0, 7)}…${$ethAddress.substr(-5, 5)}`}</span><br
    />
    on the
    {#if $ethNetwork?.chainId === 0xa515}
      <span>Emerald&nbsp;Testnet</span>.
    {:else if $ethNetwork?.chainId === 0xa516}
      <span>Emerald&nbsp;Mainnet</span>.
    {:else}
      <span class="text-red-500 font-bold">{$ethNetwork?.name ?? 'unknown'} network</span>.
    {/if}
  </p>
  {#if $ethNetwork?.chainId === 0xa515 || $ethNetwork?.chainId === 0xa516}
    {#if $parcelIdentity === undefined}
      <button class="block mx-auto" on:click={connectToParcel}>Connect to Parcel</button>
    {:else}
      <p class="text-center">Acting as Parcel identity: {$parcelIdentity.id}</p>
      <hr />
      <div>
        <div>
          <span>Please provide the following files:</span>
          <ul>
            <li>
              <span class="font-mono text-sm">manifest.json</span> - a JSON file describing the
              remaining inputs that has schema:
              <pre
                class="my-2 border-0 border-l-4 border-gray-400 border-solid px-2 py-0">type Manifest = NftDescriptor[]

type NftDescriptor {'{'}
  // The optional title of the NFT.
  title?: string;

  // The optional description of the NFT.
  description?: string;

  // The name of the public (image) file.
  // Must be uploaded alongside the manifest.
  publicImage: string

  // The name of the private (data) file.
  // Must be uploaded alongside the manifest.
  privateData: string
{'}'}</pre>
            </li>
            <li>all of the public images listed in the manifest</li>
            <li>all of the private data listed in the manifest</li>
          </ul>
        </div>
      </div>
      <form on:submit|preventDefault={processUploadBundle}>
        <input class="block my-2" type="file" multiple required />
        <input class="block my-2" type="submit" value="Upload" />
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
