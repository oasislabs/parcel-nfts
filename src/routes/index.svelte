<script lang="ts" global>
	import { onMount } from 'svelte';

	import {
		account as ethAccount,
		init as connectEthProvider,
		network as ethNetwork
	} from '../eth-store';

	onMount(async () => {
		await connectEthProvider();
	});
</script>

<main class="w-4/5 max-w-xl mx-auto">
	<h1 class="font-bold text-center">Mint NFTs</h1>
	{#await Promise.all([$ethAccount, $ethNetwork])}
		<p class="text-center">
			Connecting to<br />
			<a href="https://metamask.io/" rel="nofollow" target="_blank">MetaMask</a>...
		</p>
	{:then [account, network]}
		<p class="text-center">
			Connected to
			<span class="font-mono">{`${account.substr(0, 7)}…${account.substr(-5, 5)}`}</span><br />
			on the
			{#if network?.chainId === 0xa515}
				<span>Emerald&nbsp;Testnet</span>.
			{:else if network?.chainId === 0xa516}
				<span>Emerald&nbsp;Mainnet</span>.
			{:else}
				<span class="text-red-500 font-bold">{network?.name ?? 'unknown'} network</span>.
			{/if}
		</p>
		{#if $ethNetwork?.chainId !== 0xa515 && $ethNetwork?.chainId !== 0xa516}
			<p class="text-center">Please connect to the Emerald Testnet or Emerald Mainnet.</p>
		{:else}
			<form action="javascript:void(0)" />
		{/if}
	{:catch error}
		<span>Could not connect to MetaMask: {error.toString()}</span>
	{/await}
</main>
