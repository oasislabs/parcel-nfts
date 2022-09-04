<script lang="ts">
  import { get } from 'svelte/store';

  import { Appendle, ValidationErrors } from '@oasislabs/parcel-nfts';

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

  let nftAddr = '';
  let cost = 0;
  let files: FileList;
  let appendle: Appendle | undefined = undefined;
  let validationErrors: string[] = [];
  let appendError: Error | undefined;
  let creatingAppendle = false;
  let appending = false;
  let finished = false;

  function setAttributeWebkitdirectory(node: HTMLInputElement) {
    node.setAttribute('webkitdirectory', '');
  }

  async function makeAppendle() {
    validationErrors = [];
    try {
      const signer = get(ethProvider)?.getSigner();
      if (!nftAddr || !signer) return;
      creatingAppendle = true;
      appendle = await Appendle.create(signer, nftAddr, files);
      cost = await appendle.calculateCost();
    } catch (e: any) {
      if (e instanceof ValidationErrors) {
        validationErrors = e.validationErrors;
        return;
      }
      console.error(e);
      if (e instanceof Error) {
        new ValidationErrors([e.message]);
      }
      throw new ValidationErrors(['an unknown error occured']);
    }
    creatingAppendle = false;
  }

  async function payFee() {
    const signer = get(ethProvider)?.getSigner();
    if (!appendle || !signer) return;
    await appendle.requestPayment(signer);
  }

  async function appendFiles() {
    const parcel = get(parcelStore);
    const signer = get(ethProvider)?.getSigner();
    if (!appendle || !parcel || !signer) return;
    appendError = undefined;
    try {
      appending = true;
      await appendle.append(parcel);
    } catch (e: any) {
      appendError = e;
      console.error(e);
    }
    appending = false;
  }
</script>

<h1 class="font-bold text-center text-xl">Add private files to your NFT</h1>
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
      <p class="text-center">Acting as Parcel identity: {$parcelIdentity?.id ?? 'none'}</p>
      <hr />
      <form class="flex flex-col items-center max-w-xl mx-auto mt-8" on:submit|preventDefault>
        <fieldset>
          <legend>NFT Address</legend>
          <p>The address of the NFT that will have private data added to it.</p>
          <input
            bind:value={nftAddr}
            on:input={() => console.log(nftAddr)}
            placeholder="0x..."
            pattern="0x[A-Fa-f0-9]+"
            class="block my-2"
            required
          />
        </fieldset>
        <fieldset class="my-8">
          <legend>Private Files</legend>
          <p>
            Upload a folder containing folders named <span class="font-mono">tokenId</span>
            containing the files that should be added to the item with ID
            <span class="font-mono">tokenId</span>.
          </p>
          <p>
            A file will not be added to the token if it already contains a file with the same name,
            so make sure you use new names each time you append to a particular <span
              class="font-mono">tokenId</span
            >.
          </p>
          <p>
            For example, if you wanted to add confidential files to items 10, and 42, you&apos;d
            create a folder containing the folders <span class="font-mono">10</span> and
            <span class="font-mono">42</span>, drop whatever files into each of those folders, and
            then upload the containing folder.
          </p>
          <p>
            You will be charged 3 ROSE per file and 50 ROSE per GiB of data. Payment will be
            required upfront, but if the upload fails, you can resubmit the form without paying.
            <br />
            If you encounter a problem with payment, please reach out to get your ROSE back.
          </p>
          <input
            bind:files
            class="block my-2"
            type="file"
            use:setAttributeWebkitdirectory
            required
          />
        </fieldset>
        <p>
          If you make a whoopsie, you can refresh this page to start again. You won&apos;t need to
          pay for files you&apos;ve already paid for, not to worry.
        </p>
        {#if !appendle}
          {#if validationErrors.length > 0}
            <ul class="my-8">
              {#each validationErrors as ve}
                <li class="text-red-500">{ve}</li>
              {/each}
            </ul>
          {/if}
          <button
            disabled={files === undefined || !nftAddr.startsWith('0x') || creatingAppendle}
            on:click={makeAppendle}
          >
            Begin upload
          </button>
        {:else if cost && !appendle.paid}
          <button on:click={payFee}>
            Pay {cost} ROSE
          </button>
        {:else if appendError}
          <button disabled={appending} on:click={appendFiles}> Try again (free) </button>
        {:else if !finished}
          <button disabled={appending} on:click={appendFiles}> Add files! </button>
        {:else}
          <h1 class="text-green-700">Success</h1>
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
