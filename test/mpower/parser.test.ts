/**
 * Tests for mPower Output Parser
 */

import {
  parseRelayState,
  parseNumericField,
  parseActivePower,
  parseVoltage,
  parseCurrent,
  parsePowerFactor,
  parseMultiFieldOutput
} from '../../src/mpower/parser';

describe('mPower Parser - Relay State', () => {
  test('should parse relay OFF state', () => {
    expect(parseRelayState('0')).toBe(false);
  });

  test('should parse relay ON state', () => {
    expect(parseRelayState('1')).toBe(true);
  });

  test('should handle leading/trailing whitespace', () => {
    expect(parseRelayState('  0  ')).toBe(false);
    expect(parseRelayState('\t1\n')).toBe(true);
    expect(parseRelayState('\r\n0\r\n')).toBe(false);
  });

  test('should reject invalid relay states', () => {
    expect(() => parseRelayState('2')).toThrow();
    expect(() => parseRelayState('on')).toThrow();
    expect(() => parseRelayState('off')).toThrow();
    expect(() => parseRelayState('')).toThrow();
    expect(() => parseRelayState('  ')).toThrow();
  });
});

describe('mPower Parser - Numeric Fields', () => {
  test('should parse integers', () => {
    expect(parseNumericField('123', 'Test')).toBe(123);
    expect(parseNumericField('-456', 'Test')).toBe(-456);
  });

  test('should parse decimal values', () => {
    expect(parseNumericField('47.2', 'Test')).toBe(47.2);
    expect(parseNumericField('0.38', 'Test')).toBe(0.38);
    expect(parseNumericField('.5', 'Test')).toBe(0.5);
  });

  test('should handle leading/trailing whitespace', () => {
    expect(parseNumericField('  123.45  ', 'Test')).toBe(123.45);
    expect(parseNumericField('\t0.5\n', 'Test')).toBe(0.5);
  });

  test('should handle scientific notation', () => {
    expect(parseNumericField('1e3', 'Test')).toBe(1000);
    expect(parseNumericField('1.5e-2', 'Test')).toBe(0.015);
  });

  test('should reject NaN', () => {
    expect(() => parseNumericField('abc', 'Test')).toThrow();
    expect(() => parseNumericField('', 'Test')).toThrow();
    expect(() => parseNumericField('  ', 'Test')).toThrow();
    expect(() => parseNumericField('12.3 garbage', 'Test')).toThrow();
  });

  test('should reject Infinity', () => {
    expect(() => parseNumericField('Infinity', 'Test')).toThrow();
    expect(() => parseNumericField('-Infinity', 'Test')).toThrow();
  });
});

describe('mPower Parser - Power Metrics', () => {
  test('should parse active power', () => {
    expect(parseActivePower('47.2')).toBe(47.2);
    expect(parseActivePower('0')).toBe(0);
    expect(parseActivePower('1234.56')).toBe(1234.56);
  });

  test('should parse voltage', () => {
    expect(parseVoltage('123.4')).toBe(123.4);
    expect(parseVoltage('120')).toBe(120);
  });

  test('should parse current', () => {
    expect(parseCurrent('0.38')).toBe(0.38);
    expect(parseCurrent('2.5')).toBe(2.5);
  });

  test('should parse power factor', () => {
    expect(parsePowerFactor('0.98')).toBe(0.98);
    expect(parsePowerFactor('1.0')).toBe(1.0);
    expect(parsePowerFactor('0.5')).toBe(0.5);
  });
});

describe('mPower Parser - Multi-Field Output', () => {
  test('should parse key=value format', () => {
    const output = `relay=1
power=47.2
voltage=123.4
current=0.38
pf=0.98`;

    const result = parseMultiFieldOutput(output);
    expect(result.relay).toBe(true);
    expect(result.activePower).toBe(47.2);
    expect(result.voltage).toBe(123.4);
    expect(result.current).toBe(0.38);
    expect(result.powerFactor).toBe(0.98);
    expect(result.errors.size).toBe(0);
  });

  test('should parse key: value format', () => {
    const output = `relay: 0
power: 0
voltage: 120
current: 0
pf: 1.0`;

    const result = parseMultiFieldOutput(output);
    expect(result.relay).toBe(false);
    expect(result.activePower).toBe(0);
    expect(result.voltage).toBe(120);
    expect(result.errors.size).toBe(0);
  });

  test('should handle partial data', () => {
    const output = `relay=1
power=50.5`;

    const result = parseMultiFieldOutput(output);
    expect(result.relay).toBe(true);
    expect(result.activePower).toBe(50.5);
    expect(result.voltage).toBeUndefined();
    expect(result.current).toBeUndefined();
    expect(result.errors.size).toBe(0);
  });

  test('should handle CR/LF variations', () => {
    const output = 'relay=1\r\npower=47.2\nv_rms=120\r';
    const result = parseMultiFieldOutput(output);
    expect(result.relay).toBe(true);
    expect(result.activePower).toBe(47.2);
    expect(result.voltage).toBe(120);
  });

  test('should collect errors for malformed fields', () => {
    const output = `relay=1
power=invalid_value
voltage=120
current=also_bad`;

    const result = parseMultiFieldOutput(output);
    expect(result.relay).toBe(true);
    expect(result.voltage).toBe(120);
    expect(result.activePower).toBeUndefined();
    expect(result.current).toBeUndefined();
    expect(result.errors.size).toBe(2);
    expect(result.errors.has('power')).toBe(true);
    expect(result.errors.has('current')).toBe(true);
  });

  test('should ignore empty lines', () => {
    const output = `relay=1

power=47.2

voltage=120`;

    const result = parseMultiFieldOutput(output);
    expect(result.relay).toBe(true);
    expect(result.activePower).toBe(47.2);
    expect(result.voltage).toBe(120);
  });
});
