import type {
  API, DynamicPlatformPlugin, Logger as HomebridgeLogger, MatterAccessory, PlatformAccessory, PlatformConfig,
} from 'homebridge';
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
  readonly transport?: 'hap' | 'matter' | 'both';
  readonly strips?: StripConfig[];
}

export class MPowerSSHPlatform implements DynamicPlatformPlugin {
  private readonly accessories = new Map<string, PlatformAccessory>();
  private readonly matterAccessories = new Map<string, MatterAccessory>();
  private readonly devices: MPowerDevice[] = [];
  private readonly logger: Logger;

  constructor(log: HomebridgeLogger, private readonly config: MPowerPlatformConfig, private readonly api: API) {
    this.logger = new Logger(log);
    this.logger.info('Initializing mPowerSSH platform...');
    this.api.on('didFinishLaunching', () => void this.discoverDevices());
    this.api.on('shutdown', () => void Promise.all(this.devices.map((device) => device.stop())));
  }

  configureAccessory(accessory: PlatformAccessory): void {
    this.accessories.set(accessory.UUID, accessory);
    this.logger.info(`Restoring cached accessory: ${accessory.displayName}`);
  }

  configureMatterAccessory(accessory: MatterAccessory): void {
    this.matterAccessories.set(accessory.UUID, accessory);
    this.logger.info(`Restoring cached Matter accessory: ${accessory.displayName}`);
  }

  private async discoverDevices(): Promise<void> {
    const configuredUuids = new Set<string>();
    const configuredMatterUuids = new Set<string>();
    const matterToRegister: MatterAccessory[] = [];
    const matterToReplace: MatterAccessory[] = [];
    const pollInterval = Math.min(MAX_POLL_INTERVAL, Math.max(MIN_POLL_INTERVAL, this.config.pollInterval ?? 10));
    const transport = this.config.transport ?? 'hap';
    const publishHap = transport === 'hap' || transport === 'both';
    const publishMatter = transport === 'matter' || transport === 'both';
    const matter = this.api.matter;
    if (publishMatter && !matter) {
      this.logger.error('Matter transport requested, but Matter is not enabled for this bridge');
    }

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
        const displayName = `${name} ${outlet.name}`;
        if (publishHap) {
          configuredUuids.add(uuid);
          let accessory = this.accessories.get(uuid);
          if (!accessory) {
            accessory = new this.api.platformAccessory(displayName, uuid);
            this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
          }
          accessory.context.device = { host, relay: outlet.relay };
          accessory.context.type = outlet.type ?? 'outlet';
          accessory.displayName = displayName;
          new MPowerSSHAccessory(this.api, accessory, device, outlet);
          this.api.updatePlatformAccessories([accessory]);
        }

        if (publishMatter && matter) {
          configuredMatterUuids.add(uuid);
          const setMatterRelay = (state: boolean): Promise<void> => {
            if (outlet.allowControl === false) {
              device.logControlDenied(outlet.relay, state, 'Matter');
              throw new matter.status.PermissionDenied(`Control is disabled for ${outlet.name}`);
            }
            return device.setRelay(outlet.relay, state, 'Matter');
          };
          const matterAccessory: MatterAccessory = {
            UUID: uuid,
            displayName,
            deviceType: outlet.type === 'light' ? matter.deviceTypes.OnOffLight : matter.deviceTypes.OnOffOutlet,
            serialNumber: `${host}:${outlet.relay}`,
            manufacturer: 'Ubiquiti',
            model: 'mFi mPower',
            context: {
              host,
              relay: outlet.relay,
              type: outlet.type ?? 'outlet',
              allowControl: outlet.allowControl !== false,
            },
            clusters: {
              onOff: { onOff: false },
              electricalPowerMeasurement: { activePower: null, voltage: null, activeCurrent: null },
            },
            handlers: {
              onOff: {
                on: () => setMatterRelay(true),
                off: () => setMatterRelay(false),
                toggle: async () => setMatterRelay(
                  !(device.getCachedRelayState(outlet.relay) ?? await device.readRelay(outlet.relay)),
                ),
              },
            },
          };
          const restored = this.matterAccessories.get(uuid);
          const previousType = restored?.context?.type;
          if (restored && previousType && previousType !== (outlet.type ?? 'outlet')) {
            matterToReplace.push(restored);
            matterToRegister.push(matterAccessory);
          } else {
            if (restored) Object.assign(restored, matterAccessory);
            matterToRegister.push(restored ?? matterAccessory);
          }

          device.onRelayState(outlet.relay, (state) => {
            void matter.updateAccessoryState(uuid, matter.clusterNames.OnOff, { onOff: state });
          });
          device.onMeasurements(outlet.relay, (measurements) => {
            void matter.updateAccessoryState(uuid, matter.clusterNames.ElectricalPowerMeasurement, {
              activePower: measurements.activePower === undefined ? null : Math.round(measurements.activePower * 1000),
              voltage: measurements.voltage === undefined ? null : Math.round(measurements.voltage * 1000),
              activeCurrent: measurements.current === undefined ? null : Math.round(measurements.current * 1000),
            });
          });
          device.onAvailability((available) => {
            void matter.updateAccessoryState(uuid, matter.clusterNames.BridgedDeviceBasicInformation, {
              reachable: available,
            });
          });
        }
      }
      device.start();
    }

    const stale = [...this.accessories.values()].filter((accessory) => !configuredUuids.has(accessory.UUID));
    if (stale.length > 0) this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, stale);
    if (matter) {
      if (matterToReplace.length > 0) {
        await matter.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, matterToReplace);
      }
      if (matterToRegister.length > 0) {
        await matter.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, matterToRegister);
      }
      const staleMatter = [...this.matterAccessories.values()]
        .filter((accessory) => !configuredMatterUuids.has(accessory.UUID));
      if (staleMatter.length > 0) {
        await matter.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, staleMatter);
      }
    }
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
