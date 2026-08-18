#!/usr/bin/env node

/**
 * mPower Device Probe Utility
 *
 * CLI tool to interrogate a real mPower device and discover:
 * - Available /proc/power/* files
 * - Relay state
 * - Power metrics (if available)
 * - Device capabilities
 *
 * Usage:
 *   npm run probe -- --host 192.168.1.107 --username Veritas413
 *
 * For password, use:
 *   - Interactive prompt (secure)
 *   - Environment variable: MPOWER_PASSWORD=... npm run probe -- ...
 *
 * For key-based auth:
 *   npm run probe -- --host 192.168.1.107 --username Veritas413 \
 *     --auth-method privateKey --key-path /path/to/key
 */

import * as readline from 'readline';
import { SSHClient } from './ssh/client';
import { Logger, LoggerInstance } from './logger';
import { parseRelayState } from './mpower/parser';

// Simple console logger wrapper
const consoleLogger: LoggerInstance = {
  info: (msg: string) => console.log(`[INFO] ${msg}`),
  warn: (msg: string) => console.warn(`[WARN] ${msg}`),
  error: (msg: string) => console.error(`[ERROR] ${msg}`),
  debug: (msg: string) => console.log(`[DEBUG] ${msg}`)
};

const logger = new Logger(consoleLogger);

interface ProbeArgs {
  host: string;
  username: string;
  port?: number;
  authMethod: 'password' | 'privateKey';
  password?: string;
  keyPath?: string;
  discover?: boolean;
}

function parseArgs(): ProbeArgs {
  const args = process.argv.slice(2);
  const result: ProbeArgs = {
    host: '',
    username: '',
    authMethod: 'password'
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    if (arg === '--host') {
      result.host = nextArg;
      i++;
    } else if (arg === '--username') {
      result.username = nextArg;
      i++;
    } else if (arg === '--port') {
      result.port = parseInt(nextArg, 10);
      i++;
    } else if (arg === '--auth-method') {
      result.authMethod = nextArg as 'password' | 'privateKey';
      i++;
    } else if (arg === '--key-path') {
      result.keyPath = nextArg;
      i++;
    } else if (arg === '--discover') {
      result.discover = true;
    }
  }

  return result;
}

function validateArgs(args: ProbeArgs): void {
  if (!args.host) {
    throw new Error('--host is required');
  }
  if (!args.username) {
    throw new Error('--username is required');
  }
  if (args.authMethod === 'privateKey' && !args.keyPath) {
    throw new Error('--key-path is required when using privateKey auth');
  }
}

async function promptPassword(): Promise<string> {
  // Check environment variable first
  if (process.env.MPOWER_PASSWORD) {
    return process.env.MPOWER_PASSWORD;
  }

  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    rl.question('Enter mPower password: ', (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function listProcPower(client: SSHClient): Promise<string[]> {
  console.log('\n=== Discovering /proc/power files ===');
  try {
    const files = await client.listDirectory('/proc/power');
    console.log(`Found ${files.length} files:`);
    files.forEach((f: string) => console.log(`  - ${f}`));
    return files;
  } catch (err) {
    console.error('Failed to list /proc/power:', (err as Error).message);
    return [];
  }
}

async function probeRelayState(
  client: SSHClient,
  relayNum: number
): Promise<boolean | null> {
  try {
    const output = await client.readFile(`/proc/power/relay${relayNum}`);
    const state = parseRelayState(output);
    console.log(`  relay${relayNum}: ${state ? 'ON' : 'OFF'} (${output.trim()})`);
    return state;
  } catch (err) {
    console.log(`  relay${relayNum}: ERROR - ${(err as Error).message}`);
    return null;
  }
}

async function probePowerMetrics(
  client: SSHClient,
  relayNum: number
): Promise<void> {
  const fields = [
    { name: 'active_pwr', path: `/proc/power/active_pwr${relayNum}` },
    { name: 'v_rms', path: `/proc/power/v_rms${relayNum}` },
    { name: 'i_rms', path: `/proc/power/i_rms${relayNum}` },
    { name: 'pf', path: `/proc/power/pf${relayNum}` }
  ];

  for (const field of fields) {
    try {
      const output = await client.readFile(field.path);
      console.log(`  ${field.name}${relayNum}: ${output.trim()}`);
    } catch (err) {
      // File doesn't exist or error reading it
      console.log(`  ${field.name}${relayNum}: NOT FOUND`);
    }
  }
}

async function runProbe(): Promise<void> {
  const args = parseArgs();
  validateArgs(args);

  console.log('mPower SSH Device Probe');
  console.log('======================\n');
  console.log(`Target: ${args.username}@${args.host}:${args.port || 22}`);
  console.log(`Auth: ${args.authMethod}`);

  // Get password if needed
  if (args.authMethod === 'password' && !args.password) {
    args.password = await promptPassword();
  }

  // Build auth config
  const auth = args.authMethod === 'password'
    ? {
        method: 'password' as const,
        username: args.username,
        password: args.password || ''
      }
    : {
        method: 'privateKey' as const,
        username: args.username,
        keyPath: args.keyPath || ''
      };

  const client = new SSHClient(
    {
      host: args.host,
      port: args.port,
      auth,
      readyTimeout: 20000,
      commandTimeout: 5000
    },
    logger,
    `mPower (${args.host})`
  );

  try {
    console.log('\nConnecting...');
    await client.connect();
    console.log('✓ Connected');

    // Discover available files
    const files = await listProcPower(client);

    // Find relay count by looking at relay files
    let relayCount = 0;
    for (const file of files) {
      if (file.startsWith('relay')) {
        const num = parseInt(file.replace('relay', ''), 10);
        if (num > relayCount) {
          relayCount = num;
        }
      }
    }

    console.log(`\n=== Relay States (${relayCount} relays found) ===`);
    for (let i = 1; i <= relayCount; i++) {
      await probeRelayState(client, i);
    }

    // Probe power metrics for relay 1 as example
    if (relayCount > 0) {
      console.log('\n=== Power Metrics (relay 1 as example) ===');
      await probePowerMetrics(client, 1);
    }

    // Additional info
    console.log('\n=== Device Information ===');
    try {
      const output = await client.exec("uname -a 2>/dev/null || cat /proc/version 2>/dev/null || echo 'unknown'");
      console.log(`System info: ${output.stdout.slice(0, 100)}`);
    } catch (err) {
      console.log('Could not retrieve system info');
    }

    console.log('\n✓ Probe complete');
    console.log('Use the above output to:');
    console.log('  1. Determine available power metrics');
    console.log('  2. Verify relay numbering');
    console.log('  3. Check if cumulative energy is available');

  } catch (err) {
    console.error('✗ Probe failed:', (err as Error).message);
    process.exit(1);
  } finally {
    await client.disconnect();
  }
}

// Run the probe
runProbe().catch((err) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
