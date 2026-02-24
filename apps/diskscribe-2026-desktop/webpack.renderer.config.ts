import type { Configuration } from 'webpack';

import { rules } from './webpack.rules';
import { plugins } from './webpack.plugins';

const rendererRules = rules.filter((rule) => {
  if (!rule || typeof rule !== 'object') {
    return true;
  }

  const candidate = rule as { use?: unknown };
  if (candidate.use === 'node-loader') {
    return false;
  }

  if (
    candidate.use &&
    typeof candidate.use === 'object' &&
    'loader' in (candidate.use as Record<string, unknown>) &&
    (candidate.use as { loader?: unknown }).loader === '@vercel/webpack-asset-relocator-loader'
  ) {
    return false;
  }

  return true;
});

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
