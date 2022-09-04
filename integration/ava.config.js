const config = {
  files: ['test/**/*.spec.ts'],
  extensions: {
    ts: 'module',
  },
  nodeArguments: ['--loader=ts-node/esm'],
};

export default config;
