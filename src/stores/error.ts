import type { Writable } from 'svelte/store';
import { writable } from 'svelte/store';

export const error: Writable<string> = writable();
