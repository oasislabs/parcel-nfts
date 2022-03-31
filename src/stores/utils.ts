import type { Readable, Writable } from 'svelte/store';

export function unwritable<T>(store: Writable<T>): Readable<T> {
	return {
		subscribe: store.subscribe
	};
}
