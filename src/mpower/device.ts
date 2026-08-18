import { Logger } from '../logger';
import { SSHClient } from '../ssh/client';
import type { SSHConnectionConfig } from '../ssh/types';
import { parseMultiFieldOutput, parseRelayState } from './parser';

export interface ElectricalMeasurements {
  readonly activePower?: number;
  readonly voltage?: number;
  readonly current?: number;
  readonly powerFactor?: number;
}

export interface SSHTransport {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getIsConnected(): boolean;
  readFile(path: string): Promise<string>;
  exec(command: string): Promise<{ readonly stdout: string; readonly stderr: string; readonly exitCode: number | null }>;
}

type RelayListener = (state: boolean) => void;
type MeasurementListener = (measurements: ElectricalMeasurements) => void;

export class MPowerDevice {
  private readonly client: SSHTransport;
  private readonly listeners = new Map<number, Set<RelayListener>>();
  private readonly measurementListeners = new Map<number, Set<MeasurementListener>>();
  private readonly states = new Map<number, boolean>();
  private operation = Promise.resolve();
  private pollTimer?: ReturnType<typeof setTimeout>;
  private stopped = false;

  constructor(
    readonly name: string,
    readonly host: string,
    private readonly relays: readonly number[],
    private readonly pollIntervalSeconds: number,
    private readonly logger: Logger,
    connection: SSHConnectionConfig,
    client?: SSHTransport,
  ) {
    this.client = client ?? new SSHClient(connection, logger, name);
  }

  start(): void {
    this.stopped = false;
    this.schedulePoll();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.pollTimer) clearTimeout(this.pollTimer);
    await this.client.disconnect();
  }

  onRelayState(relay: number, listener: RelayListener): () => void {
    const listeners = this.listeners.get(relay) ?? new Set<RelayListener>();
    listeners.add(listener);
    this.listeners.set(relay, listeners);
    return () => listeners.delete(listener);
  }

  getCachedRelayState(relay: number): boolean | undefined {
    return this.states.get(relay);
  }

  onMeasurements(relay: number, listener: MeasurementListener): () => void {
    const listeners = this.measurementListeners.get(relay) ?? new Set<MeasurementListener>();
    listeners.add(listener);
    this.measurementListeners.set(relay, listeners);
    return () => listeners.delete(listener);
  }

  readRelay(relay: number): Promise<boolean> {
    return this.enqueue(async () => {
      await this.ensureConnected();
      const state = parseRelayState(await this.client.readFile(`/proc/power/relay${relay}`));
      this.publish(relay, state);
      return state;
    });
  }

  setRelay(relay: number, state: boolean): Promise<void> {
    return this.enqueue(async () => {
      await this.ensureConnected();
      const result = await this.client.exec(`echo ${state ? '1' : '0'} > /proc/power/relay${relay}`);
      if (result.exitCode !== 0) throw new Error(`Failed to set relay ${relay} on ${this.name}: ${result.stderr}`);
      this.publish(relay, state);
    });
  }

  async poll(): Promise<void> {
    for (const relay of this.relays) {
      try {
        await this.pollRelay(relay);
      } catch (error) {
        this.logger.warn(`Unable to poll relay ${relay} on ${this.name}: ${(error as Error).message}`);
      }
    }
  }

  private pollRelay(relay: number): Promise<void> {
    return this.enqueue(async () => {
      await this.ensureConnected();
      const base = '/proc/power';
      const command = [
        `printf 'relay='; cat ${base}/relay${relay}`,
        `printf '\npower='; cat ${base}/active_pwr${relay}`,
        `printf '\nvoltage='; cat ${base}/v_rms${relay}`,
        `printf '\ncurrent='; cat ${base}/i_rms${relay}`,
        `printf '\npf='; cat ${base}/pf${relay}`,
      ].join('; ');
      const parsed = parseMultiFieldOutput((await this.client.exec(command)).stdout);
      if (parsed.relay === undefined) throw new Error(`No relay state returned for relay ${relay}`);
      this.publish(relay, parsed.relay);
      const measurements: ElectricalMeasurements = {
        activePower: parsed.activePower,
        voltage: parsed.voltage,
        current: parsed.current,
        powerFactor: parsed.powerFactor,
      };
      for (const listener of this.measurementListeners.get(relay) ?? []) listener(measurements);
    });
  }

  private schedulePoll(): void {
    if (this.stopped) return;
    this.pollTimer = setTimeout(() => void this.poll().finally(() => this.schedulePoll()), this.pollIntervalSeconds * 1000);
    this.pollTimer.unref();
  }

  private async ensureConnected(): Promise<void> {
    if (!this.client.getIsConnected()) await this.client.connect();
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operation.then(operation, operation);
    this.operation = result.then(() => undefined, () => undefined);
    return result;
  }

  private publish(relay: number, state: boolean): void {
    this.states.set(relay, state);
    for (const listener of this.listeners.get(relay) ?? []) listener(state);
  }
}
