# homebridge-mpower-ssh

A Homebridge plugin for controlling legacy Ubiquiti mFi mPower smart power strips directly over SSH, without an mFi Controller.

## Features

- Direct per-relay on/off control
- Relay state polling
- Per-relay active power, voltage, current, and power-factor polling
- HomeKit/HAP outlets and lights
- Matter outlets and lights with `ElectricalPowerMeasurement`
- Password or private-key authentication
- One serialized SSH connection per physical strip
- Homebridge UI configuration schema

The mPower hardware is obsolete and requires legacy SSH algorithms. The plugin enables only the algorithms required by these devices (`diffie-hellman-group1-sha1`, `ssh-rsa`, and `aes128-cbc`). Use it only on a trusted local network.

## Requirements

- Node.js 22, 24, or 26
- Homebridge 2.4 or newer
- An mPower device reachable over SSH

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
          "name": "Tool Outlet",
          "type": "outlet",
          "allowControl": false
        }
      ]
    }
  ]
}
```

`transport` can be:

- `hap` (default): publish traditional HomeKit accessories.
- `matter`: publish Matter accessories only.
- `both`: publish both while testing. Pairing both transports with Apple Home creates duplicate tiles.

For key authentication, replace `password` with `keyPath` and optionally `passphrase`.

Set `allowControl` to `false` for infrastructure or other protected loads. The relay continues to report state and power measurements, but HomeKit and Matter commands are rejected before an SSH write is sent.

## Matter

Matter must be enabled for the main bridge or the plugin's child bridge in Homebridge. Configure `transport` as `matter` or `both`, restart Homebridge, and commission the Matter bridge using the QR code shown by Homebridge.

Each configured relay is published as an on/off plug-in unit or on/off light. The plugin reads:

- `/proc/power/active_pwrN` as active power
- `/proc/power/v_rmsN` as voltage
- `/proc/power/i_rmsN` as active current
- `/proc/power/pfN` as power factor

Matter receives active power, voltage, and current. Power factor is polled but is not part of Homebridge's current electrical measurement state interface. Cumulative energy is not yet implemented.

## Device Probe

Build the project and query a device without installing the Homebridge plugin:

```bash
npm run build
MPOWER_PASSWORD=your_password npm run probe -- --host 192.168.1.50 --username admin
```

## Development

```bash
npm install
npm run build
npm test
npm run lint
```

## License

Apache-2.0
