/**
 * mPower Output Parser
 *
 * Parses the output from mPower /proc/power/* commands.
 * Handles CR/LF variations, whitespace, and validates all numeric values.
 */

/**
 * Parses relay state from /proc/power/relayN files.
 * Expected output: "0" or "1" (with possible whitespace/newlines)
 *
 * @returns true if relay is ON (1), false if OFF (0)
 * @throws if output is not a valid relay state
 */
export function parseRelayState(output: string): boolean {
  const trimmed = output.trim();

  if (trimmed === '0') {
    return false;
  }
  if (trimmed === '1') {
    return true;
  }

  throw new Error(
    `Invalid relay state: expected "0" or "1", got "${trimmed}"`
  );
}

/**
 * Parses a numeric value from mPower output.
 * Handles integers and decimal values, strips whitespace.
 *
 * @param output - Raw command output
 * @param fieldName - Field name for error messages
 * @returns Parsed number
 * @throws if output cannot be parsed as a number
 */
export function parseNumericField(output: string, fieldName: string): number {
  const trimmed = output.trim();

  if (trimmed.length === 0) {
    throw new Error(`${fieldName}: empty output`);
  }

  const numericPattern = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
  if (!numericPattern.test(trimmed)) {
    throw new Error(`${fieldName}: expected numeric value, got "${trimmed}"`);
  }

  const parsed = Number(trimmed);

  if (isNaN(parsed)) {
    throw new Error(
      `${fieldName}: expected numeric value, got "${trimmed}"`
    );
  }

  if (!isFinite(parsed)) {
    throw new Error(
      `${fieldName}: got non-finite value (Infinity or NaN)`
    );
  }

  return parsed;
}

/**
 * Parses active power (watts) from /proc/power/active_pwrN
 */
export function parseActivePower(output: string): number {
  return parseNumericField(output, 'Active Power');
}

/**
 * Parses voltage (volts RMS) from /proc/power/v_rmsN
 */
export function parseVoltage(output: string): number {
  return parseNumericField(output, 'Voltage (V RMS)');
}

/**
 * Parses current (amps RMS) from /proc/power/i_rmsN
 */
export function parseCurrent(output: string): number {
  return parseNumericField(output, 'Current (A RMS)');
}

/**
 * Parses power factor from /proc/power/pfN
 */
export function parsePowerFactor(output: string): number {
  const value = parseNumericField(output, 'Power Factor');

  // Power factor should be between 0 and 1 (or 0 to 100 if percentage)
  // Most likely it's 0-1 range
  if (value < 0 || value > 1) {
    console.warn(
      `Power factor value ${value} outside expected range [0, 1]; may be in different units`
    );
  }

  return value;
}

/**
 * Multi-field parser for efficient polling.
 * Parses output from compound commands like:
 *   printf 'relay='; cat /proc/power/relay1
 *   printf 'power='; cat /proc/power/active_pwr1
 *
 * Returns parsed fields, with errors collected separately so one bad field
 * doesn't invalidate others.
 */
export interface ParsedPollResult {
  relay?: boolean;
  activePower?: number;
  voltage?: number;
  current?: number;
  powerFactor?: number;
  errors: Map<string, Error>;
}

export function parseMultiFieldOutput(output: string): ParsedPollResult {
  const result: ParsedPollResult = {
    errors: new Map()
  };

  // Split by common delimiters and look for key=value pairs
  const lines = output.split(/[\r\n]+/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Try to parse as "key=value" or "key: value"
    const keyValueMatch = trimmed.match(/^([^=:]+)[=:]\s*(.*)$/);
    if (!keyValueMatch) continue;

    const [, key, value] = keyValueMatch;
    const normalizedKey = key.trim().toLowerCase();

    try {
      if (normalizedKey === 'relay' || normalizedKey.startsWith('relay')) {
        result.relay = parseRelayState(value);
      } else if (normalizedKey === 'power' || normalizedKey.includes('pwr')) {
        result.activePower = parseActivePower(value);
      } else if (normalizedKey === 'voltage' || normalizedKey.includes('v_rms')) {
        result.voltage = parseVoltage(value);
      } else if (normalizedKey === 'current' || normalizedKey.includes('i_rms')) {
        result.current = parseCurrent(value);
      } else if (normalizedKey === 'pf' || normalizedKey.includes('power_factor')) {
        result.powerFactor = parsePowerFactor(value);
      }
    } catch (err) {
      result.errors.set(normalizedKey, err as Error);
    }
  }

  return result;
}
