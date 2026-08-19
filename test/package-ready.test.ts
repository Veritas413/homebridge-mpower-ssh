describe('package readiness for local Homebridge install', () => {
  it('publishes as a real plugin package instead of a private workspace project', () => {
    const pkg = require('../package.json');
    expect(pkg.private).toBe(false);
    expect(pkg.name).toBe('homebridge-mpower-ssh');
  });

  it('exports a Homebridge plugin entry function', () => {
    const plugin = require('../src/index');
    const exported = plugin.default ?? plugin;
    expect(typeof exported).toBe('function');
  });

  it('accepts nested strip configs and registers each outlet accessory', () => {
    const registerPlatformAccessories = jest.fn();
    const makeService = (): Record<string, jest.Mock> => ({
      setCharacteristic: jest.fn().mockReturnThis(),
      updateCharacteristic: jest.fn().mockReturnThis(),
      getCharacteristic: jest.fn().mockReturnValue({
        onGet: jest.fn().mockReturnThis(),
        onSet: jest.fn().mockReturnThis(),
      }),
    });

    const api = {
      on: jest.fn(),
      hap: {
        Service: {
          AccessoryInformation: 'AccessoryInformation',
          Outlet: 'Outlet',
          Lightbulb: 'Lightbulb',
        },
        Characteristic: {
          Manufacturer: 'Manufacturer',
          Model: 'Model',
          SerialNumber: 'SerialNumber',
          Name: 'Name',
          On: 'On',
        },
        uuid: {
          generate: jest.fn().mockReturnValue('uuid-123'),
        },
      },
      platformAccessory: jest.fn().mockImplementation((displayName: string, uuid: string) => ({
        displayName,
        UUID: uuid,
        context: {},
        getService: jest.fn().mockReturnValue(makeService()),
        getServiceById: jest.fn().mockReturnValue(makeService()),
        addService: jest.fn().mockReturnValue(makeService()),
        removeService: jest.fn(),
        on: jest.fn(),
      })),
      registerPlatformAccessories,
      unregisterPlatformAccessories: jest.fn(),
      updatePlatformAccessories: jest.fn(),
    };

    const log = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    const platform = new (require('../src/platform').MPowerSSHPlatform)(log, {
      strips: [
        {
          name: 'Garage Strip',
          host: '192.168.1.50',
          username: 'admin',
          password: 'secret',
          devices: [
            { relay: 1, name: 'Outlet 1' },
            { relay: 2, name: 'Outlet 2' },
          ],
        },
      ],
    }, api);

    (platform as unknown as { discoverDevices(): Promise<void> }).discoverDevices();

    expect(registerPlatformAccessories).toHaveBeenCalledTimes(2);
    expect(api.hap.uuid.generate).toHaveBeenCalledWith('192.168.1.50:1');
    expect(api.hap.uuid.generate).toHaveBeenCalledWith('192.168.1.50:2');
  });
});
