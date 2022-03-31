<script lang="ts">
  import { onMount } from 'svelte';

  import { error } from '../stores/error';

  import { address as ethAddress, network as ethNetwork } from '../stores/eth';

  import { identity as parcelIdentity, connect as connectToParcel } from '../stores/parcel';
</script>

<h1 class="font-bold text-center">Mint NFTs</h1>
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
          <span>Please select the following files:</span>
          <ul>
            <li>
              <span class="font-mono text-sm">manifest.json</span> - a JSON file describing the
              remaining inputs that has schema:
              <pre class="my-0 border-2 border-black border-solid">
type Manifest = NftDescriptor[]

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
{'}'}
            </pre>
            </li>
            <li>
              <pre class="inline">p</pre>
              -
            </li>
          </ul>
        </div>
        <pre>
&lt;nft_id&gt;_public.(png|jpg|...)
&lt;nft_id&gt;_private.(txt|png|mov|cpp|...)
        </pre>
      </div>
      <form action="javascript:void(0)" />
    {/if}
  {:else}
    <p class="text-center">Please connect to the Emerald Testnet or Emerald Mainnet.</p>
  {/if}
{:else}
  <p class="text-center">
    Connecting to <a href="https://metamask.io/" rel="nofollow" target="_blank">MetaMask</a>...
  </p>
{/if}
