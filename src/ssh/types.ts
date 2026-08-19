/**
 * SSH Connection Configuration Types
 *
 * This module defines configuration types for SSH connections.
 * Credentials are defined here but never logged or exposed in errors.
 */

export interface PasswordAuth {
  readonly method: 'password';
  readonly username: string;
  readonly password: string;
}

export interface PrivateKeyAuth {
  readonly method: 'privateKey';
  readonly username: string;
  readonly keyPath: string;
  readonly passphrase?: string;
}

export type AuthConfig = PasswordAuth | PrivateKeyAuth;

export interface SSHConnectionConfig {
  readonly host: string;
  readonly port?: number;
  readonly auth: AuthConfig;
  readonly readyTimeout?: number;
  readonly commandTimeout?: number;
}

export interface SSHConnectionOptions {
  readonly kexAlgorithms: string[];
  readonly serverHostKeyAlgorithms: string[];
  readonly ciphers: string[];
}
