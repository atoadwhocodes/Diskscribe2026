// @ts-check
'use strict';

const path = require('node:path');

/**
 * @param {import('webpack').Configuration} config
 * @returns {import('webpack').Configuration}
 */
function withMode(config) {
  if (process.env.NODE_ENV === 'production') {
    return { ...config, mode: 'production' };
  }
  return { ...config, mode: 'development' };
}

/** @type {import('webpack').Configuration} */
const baseConfig = {
  target: 'web',
  entry: './media-src/editor.ts',
  output: {
    path: path.resolve(__dirname, 'media'),
    filename: 'editor.js'
  },
  devtool: 'source-map',
  resolve: {
    extensions: ['.ts', '.tsx', '.js']
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: {
          loader: 'ts-loader',
          options: {
            configFile: path.resolve(__dirname, 'tsconfig.webview.json'),
            transpileOnly: true
          }
        },
        exclude: /node_modules/
      }
    ]
  }
};

module.exports = withMode(baseConfig);
