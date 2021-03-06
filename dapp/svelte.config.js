import adapter from '@sveltejs/adapter-static';
import preprocess from 'svelte-preprocess';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  // Consult https://github.com/sveltejs/svelte-preprocess
  // for more information about preprocessors
  preprocess: preprocess(),

  kit: {
    prerender: {
      default: true,
    },
    adapter: adapter(),
    vite: {
      optimizeDeps: {
        exclude: ['jsrsasign', 'node-fetch'],
      },
      ssr: false,
      build: {
        sourcemap: true,
        rollupOptions: {
          external: ['node-fetch'],
        },
      },
    },
  },
};

export default config;
