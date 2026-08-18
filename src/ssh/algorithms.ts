/**
 * SSH Legacy Algorithm Configuration for Ubiquiti mFi mPower
 *
 * The Ubiquiti mFi mPower (especially firmware MF.v2.1.12) uses very old SSH
 * algorithms that are no longer supported by default in modern OpenSSH.
 *
 * These algorithms are considered cryptographically weak and should NOT be used
 * for general-purpose SSH. However, they are necessary for these legacy devices.
 *
 * Algorithms used:
 * - kex: diffie-hellman-group1-sha1 (1024-bit DH, SHA1)
 * - serverHostKey: ssh-rsa
 * - cipher: aes128-cbc
 *
 * This is documented explicitly so users understand the security implications.
 * The mPower has no option for stronger algorithms - it's a hardware limitation.
 */

import { SSHConnectionOptions } from './types';

/**
 * Returns SSH algorithm configuration for legacy mFi mPower devices.
 *
 * These algorithms are required for compatibility with obsolete hardware.
 * They are deliberately non-standard and provide weak cryptographic guarantees.
 */
export function getLegacyMPowerAlgorithms(): SSHConnectionOptions {
  return {
    // Key exchange - diffie-hellman-group1-sha1 is vulnerable to known attacks
    // but is the only option supported by these devices
    kexAlgorithms: [
      'diffie-hellman-group1-sha1'
    ],

    // Server host key algorithms - ssh-rsa is deprecated in modern OpenSSH
    // but required for mPower compatibility
    serverHostKeyAlgorithms: [
      'ssh-rsa'
    ],

    // Cipher - aes128-cbc is vulnerable to padding oracle attacks
    // but is required for mPower compatibility
    ciphers: [
      'aes128-cbc'
    ]
  };
}

/**
 * Security warning message for users configuring ssh2 algorithms.
 */
export const LEGACY_ALGORITHM_WARNING = `
⚠️  WARNING: Legacy SSH Algorithms
This plugin uses cryptographically weak SSH algorithms to communicate with
Ubiquiti mFi mPower devices. These algorithms are:
- Vulnerable to known attacks
- Deprecated by modern SSH standards
- Only necessary for compatibility with obsolete hardware

The mPower has NO option for stronger algorithms. This is a hardware limitation.

MITIGATION:
- Only use this plugin on trusted, isolated home networks
- Do NOT expose mPower devices to the internet
- Consider the mPower SSH port as a trusted-network-only service
- The Homebridge system account should have restricted privileges

For more information, see README.md security notes.
`;
