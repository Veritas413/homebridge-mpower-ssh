# homebridge-mpower-ssh

A modern Homebridge plugin for Ubiquiti mFi mPower smart power strips.

⚠️ **Hardware Support**: This plugin is designed for legacy Ubiquiti mFi hardware (e.g., firmware `MF.v2.1.12`). This hardware is no longer manufactured or supported by Ubiquiti. Use this plugin if you have existing mPower devices in your network.

## Features

- ✅ Direct SSH control of mPower outlets (no central mFi Controller required)
- ✅ Real relay state reading (not just cached/expected state)
- ✅ Multiple devices and outlets
- ✅ Password or SSH key authentication
- ✅ Live power monitoring (watts, voltage, current)
- ✅ Matter support with electrical power/energy reporting
- ✅ Homebridge UI configuration schema
- ✅ Automatic reconnection and error handling

## Architecture

```
HomeKit / Apple Home
        ↓
    Homebridge
        ↓
homebridge-mpower-ssh (Dynamic Platform Plugin)
        ↓
   SSH Transport
        ↓
   mPower Devices
```

### Module Structure

```
src/
├── index.ts                 # Platform plugin entry point
├── platform.ts              # Dynamic platform class
├── platformAccessory.ts     # HAP accessory implementation
├── matter/
│   └── outlet.ts           # Matter OnOffOutlet device
├── ssh/
│   ├── client.ts           # SSH2 transport abstraction
│   ├── types.ts            # SSH connection configuration types
│   └── algorithms.ts       # Legacy algorithm configuration
├── mpower/
│   ├── device.ts           # Device abstraction layer
│   ├── parser.ts           # Output parsing (relay, power, voltage)
│   └── config.ts           # Device configuration types
├── config/
│   ├── schema.ts           # Configuration schema generator
│   └── validator.ts        # Config validation
├── logger.ts               # Secure logging (no credentials)
├── settings.ts             # Plugin constants
└── probe.ts                # CLI diagnostic utility

test/
├── ssh/
│   ├── algorithms.test.ts
│   └── parser.test.ts
├── mpower/
│   └── parser.test.ts
└── config/
    └── validator.test.ts
```

## SSH Legacy Algorithm Requirements

These devices require obsolete SSH algorithms not enabled by default in modern OpenSSH:

```
Key Exchange (kex):     diffie-hellman-group1-sha1
Server Host Key:        ssh-rsa
Cipher:                 aes128-cbc
```

The plugin configures these automatically via the `ssh2` Node.js library.

## Phase 0/1: Current Implementation Status

### ✅ Completed
- Project scaffolding and configuration
- TypeScript setup
- ESLint and Jest configuration
- SSH2 library selection and verification
- Core type definitions
- SSH transport abstraction
- Relay state parsing (0/1)
- Numeric meter parsing (watts, voltage, current)
- Device probe CLI utility
- Unit tests (relay parsing, config validation)

### 🔄 In Progress
- Phase 1: SSH transport implementation and testing

### ⏸️ Not Started
- Phase 2: Homebridge platform and HAP accessories
- Phase 3: Matter outlet and power measurement
- Phase 4: Cumulative energy (hardware probe required)
- Phase 5: Polish and packaging

## Configuration Example

### Platform Settings (config.json)

```json
{
  "platform": "mPowerSSH",
  "name": "mPower SSH",
  "auth": {
    "method": "password",
    "username": "Veritas413",
    "password": "YOUR_MPOWER_PASSWORD"
  },
  "pollInterval": 10,
  "devices": [
    {
      "host": "192.168.1.107",
      "name": "Workshop mPower",
      "outlets": [
        {
          "relay": 1,
          "name": "Andy Workshop Workbench Light",
          "powerMonitoring": true
        },
        {
          "relay": 2,
          "name": "Workshop Outlet 2",
          "powerMonitoring": true
        }
      ]
    }
  ]
}
```

### Key-Based Authentication (Optional)

```json
{
  "auth": {
    "method": "privateKey",
    "username": "Veritas413",
    "keyPath": "/var/lib/homebridge/.ssh/id_rsa"
  }
}
```

## Development

### Install Dependencies

```bash
npm install
```

### Build

```bash
npm run build
```

### Run Tests

```bash
npm test
npm run test:coverage
```

### Device Probe

Interrogate a real mPower device to discover available metrics:

```bash
# Interactive prompt for password
npm run probe -- --host 192.168.1.107 --username Veritas413

# Or use environment variable (recommended to avoid shell history)
MPOWER_PASSWORD=your_password npm run probe -- --host 192.168.1.107 --username Veritas413

# Discover /proc/power structure
npm run probe -- --host 192.168.1.107 --username Veritas413 --discover
```

**Expected probe output:**

```
=== Relay State ===
relay1: 0
relay2: 1

=== Power Metrics ===
active_pwr1: 47.2 W
v_rms1: 123.4 V
i_rms1: 0.38 A
pf1: 0.98

[Additional fields...]
```

The probe helps us understand:
- Exact `/proc/power` field names on your firmware version
- Units and scaling of measurements
- Whether cumulative energy is available
- Any firmware-specific quirks

## Security Notes

- **Passwords**: Never committed to repository. Store in Homebridge's secure configuration or use SSH keys.
- **Logs**: Plugin never logs credentials, even at debug level.
- **Error messages**: Stack traces never include sensitive data.
- **Network**: All communication is direct SSH; no central controller dependency.

## Host Key Verification

The mFi SSH implementation is ancient. Host key verification is complex to implement securely for these devices. Current approach:

- Accept host key on first connection (like `ssh` with `StrictHostKeyChecking=accept-new`)
- Future: Optional known fingerprint validation

This is documented explicitly. Users should verify the device IP/hostname match their setup.

## Known Issues & Limitations

### Hardware/Firmware
- Very old SSH implementation requires specific legacy algorithms
- No modern cryptographic options available
- Power measurement accuracy depends on mPower calibration
- Cumulative energy field unknown (Phase 4 task)

### Plugin
- Does not use Ubiquiti mFi Controller (deliberately)
- Matter support requires Homebridge 2.0+
- No HomeKit Secure Router compatibility (device too old)

## Related Resources

- [Homebridge Documentation](https://developers.homebridge.io/)
- [Homebridge Plugin Template](https://github.com/homebridge/homebridge-plugin-template)
- [Homebridge Examples](https://github.com/homebridge/homebridge-examples)
- [ssh2 Library (Node.js)](https://github.com/mscdex/ssh2)

## License

Licensed under Apache License 2.0. See [LICENSE](./LICENSE) file.

## Disclaimer

This plugin interfaces with legacy hardware no longer supported by the manufacturer. Use at your own risk. The authors are not responsible for:
- Damage to mPower devices
- Unwanted relay state changes
- Data loss or inaccuracies
- Security issues with obsolete SSH algorithms

## Contributing

Contributions are welcome. Please:

1. Follow the code structure and TypeScript conventions
2. Add tests for new features
3. Ensure no credentials in code, config examples, or logs
4. Update documentation for Phase 0-5 progress

## Support

For issues specific to this plugin, please open an issue on GitHub.

For mPower device access questions, refer to your device's original documentation or try:
```bash
ssh -o 'KexAlgorithms=+diffie-hellman-group1-sha1' \
    -o 'HostKeyAlgorithms=+ssh-rsa' \
    -o PubkeyAcceptedAlgorithms=+ssh-rsa \
    -o 'Ciphers=aes128-cbc' \
    'username@device-ip'
```
