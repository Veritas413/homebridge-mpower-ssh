import type { API, CharacteristicValue, PlatformAccessory } from 'homebridge';
import type { MPowerDevice } from './mpower/device';

export interface OutletConfig {
  readonly relay: number;
  readonly name: string;
  readonly type?: 'outlet' | 'light';
  readonly allowControl?: boolean;
}

export class MPowerSSHAccessory {
  constructor(
    api: API,
    accessory: PlatformAccessory,
    device: MPowerDevice,
    outlet: OutletConfig,
  ) {
    const { Characteristic, Service } = api.hap;
    const infoService = accessory.getService(Service.AccessoryInformation) ??
      accessory.addService(Service.AccessoryInformation);
    infoService
      .setCharacteristic(Characteristic.Manufacturer, 'Ubiquiti')
      .setCharacteristic(Characteristic.Model, 'mFi mPower')
      .setCharacteristic(Characteristic.SerialNumber, `${device.host}:${outlet.relay}`);

    const serviceType = outlet.type === 'light' ? Service.Lightbulb : Service.Outlet;
    const obsoleteServiceType = outlet.type === 'light' ? Service.Outlet : Service.Lightbulb;
    const obsoleteService = accessory.getServiceById(obsoleteServiceType, `relay-${outlet.relay}`);
    if (obsoleteService) accessory.removeService(obsoleteService);
    const service = accessory.getServiceById(serviceType, `relay-${outlet.relay}`) ??
      accessory.addService(serviceType, outlet.name, `relay-${outlet.relay}`);
    service.setCharacteristic(Characteristic.Name, outlet.name);
    service.setCharacteristic(Characteristic.ConfiguredName, outlet.name);
    service.getCharacteristic(Characteristic.On)
      .onGet((): CharacteristicValue => device.getCachedRelayState(outlet.relay) ?? false)
      .onSet(async (value: CharacteristicValue): Promise<void> => {
        if (outlet.allowControl === false) {
          throw new Error(`Control is disabled for ${outlet.name}`);
        }
        await device.setRelay(outlet.relay, Boolean(value));
      });

    device.onRelayState(outlet.relay, (state) => {
      service.updateCharacteristic(Characteristic.On, state);
    });
  }
}
