/**
 * The `lint` script has existed since the first commit but there was no config
 * file, so `npm run lint` always failed with "couldn't find a configuration
 * file" rather than linting anything.
 */
module.exports = {
  root: true,
  env: { browser: true, es2021: true },
  // Without this, `npm run lint` walked into the production build and reported
  // 114 errors from minified vendor bundles, so the script never once reached
  // `--max-warnings 0` on the code it was meant to check.
  ignorePatterns: ['dist', 'node_modules', 'coverage'],
  overrides: [
    {
      // Config files run in Node, not the browser.
      files: ['vite.config.js', 'tailwind.config.js', 'postcss.config.js', '.eslintrc.cjs'],
      env: { node: true, browser: false },
    },
  ],
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:react/jsx-runtime',
    'plugin:react-hooks/recommended',
  ],
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  settings: { react: { version: 'detect' } },
  plugins: ['react-refresh'],
  rules: {
    'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    // Props are documented in each component's JSDoc; prop-types would be noise.
    'react/prop-types': 'off',
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
  },
};
