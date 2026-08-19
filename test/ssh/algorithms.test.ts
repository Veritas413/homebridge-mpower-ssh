/**
 * Tests for SSH Legacy Algorithm Configuration
 */

import { getLegacyMPowerAlgorithms } from '../../src/ssh/algorithms';

describe('SSH Algorithms - Legacy mPower Support', () => {
  test('should provide required kex algorithm', () => {
    const algs = getLegacyMPowerAlgorithms();
    expect(algs.kexAlgorithms).toContain('diffie-hellman-group1-sha1');
  });

  test('should provide required server host key algorithm', () => {
    const algs = getLegacyMPowerAlgorithms();
    expect(algs.serverHostKeyAlgorithms).toContain('ssh-rsa');
  });

  test('should provide required cipher', () => {
    const algs = getLegacyMPowerAlgorithms();
    expect(algs.ciphers).toContain('aes128-cbc');
  });

  test('should not be empty', () => {
    const algs = getLegacyMPowerAlgorithms();
    expect(algs.kexAlgorithms.length).toBeGreaterThan(0);
    expect(algs.serverHostKeyAlgorithms.length).toBeGreaterThan(0);
    expect(algs.ciphers.length).toBeGreaterThan(0);
  });
});
