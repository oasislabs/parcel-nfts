<script lang="ts">
  import { Bundle, ValidationErrors } from '../lib/bundle';
  import { error } from '../stores/error';
  import { address as ethAddress, network as ethNetwork } from '../stores/eth';
  import { identity as parcelIdentity, connect as connectToParcel } from '../stores/parcel';

  let files: FileList;
  let bundle: Bundle | undefined = undefined;
  let validationErrors: string[] = [];
  let mintError: Error | undefined;

  async function processUploadBundle() {
    validationErrors = [];
    try {
      bundle = await Bundle.create(files);
    } catch (e) {
      if (e instanceof ValidationErrors) {
        validationErrors = e.validationErrors;
        return;
      } else {
        console.error(e);
        throw new ValidationErrors([e.toString()]);
      }
    }
  }

  async function mintNfts() {
    await bundle.mint();
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
                class="my-2 border-0 border-l-4 border-gray-400 border-solid px-2 py-0">type Manifest = {'{'}
  // The collection title.
  title: string;

  // The collection symbol.
  symbol: string;

  // A description of the contents of the collection.
  nfts: NftDescriptor[];
{'}'}

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

  // Attribute data passed directly into the NFT metadata.
  // @see <a href="https://docs.opensea.io/docs/metadata-standards"
                  >https://docs.opensea.io/docs/metadata-standards</a
                >
  attributes: JSON[]
{'}'}</pre>
            </li>
            <li>all of the public images listed in the manifest</li>
            <li>all of the private data listed in the manifest</li>
          </ul>
        </div>
      </div>
      <form on:submit|preventDefault={mintNfts}>
        <input
          bind:files
          on:change={processUploadBundle}
          class="block my-2"
          type="file"
          multiple
          required
        />
        {#if validationErrors.length > 0}
          <ul>
            {#each validationErrors as ve}
              <li class="text-red-500">{ve}</li>
            {/each}
          </ul>
        {/if}
        {#if bundle}
          <span class="text-green-700">Ready to create {bundle.manifest.nfts.length} tokens.</span>
          <br/>
          <input class="mt-2" type="submit" value="Do it!" />
          {#if mintError}
            <span class="text-red-500 font-bold">Unable to mint: {mintError.toString()}.</span>.
          {/if}
        {/if}
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
