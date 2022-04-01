import adapter from '@sveltejs/adapter-static';
import preprocess from 'svelte-preprocess';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  // Consult https://github.com/sveltejs/svelte-preprocess
  // for more information about preprocessors
  preprocess: preprocess(),

  kit: {
    adapter: adapter(),
    vite: {
      optimizeDeps: {
        exclude: ['jsrsasign', 'node-fetch'],
      },
      server: {
        fs: {
          allow: ['./emerald/lib'],
        },
      },
    },
  },
};

export default config;
