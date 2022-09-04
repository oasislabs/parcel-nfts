import { sveltekit } from '@sveltejs/kit/vite';

/** @type {import('vite').UserConfig} */
const config = {
  plugins: [sveltekit()],
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
};

export default config;
