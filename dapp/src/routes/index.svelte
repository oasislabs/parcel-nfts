<script lang="ts">
  import { get } from 'svelte/store';

  import { NFTStorage } from 'nft.storage';

  import { Bundle, ValidationErrors } from '@oasislabs/parcel-nfts';

  import { error } from '../stores/error';
  import {
    provider as ethProvider,
    address as ethAddress,
    network as ethNetwork,
  } from '../stores/eth';
  import {
    parcel as parcelStore,
    identity as parcelIdentity,
    connect as connectToParcel,
  } from '../stores/parcel';

const MANIFEST_TYPE_DOCS = `interface Manifest {
  /** The title of the NFT collection. */
  title: string;

  /** The ticker symbol of the NFT collection. */
  symbol: string;

  /** The initial base URI of the collection. The default is none. */
  initialBaseUri?: string;

  /**
   * Configuration of mint-time parameters.
   * If empty, public minting will be disabled and all tokens will be minted upfront to the creator.
   *
   * This DApp will add a 5% minting fee.
   */
  minting?: MintingOptions;

  /**
   * The percent of the secondary sale price to be paid to the creator (you) as royalty.
   * A creator royalty of 2-8% is common in practice (all sale fees generally amount to under 10%).
   *
   * When public minting (and its fee) is disabled, a royalty of 2.5% will be added instead.
   */
  creatorRoyalty: number;

  /** Whether to allow duplicate public images and/or private data. The default is 'no'.*/
  allowDuplicates?: 'no' | 'public' | 'private' | 'yes';

  /** Configuration of each item in the collection. */
  nfts: NftDescriptor[];
}

interface MintingOptions {
  /** The amount of items a member of the premint list can mint. */
  maxPremintCount: number;

  /** The amount of ROSE paid for one token by premint-listed accounts. */
  premintPrice: number;

  /** The maximum number of tokens mintable by an individual account. */
  maxMintCount: number;

  /** The quantity of ROSE paid for one token by the general public. */
  mintPrice: number;
}

interface NftDescriptor {
  /** The title of the individual item. */
  title?: string;

  /** The description of the individual item. */
  description?: string;

  /** The name of the selected file that will be the item's public image. */
  publicImage: string;

  /** The name of the selected file that will be the item's private data. */
  privateData: string;

  /** Attribute data dumped directly into the NFT metadata JSON. */
  attributes: object[];

  /** If set, the NFT will be airdropped into this wallet. No takebacks! */
  owner?: string;
}`

  let files: FileList;
  let bundle: Bundle | undefined = undefined;
  let validationErrors: string[] = [];
  let mintError: Error | undefined;
  let minting = false;

  let tokenAddress: string | undefined;
  let tokenBaseUri: string | undefined;

  async function processUploadBundle() {
    validationErrors = [];
    try {
      bundle = await Bundle.create(files);
    } catch (e: any) {
      if (e instanceof ValidationErrors) {
        validationErrors = e.validationErrors;
        return;
      }
      console.error(e);
      if (e instanceof Error) {
        throw new ValidationErrors([e.message]);
      }
      throw new ValidationErrors(['an unknown error occured']);
    }
  }

  async function mintNfts() {
    const parcel = get(parcelStore);
    const signer = get(ethProvider)?.getSigner();
    const nftStorage = new NFTStorage({
      token:
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkaWQ6ZXRocjoweDM5NDAxMWUwNUI1ODU5RmFlNDIxQTk1ZjI3ODdFMDg4Nzg5OGJGNEUiLCJpc3MiOiJuZnQtc3RvcmFnZSIsImlhdCI6MTYzNTIyNzM1MjcyNSwibmFtZSI6InRlc3QifQ.xY5yiRm0aw5wWeRK3dMHWDTV6T0C55fSdEH9nJUOxN0',
    });
    if (!bundle || !parcel || !signer) return;
    mintError = undefined;
    try {
      minting = true;
      const { address, baseUri } = await bundle.mint(
        parcel,
        signer,
        nftStorage.storeDirectory.bind(nftStorage),
      );
      tokenAddress = address;
      tokenBaseUri = baseUri;
    } catch (e: any) {
      mintError = e;
    }
    minting = false;
  }
</script>

<h1 class="font-bold text-center text-xl">Mint NFTs</h1>
{#if $error}
  <span class="text-red-500">{$error}</span>
{/if}
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
      <p class="text-center">Acting as Parcel identity: {$parcelIdentity.id}</p>
      <hr />
      <div>
        <div>
          <span>Please provide the following files:</span>
          <ul>
            <li>
              <span class="font-mono text-sm">manifest.json</span> - a JSON file describing the
              remaining inputs that has schema:
              <pre class="my-2 border-0 border-l-4 border-gray-400 border-solid px-2 py-0"><code
                  >{MANIFEST_TYPE_DOCS}</code
                ></pre>
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
          <br />
        {/if}
        <input
          class="mt-2"
          type="submit"
          value={mintError ? 'Try Again' : 'Do it!'}
          disabled={bundle === undefined || tokenAddress !== undefined || minting}
        />
        {#if mintError}
          <p class="text-red-500">Unable to mint: {mintError.message}.</p>
          .
        {/if}
        {#if tokenAddress}
          <p class="text-green-700">
            Congratulations, your token has been minted. Here&apos;re the deets:
          </p>
          <ul>
            <li>token address: <span class="font-mono">{tokenAddress}</span></li>
            <li>
              token metadata base uri:<br />
              <a class="font-mono" href={tokenBaseUri}>{tokenBaseUri}</a>
            </li>
          </ul>
          <p>
            Now, go ask MetaMirror to list it on their gallery.
            <br />
            If you're doing a blind box launch, call the contract's
            <span class="font-mono">setFinalBaseURI</span> with the base uri above.
          </p>
          <p class="text-green-700">Thank you for making a simple DApp very happy.</p>
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
