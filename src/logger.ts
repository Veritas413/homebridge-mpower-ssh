/**
 * Secure Logger
 *
 * Ensures credentials and sensitive data are never logged.
 * Wraps Homebridge's Logger with credential redaction.
 */

export interface LoggerInstance {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  debug?(message: string): void;
}

/**
 * Redacts sensitive data from log messages.
 * Replaces passwords, keys, and other credentials with [REDACTED].
 */
function redactSensitiveData(message: string): string {
  let redacted = message;

  // Redact common credential patterns
  redacted = redacted.replace(/password[=:\s]+\S+/gi, 'password=[REDACTED]');
  redacted = redacted.replace(/pass[=:\s]+\S+/gi, 'pass=[REDACTED]');
  redacted = redacted.replace(/key[=:\s]+\S+/gi, 'key=[REDACTED]');
  redacted = redacted.replace(/secret[=:\s]+\S+/gi, 'secret=[REDACTED]');
  redacted = redacted.replace(/token[=:\s]+\S+/gi, 'token=[REDACTED]');
  redacted = redacted.replace(/auth[=:\s]+\S+/gi, 'auth=[REDACTED]');

  return redacted;
}

/**
 * Secure logger that redacts credentials from all log messages.
 */
export class Logger implements LoggerInstance {
  constructor(private wrappedLogger: LoggerInstance) {}

  info(message: string): void {
    this.wrappedLogger.info(redactSensitiveData(message));
  }

  warn(message: string): void {
    this.wrappedLogger.warn(redactSensitiveData(message));
  }

  error(message: string): void {
    this.wrappedLogger.error(redactSensitiveData(message));
  }

  debug(message: string): void {
    this.wrappedLogger.debug?.(redactSensitiveData(message));
  }
}
