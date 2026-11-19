import type { HexMode } from './mainProcessTypes';

export const HEX_SETTINGS = {
  pageBytes: 65536,
  maxCachedPages: 32,
  defaultMode: 'disk' as HexMode
};

export const DISK_IMAGE_FILTERS = [
  {
    name: 'Disk Images',
    extensions: ['hdi', 'nhd', 'd88', 'dsk', 'hdm', 'hdd', 'fdi', 'fdd', 'cue', 'iso', 'md', 'gen']
  },
  {
    name: 'PC-88 / PC-98 Disk Images',
    extensions: ['hdi', 'nhd', 'd88', 'dsk', 'hdm', 'hdd', 'fdi', 'fdd']
  },
  {
    name: 'Sega CD / ISO Images',
    extensions: ['cue', 'iso']
  },
  {
    name: 'Mega Drive / Genesis ROM Images',
    extensions: ['md', 'gen']
  }
];

export const APP_BATCH_PLAN_VERSION = 1;
