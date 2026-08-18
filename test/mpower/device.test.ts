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
});
