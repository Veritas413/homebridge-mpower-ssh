import { MPowerSSHPlatform } from '../src/platform';

describe('Matter platform publishing', () => {
  test('registers electrical measurement and scales readings to Matter units', async () => {
    const registerPlatformAccessories = jest.fn().mockResolvedValue(undefined);
    const updateAccessoryState = jest.fn().mockResolvedValue(undefined);
    const api = {
      on: jest.fn(),
      hap: { uuid: { generate: jest.fn().mockReturnValue('uuid-1') } },
      matter: {
        deviceTypes: { OnOffLight: 'light', OnOffOutlet: 'outlet' },
        clusterNames: {
          OnOff: 'onOff',
          ElectricalPowerMeasurement: 'electricalPowerMeasurement',
        },
        registerPlatformAccessories,
        unregisterPlatformAccessories: jest.fn().mockResolvedValue(undefined),
        updateAccessoryState,
      },
    };
    const log = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
    const platform = new MPowerSSHPlatform(log as never, {
      platform: 'mPowerSSH',
      name: 'mPower SSH',
      transport: 'matter',
      strips: [{
        name: 'Strip', host: '192.168.1.50', username: 'admin', password: 'secret',
        devices: [{ relay: 1, name: 'Outlet', type: 'outlet' }],
      }],
    }, api as never);

    await (platform as unknown as { discoverDevices(): Promise<void> }).discoverDevices();

    const accessory = registerPlatformAccessories.mock.calls[0][2][0];
    expect(accessory.deviceType).toBe('outlet');
    expect(accessory.clusters.electricalPowerMeasurement).toEqual({
      activePower: null, voltage: null, activeCurrent: null,
    });

    const device = (platform as unknown as { devices: Array<{ measurementListeners: Map<number, Set<(value: unknown) => void>> }> })
      .devices[0];
    for (const listener of device.measurementListeners.get(1) ?? []) {
      listener({ activePower: 53.2, voltage: 121.4, current: 0.44, powerFactor: 0.98 });
    }
    await Promise.resolve();

    expect(updateAccessoryState).toHaveBeenCalledWith('uuid-1', 'electricalPowerMeasurement', {
      activePower: 53200,
      voltage: 121400,
      activeCurrent: 440,
    });
  });
});
