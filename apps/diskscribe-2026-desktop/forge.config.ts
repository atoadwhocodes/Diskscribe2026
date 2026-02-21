import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives';
import { WebpackPlugin } from '@electron-forge/plugin-webpack';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';

import { mainConfig } from './webpack.main.config';
import { rendererConfig } from './webpack.renderer.config';
import { APP_DESKTOP_NAME, APP_SLUG, APP_VENDOR } from './src/appMeta';

const APP_NAME_FOR_WINDOWS = APP_DESKTOP_NAME.replace(/\s+/g, '');
const APP_SQUIRREL_NAME = APP_SLUG.replace(/[^a-zA-Z0-9]/g, '');

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    executableName: APP_NAME_FOR_WINDOWS,
    appCopyright: `Copyright (c) ${new Date().getFullYear()} ${APP_VENDOR}`,
    win32metadata: {
      CompanyName: APP_VENDOR,
      FileDescription: APP_DESKTOP_NAME,
      InternalName: APP_NAME_FOR_WINDOWS,
      OriginalFilename: `${APP_NAME_FOR_WINDOWS}.exe`,
      ProductName: APP_DESKTOP_NAME
    }
  },
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({
      name: APP_SQUIRREL_NAME,
      setupExe: `${APP_NAME_FOR_WINDOWS}Setup.exe`
    }),
    new MakerZIP({}, ['darwin']),
    new MakerRpm({}),
    new MakerDeb({}),
  ],
  plugins: [
    new AutoUnpackNativesPlugin({}),
    new WebpackPlugin({
      mainConfig,
      renderer: {
        config: rendererConfig,
        entryPoints: [
          {
            html: './src/index.html',
            js: './src/renderer.ts',
            name: 'main_window',
            preload: {
              js: './src/preload.ts',
            },
          },
        ],
      },
    }),
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
