import type { WebpackPluginInstance } from 'webpack';

// TypeScript checking runs through `npm test`; packaging only needs transpilation.
export const plugins: WebpackPluginInstance[] = [];
