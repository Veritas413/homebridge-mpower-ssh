/**
 * homebridge-mpower-ssh plugin entry point.
 */

import type { API } from 'homebridge';
import { MPowerSSHPlatform } from './platform';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings';

export default (api: API): void => {
  api.registerPlatform(PLUGIN_NAME, PLATFORM_NAME, MPowerSSHPlatform);
};

export { MPowerSSHPlatform, PLATFORM_NAME, PLUGIN_NAME };
