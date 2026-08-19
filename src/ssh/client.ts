/**
 * SSH2 Transport Abstraction for mPower Communication
 *
 * Manages SSH connections to mPower devices with:
 * - Connection timeouts and reconnection logic
 * - Command execution with result parsing
 * - Secure error handling (no credential leakage)
 * - Legacy algorithm support
 */

import { Client as SSH2Client, ClientChannel } from 'ssh2';
import { readFileSync } from 'fs';
import { SSHConnectionConfig, PasswordAuth } from './types';
import { getLegacyMPowerAlgorithms } from './algorithms';
import { Logger } from '../logger';

export interface CommandResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number | null;
}

/**
 * Secure SSH client for mPower devices.
 *
 * Does NOT store or expose credentials anywhere.
 * Logs device name and host, not credentials.
 */
export class SSHClient {
  private client: SSH2Client | null = null;
  private isConnected = false;
  private commandQueue: Array<() => Promise<void>> = [];
  private isProcessingQueue = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 2000;

  constructor(
    private config: SSHConnectionConfig,
    private logger: Logger,
    private deviceName: string
  ) {
    this.client = new SSH2Client();
  }

  /**
   * Connects to the mPower device.
   * Does not expose credentials in logs or errors.
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.isConnected) {
        resolve();
        return;
      }
      this.client?.removeAllListeners();
      this.client?.end();
      const client = new SSH2Client();
      this.client = client;
      let settled = false;

      const timeout = this.config.readyTimeout || 20000;
      const timeoutHandle = setTimeout(() => {
        settled = true;
        client.end();
        reject(new Error(
          `SSH connection timeout after ${timeout}ms for ${this.deviceName} (${this.config.host})`
        ));
      }, timeout);

      client.on('ready', () => {
        clearTimeout(timeoutHandle);
        settled = true;
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.logger.info(`SSH client ready for ${this.deviceName}`);
        resolve();
      });

      client.on('error', (err: Error) => {
        clearTimeout(timeoutHandle);
        const safeMessage = err.message.replace(/password|key|auth/gi, '[REDACTED]');
        if (!settled) {
          settled = true;
          reject(new Error(safeMessage));
        } else {
          this.logger.warn(`SSH connection lost for ${this.deviceName} (${this.config.host}): ${safeMessage}`);
        }
      });

      client.on('close', () => {
        this.isConnected = false;
        this.logger.debug(`SSH connection closed for ${this.deviceName}`);
      });

      client.on('end', () => {
        this.isConnected = false;
        this.logger.debug(`SSH connection ended for ${this.deviceName}`);
      });

      try {
        const connectConfig = this.buildConnectConfig();
        client.connect(connectConfig);
      } catch (err) {
        clearTimeout(timeoutHandle);
        settled = true;
        reject(err);
      }
    });
  }

  /**
   * Disconnects from the mPower device.
   */
  async disconnect(): Promise<void> {
    return new Promise((resolve) => {
      if (this.client) {
        this.client.end();
      }
      this.isConnected = false;
      resolve();
    });
  }

  /**
   * Executes a remote command and returns the result.
   * Command timeout is per-command, not for the entire operation.
   */
  async exec(command: string): Promise<CommandResult> {
    if (!this.isConnected || !this.client) {
      throw new Error(
        `SSH client not connected for ${this.deviceName} (${this.config.host})`
      );
    }

    return new Promise((resolve, reject) => {
      const timeout = this.config.commandTimeout || 5000;
      let settled = false;
      const timeoutHandle = setTimeout(() => {
        settled = true;
        this.isConnected = false;
        this.client?.end();
        reject(new Error(
          `Command timeout after ${timeout}ms for ${this.deviceName}`
        ));
      }, timeout);

      let stdout = '';
      let stderr = '';
      let exitCode: number | null = null;

      if (!this.client) {
        clearTimeout(timeoutHandle);
        reject(new Error('SSH client lost during command execution'));
        return;
      }

      this.client.exec(command, (err: Error | undefined, stream: ClientChannel) => {
        if (err) {
          clearTimeout(timeoutHandle);
          if (settled) return;
          settled = true;
          this.isConnected = false;
          const safeMessage = err.message.replace(/password|key|auth/gi, '[REDACTED]');
          reject(new Error(
            `Failed to execute command on ${this.deviceName}: ${safeMessage}`
          ));
          return;
        }

        stream.on('close', () => {
          clearTimeout(timeoutHandle);
          if (settled) return;
          settled = true;
          resolve({
            stdout: stdout.trim(),
            stderr: stderr.trim(),
            exitCode
          });
        });

        stream.on('data', (data: Buffer) => {
          stdout += data.toString();
        });

        stream.stderr.on('data', (data: Buffer) => {
          stderr += data.toString();
        });

        stream.on('exit', (code: number | null) => {
          exitCode = code;
        });
      });
    });
  }

  /**
   * Reads a remote file content via cat command.
   * Useful for reading /proc/power/* files.
   */
  async readFile(filePath: string): Promise<string> {
    const result = await this.exec(`cat "${filePath}"`);
    if (result.exitCode !== 0) {
      throw new Error(
        `Failed to read ${filePath} on ${this.deviceName}: ${result.stderr}`
      );
    }
    return result.stdout;
  }

  /**
   * Lists directory contents via ls command.
   */
  async listDirectory(dirPath: string): Promise<string[]> {
    const result = await this.exec(`ls -1 "${dirPath}"`);
    if (result.exitCode !== 0) {
      throw new Error(
        `Failed to list ${dirPath} on ${this.deviceName}: ${result.stderr}`
      );
    }
    return result.stdout
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);
  }

  /**
   * Checks if the connection is active.
   */
  getIsConnected(): boolean {
    return this.isConnected;
  }

  /**
   * Gets safe connection info (no credentials).
   */
  getConnectionInfo(): string {
    return `${this.config.auth.username}@${this.config.host}:${this.config.port || 22}`;
  }

  /**
   * Builds the ssh2 connection configuration.
   * Credentials are only used here and never stored elsewhere.
   */
  private buildConnectConfig(): Record<string, unknown> {
    const algorithms = getLegacyMPowerAlgorithms();

    const config: Record<string, unknown> = {
      host: this.config.host,
      port: this.config.port || 22,
      username: this.config.auth.username,
      readyTimeout: this.config.readyTimeout || 20000,
      algorithms: {
        kex: algorithms.kexAlgorithms,
        serverHostKey: algorithms.serverHostKeyAlgorithms,
        cipher: algorithms.ciphers
      }
    };

    if (this.config.auth.method === 'password') {
      const auth = this.config.auth as PasswordAuth;
      config.password = auth.password;
    } else if (this.config.auth.method === 'privateKey') {
      try {
        config.privateKey = readFileSync(this.config.auth.keyPath);
        if (this.config.auth.passphrase) {
          config.passphrase = this.config.auth.passphrase;
        }
      } catch (err) {
        throw new Error(
          `Failed to read private key from ${this.config.auth.keyPath}: ${
            (err as Error).message
          }`
        );
      }
    }

    return config;
  }
}
