/**
 * Plugin Settings and Constants
 */

export const PLATFORM_NAME = 'mPowerSSH';
export const PLUGIN_NAME = 'homebridge-mpower-ssh';

// Default timeouts (milliseconds)
export const DEFAULT_SSH_READY_TIMEOUT = 20000;
export const DEFAULT_SSH_COMMAND_TIMEOUT = 5000;
export const DEFAULT_POLL_INTERVAL = 10;
export const MIN_POLL_INTERVAL = 5;
export const MAX_POLL_INTERVAL = 300;

// Reconnection settings
export const MAX_RECONNECT_ATTEMPTS = 5;
export const RECONNECT_DELAY_MS = 2000;

// mPower device paths
export const MPOWER_RELAY_PATH_TEMPLATE = '/proc/power/relay{N}';
export const MPOWER_POWER_PATH_TEMPLATE = '/proc/power/active_pwr{N}';
export const MPOWER_VOLTAGE_PATH_TEMPLATE = '/proc/power/v_rms{N}';
export const MPOWER_CURRENT_PATH_TEMPLATE = '/proc/power/i_rms{N}';
export const MPOWER_PF_PATH_TEMPLATE = '/proc/power/pf{N}';

// Common mPower relay counts
export const COMMON_MPOWER_RELAY_COUNTS = [1, 3, 6];
