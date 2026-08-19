# homebridge-mpower-ssh

A Homebridge dynamic-platform plugin for controlling and monitoring legacy Ubiquiti mFi mPower smart power strips directly over SSH, without an mFi Controller.

## Features

- Per-relay on/off control and state polling
- Active power, voltage, current, and power-factor polling
- HomeKit/HAP and native Homebridge Matter transports
- Outlet and light accessory types
- Monitoring-only protection for loads that must not be switched off
- Password or private-key SSH authentication
- Automatic reconnect with exponential backoff for offline strips
- Homebridge UI configuration schema

## Requirements

- Homebridge 2.4 or newer
- Node.js 22.12 or newer in the Node 22 line, or Node.js 24
- An mPower device reachable over SSH

The mPower hardware is obsolete and requires legacy SSH algorithms. This plugin enables only the algorithms required by these devices: `diffie-hellman-group1-sha1`, `ssh-rsa`, and `aes128-cbc`. Use it only on a trusted local network and give each strip a dedicated, limited-purpose SSH account where possible.

## Installation

Install `homebridge-mpower-ssh` from the Homebridge UI, or install it globally from npm:

```bash
npm install -g homebridge-mpower-ssh
```

Configure the plugin through the Homebridge UI and restart Homebridge.

## Configuration

```json
{
  "platform": "mPowerSSH",
  "name": "mPower SSH",
  "transport": "hap",
  "pollInterval": 10,
  "strips": [
    {
      "name": "Workshop Strip",
      "host": "192.168.1.50",
      "port": 22,
      "username": "admin",
      "password": "YOUR_PASSWORD",
      "devices": [
        {
          "relay": 1,
          "name": "Workbench Light",
          "type": "light"
        },
        {
          "relay": 2,
          "name": "Network Equipment",
          "type": "outlet",
          "allowControl": false
        }
      ]
    }
  ]
}
```

### Platform options

| Option | Required | Default | Description |
| --- | --- | --- | --- |
| `platform` | Yes | — | Must be `mPowerSSH`. |
| `name` | No | `mPower SSH` | Platform display name. |
| `transport` | No | `hap` | `hap`, `matter`, or `both`. |
| `pollInterval` | No | `10` | Polling interval in seconds, from 5 through 300. |
| `strips` | Yes | — | One or more physical mPower strips. |

Each strip requires `host`, `username`, one authentication method (`password` or `keyPath`), and at least one entry in `devices`. Private-key authentication also accepts an optional `passphrase`.

Each device requires a positive, unique `relay` number and a `name`. Its `type` is `outlet` by default or may be `light`. Set the JSON boolean `allowControl` to `false` for infrastructure or other protected loads. The relay continues reporting state and measurements, but control requests are rejected before any SSH write.

## Transport and power monitoring

- `hap` publishes traditional HomeKit accessories. HAP does not expose these electrical measurements to Apple Home.
- `matter` publishes native Matter accessories with `ElectricalPowerMeasurement`.
- `both` is useful for migration testing, but pairing both transports creates duplicate accessories in Apple Home.

Matter must be enabled for the main bridge or the plugin's child bridge. After selecting `matter`, restart Homebridge and commission its Matter bridge using the QR code shown in the Homebridge UI.

The plugin reads these per-relay files:

- `/proc/power/active_pwrN` — active power
- `/proc/power/v_rmsN` — voltage
- `/proc/power/i_rmsN` — active current
- `/proc/power/pfN` — power factor

Matter receives active power, voltage, and current. Power factor is polled but is not currently published by the Homebridge Matter state interface. Cumulative energy is not implemented. Apple Home requires a client OS version that supports displaying Matter energy data; older versions may control the outlet without showing wattage.

If a release changes an accessory's Matter capabilities, Apple Home may retain its old endpoint description. Restart the Home app and home hub first. If the new capability still does not appear, removing and re-pairing only the Homebridge Matter bridge forces rediscovery, but may reset rooms, scenes, and automations for its accessories.

## Offline devices and diagnostics

An unreachable strip does not block other configured strips. Retries use exponential backoff up to five minutes, and normal polling resumes automatically after reconnection. Accessories retain their last known state while reporting a fault or unreachable status.

Relay changes log the transport, requested state, and result. For example:

```text
Control request via Matter for Workshop Strip relay 1: ON
Control applied via Matter for Workshop Strip relay 1: ON
```

## Device probe

Build the project and query a device without installing the Homebridge plugin:

```bash
npm run build
MPOWER_PASSWORD=your_password npm run probe -- --host 192.168.1.50 --username admin
```

Run `npm run probe -- --help` for private-key and other options. Never include probe credentials or output containing sensitive information in a public issue.

## Development

```bash
npm ci
npm run build
npm test -- --runInBand
npm run lint
npm pack --dry-run
```

Bug reports and contributions are welcome in the [GitHub repository](https://github.com/Veritas413/homebridge-mpower-ssh). Please redact hostnames, addresses, usernames, passwords, private keys, and tokens from logs and configuration.

## License

Apache-2.0
