import type { HexMode } from './mainProcessTypes';

export const HEX_SETTINGS = {
  pageBytes: 65536,
  maxCachedPages: 32,
  defaultMode: 'disk' as HexMode
};

export const DISK_IMAGE_FILTERS = [
  {
    name: 'Disk Images',
    extensions: ['hdi', 'nhd', 'd88', 'hdm', 'hdd', 'fdi', 'fdd', 'cue', 'iso']
  },
  {
    name: 'PC-98 Disk Images',
    extensions: ['hdi', 'nhd', 'd88', 'hdm', 'hdd', 'fdi', 'fdd']
  },
  {
    name: 'Sega CD / ISO Images',
    extensions: ['cue', 'iso']
  }
];

export const APP_BATCH_PLAN_VERSION = 1;
