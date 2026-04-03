import type { Configuration } from 'webpack';

import { rules } from './webpack.rules';
import { plugins } from './webpack.plugins';

const excludedLoaders = new Set([
  'node-loader',
  '@vercel/webpack-asset-relocator-loader',
]);

const isExcludedLoaderEntry = (entry: unknown): boolean => {
  if (typeof entry === 'string') {
    return excludedLoaders.has(entry);
  }

  if (!entry || typeof entry !== 'object') {
    return false;
  }

  return excludedLoaders.has((entry as { loader?: unknown }).loader as string);
};

const hasExcludedLoader = (rule: unknown): boolean => {
  if (!rule || typeof rule !== 'object') {
    return false;
  }

  const candidate = rule as {
    loader?: unknown;
    use?: unknown;
    oneOf?: unknown;
  };

  if (isExcludedLoaderEntry(candidate.loader)) {
    return true;
  }

  if (Array.isArray(candidate.use)) {
    if (candidate.use.some((entry) => isExcludedLoaderEntry(entry))) {
      return true;
    }
  } else if (isExcludedLoaderEntry(candidate.use)) {
    return true;
  }

  if (Array.isArray(candidate.oneOf)) {
    return candidate.oneOf.some((nestedRule) => hasExcludedLoader(nestedRule));
  }

  return false;
};

const rendererRules = rules.filter((rule) => !hasExcludedLoader(rule));

rendererRules.push({
  test: /\.css$/,
  use: [{ loader: 'style-loader' }, { loader: 'css-loader' }],
});

export const rendererConfig: Configuration = {
  module: {
    rules: rendererRules,
  },
  plugins,
  resolve: {
    extensions: ['.js', '.ts', '.jsx', '.tsx', '.css'],
  },
};
