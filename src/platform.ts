import type { API, DynamicPlatformPlugin, Logger as HomebridgeLogger, PlatformAccessory, PlatformConfig } from 'homebridge';
import { Logger } from './logger';
import { MPowerDevice } from './mpower/device';
import { MPowerSSHAccessory, OutletConfig } from './platformAccessory';
import { MAX_POLL_INTERVAL, MIN_POLL_INTERVAL, PLATFORM_NAME, PLUGIN_NAME } from './settings';
import type { AuthConfig } from './ssh/types';

export interface StripConfig {
  readonly name?: string;
  readonly host?: string;
  readonly username?: string;
  readonly password?: string;
  readonly keyPath?: string;
  readonly passphrase?: string;
  readonly port?: number;
  readonly devices?: OutletConfig[];
}

export interface MPowerPlatformConfig extends PlatformConfig {
  readonly pollInterval?: number;
  readonly strips?: StripConfig[];
}

export class MPowerSSHPlatform implements DynamicPlatformPlugin {
  private readonly accessories = new Map<string, PlatformAccessory>();
  private readonly devices: MPowerDevice[] = [];
  private readonly logger: Logger;

  constructor(log: HomebridgeLogger, private readonly config: MPowerPlatformConfig, private readonly api: API) {
    this.logger = new Logger(log);
    this.logger.info('Initializing mPowerSSH platform...');
    this.api.on('didFinishLaunching', () => this.discoverDevices());
    this.api.on('shutdown', () => void Promise.all(this.devices.map((device) => device.stop())));
  }

  configureAccessory(accessory: PlatformAccessory): void {
    this.accessories.set(accessory.UUID, accessory);
    this.logger.info(`Restoring cached accessory: ${accessory.displayName}`);
  }

  private discoverDevices(): void {
    const configuredUuids = new Set<string>();
    const pollInterval = Math.min(MAX_POLL_INTERVAL, Math.max(MIN_POLL_INTERVAL, this.config.pollInterval ?? 10));

    for (const strip of this.config.strips ?? []) {
      const validated = this.validateStrip(strip);
      if (!validated) continue;
      const { host, name, outlets, auth, port } = validated;
      const device = new MPowerDevice(name, host, outlets.map(({ relay }) => relay), pollInterval, this.logger, {
        host, port, auth,
      });
      this.devices.push(device);

      for (const outlet of outlets) {
        const uuid = this.api.hap.uuid.generate(`${host}:${outlet.relay}`);
        configuredUuids.add(uuid);
        let accessory = this.accessories.get(uuid);
        if (!accessory) {
          accessory = new this.api.platformAccessory(`${name} ${outlet.name}`, uuid);
          this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
        }
        accessory.context.device = { host, relay: outlet.relay };
        accessory.displayName = `${name} ${outlet.name}`;
        new MPowerSSHAccessory(this.api, accessory, device, outlet);
      }
      device.start();
    }

    const stale = [...this.accessories.values()].filter((accessory) => !configuredUuids.has(accessory.UUID));
    if (stale.length > 0) this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, stale);
  }

  private validateStrip(strip: StripConfig): {
    host: string; name: string; port?: number; auth: AuthConfig; outlets: OutletConfig[];
  } | undefined {
    if (!strip.host || !strip.username) {
      this.logger.error('Skipping mPower strip: host and username are required');
      return undefined;
    }
    if (!strip.password && !strip.keyPath) {
      this.logger.error(`Skipping ${strip.name ?? strip.host}: password or keyPath is required`);
      return undefined;
    }
    const outlets = strip.devices ?? [];
    const relays = new Set<number>();
    for (const outlet of outlets) {
      if (!Number.isInteger(outlet.relay) || outlet.relay < 1 || !outlet.name || relays.has(outlet.relay)) {
        this.logger.error(`Skipping ${strip.name ?? strip.host}: outlet relays must be unique positive integers with names`);
        return undefined;
      }
      relays.add(outlet.relay);
    }
    if (outlets.length === 0) {
      this.logger.warn(`Skipping ${strip.name ?? strip.host}: no outlets configured`);
      return undefined;
    }
    const auth: AuthConfig = strip.keyPath
      ? { method: 'privateKey', username: strip.username, keyPath: strip.keyPath, passphrase: strip.passphrase }
      : { method: 'password', username: strip.username, password: strip.password! };
    return { host: strip.host, name: strip.name ?? strip.host, port: strip.port, auth, outlets };
  }
}
