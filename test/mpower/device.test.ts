import { Logger } from '../../src/logger';
import { MPowerDevice, SSHTransport } from '../../src/mpower/device';

function makeClient(): jest.Mocked<SSHTransport> {
  return {
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
    getIsConnected: jest.fn().mockReturnValue(false),
    readFile: jest.fn().mockResolvedValue('1\n'),
    exec: jest.fn().mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 }),
  };
}

const logger = new Logger({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
});

describe('MPowerDevice', () => {
  test('connects, reads, caches, and publishes relay state', async () => {
    const client = makeClient();
    const device = new MPowerDevice('Strip', '192.168.1.50', [1], 10, logger, {
      host: '192.168.1.50', auth: { method: 'password', username: 'admin', password: 'secret' },
    }, client);
    const listener = jest.fn();
    device.onRelayState(1, listener);

    await expect(device.readRelay(1)).resolves.toBe(true);

    expect(client.connect).toHaveBeenCalledTimes(1);
    expect(client.readFile).toHaveBeenCalledWith('/proc/power/relay1');
    expect(device.getCachedRelayState(1)).toBe(true);
    expect(listener).toHaveBeenCalledWith(true);
  });

  test('writes relay state and rejects failed commands', async () => {
    const client = makeClient();
    client.getIsConnected.mockReturnValue(true);
    const device = new MPowerDevice('Strip', 'host', [2], 10, logger, {
      host: 'host', auth: { method: 'password', username: 'admin', password: 'secret' },
    }, client);

    await device.setRelay(2, true);
    expect(client.exec).toHaveBeenCalledWith('echo 1 > /proc/power/relay2');

    client.exec.mockResolvedValueOnce({ stdout: '', stderr: 'write failed', exitCode: 1 });
    await expect(device.setRelay(2, false)).rejects.toThrow('write failed');
  });

  test('polls and publishes per-relay electrical measurements', async () => {
    const client = makeClient();
    client.getIsConnected.mockReturnValue(true);
    client.exec.mockResolvedValue({
      stdout: 'relay=1\npower=53.2\nvoltage=121.4\ncurrent=0.44\npf=0.98',
      stderr: '',
      exitCode: 0,
    });
    const device = new MPowerDevice('Strip', 'host', [1], 10, logger, {
      host: 'host', auth: { method: 'password', username: 'admin', password: 'secret' },
    }, client);
    const listener = jest.fn();
    device.onMeasurements(1, listener);

    await device.poll();

    expect(listener).toHaveBeenCalledWith({
      activePower: 53.2,
      voltage: 121.4,
      current: 0.44,
      powerFactor: 0.98,
    });
  });

  test('attempts one connection per offline strip and backs off', async () => {
    const client = makeClient();
    client.connect.mockRejectedValue(new Error('host unreachable'));
    const device = new MPowerDevice('Offline Strip', 'host', [1, 2, 3], 10, logger, {
      host: 'host', auth: { method: 'password', username: 'admin', password: 'secret' },
    }, client);

    await device.poll();
    await device.poll();

    expect(client.connect).toHaveBeenCalledTimes(1);
    expect(client.exec).not.toHaveBeenCalled();
  });

  test('publishes offline and recovered availability once per change', async () => {
    const client = makeClient();
    client.connect.mockRejectedValueOnce(new Error('host unreachable')).mockResolvedValue(undefined);
    const device = new MPowerDevice('Strip', 'host', [], 0, logger, {
      host: 'host', auth: { method: 'password', username: 'admin', password: 'secret' },
    }, client);
    const listener = jest.fn();
    device.onAvailability(listener);

    await device.poll();
    await device.poll();
    await device.poll();

    expect(listener.mock.calls).toEqual([[false], [true]]);
  });
});
