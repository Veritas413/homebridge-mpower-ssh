# Architecture & Design Document

## Project Structure

```
homebridge-mpower-ssh/
├── src/
│   ├── index.ts                    # Plugin entry point (Phase 2)
│   ├── settings.ts                 # Plugin constants
│   ├── logger.ts                   # Secure logging (no credential leakage)
│   ├── probe.ts                    # CLI diagnostic utility (Phase 1)
│   │
│   ├── ssh/
│   │   ├── types.ts               # SSH connection configuration types
│   │   ├── algorithms.ts          # Legacy algorithm configuration
│   │   └── client.ts              # SSH2 transport abstraction (Phase 1)
│   │
│   ├── mpower/
│   │   ├── parser.ts              # Output parsing (relay, power, voltage) (Phase 1)
│   │   ├── device.ts              # Device abstraction layer (Phase 2)
│   │   └── config.ts              # Device configuration types (Phase 2)
│   │
│   ├── platform.ts                # Dynamic platform class (Phase 2)
│   ├── platformAccessory.ts       # HAP accessory implementation (Phase 2)
│   │
│   └── matter/
│       └── outlet.ts              # Matter OnOffOutlet device (Phase 3)
│
├── test/
│   ├── ssh/
│   │   ├── algorithms.test.ts     # Legacy algorithm tests (Phase 1)
│   │   └── client.test.ts         # SSH client tests (Phase 2)
│   │
│   ├── mpower/
│   │   └── parser.test.ts         # Output parsing tests (Phase 1)
│   │
│   └── config/
│       └── validator.test.ts      # Config validation tests (Phase 2)
│
├── config.schema.json             # Homebridge UI configuration (Phase 2)
├── tsconfig.json
├── jest.config.js
├── eslint.config.js
├── package.json
├── LICENSE
├── README.md
└── ARCHITECTURE.md (this file)
```

## Layer Separation

The plugin is designed with clear separation of concerns:

### Transport Layer (SSH)
- **`ssh/types.ts`**: Configuration types for authentication and connection
- **`ssh/algorithms.ts`**: Legacy algorithm configuration with security documentation
- **`ssh/client.ts`**: SSH2 transport abstraction
  - Manages connection lifecycle
  - Executes remote commands
  - Handles errors safely (no credential logging)
  - Implements reconnection logic

**Key Design:**
- No credentials stored in client state
- All logging redacted via `Logger` wrapper
- Single SSH connection per device (efficient for polling)
- Timeout handling at connection and command level

### Device Layer (mPower)
- **`mpower/parser.ts`**: Pure parsing functions for relay state and metrics
  - Relay state: "0" → false, "1" → true
  - Power metrics: watts, voltage, current, power factor
  - Multi-field parsing for efficient polling
  - Robust error handling (one bad field doesn't break others)

- **`mpower/device.ts`** (Phase 2): High-level device abstraction
  - Manages SSH connection to a physical mPower
  - Implements polling logic
  - Provides typed interface for relay control and metrics
  - Caches state appropriately
  - Handles reconnection transparently

### Platform Layer (Homebridge/HAP)
- **`platform.ts`** (Phase 2): Dynamic platform plugin
  - Manages multiple devices
  - Handles configuration
  - Creates/removes accessories as needed
  - Persists accessory identity across restarts

- **`platformAccessory.ts`** (Phase 2): HAP accessory
  - Maps relay to Switch/Outlet service
  - Handles on/off commands
  - Updates state from polling
  - Publishes characteristics

### Matter Layer
- **`matter/outlet.ts`** (Phase 3): Matter OnOffOutlet
  - Similar structure to HAP but using Matter API
  - Includes `ElectricalPowerMeasurement` cluster
  - Publishes active power, voltage, current
  - Energy measurement (Phase 4, if hardware supports it)

## Configuration Flow

### Example config.json

```json
{
  "platform": "mPowerSSH",
  "name": "mPower SSH",
  "auth": {
    "method": "password",
    "username": "admin",
    "password": "ACTUAL_PASSWORD"
  },
  "pollInterval": 10,
  "devices": [
    {
      "host": "192.168.1.50",
      "port": 22,
      "name": "Workshop mPower",
      "outlets": [
        {
          "relay": 1,
          "name": "Workbench Light",
          "powerMonitoring": true
        },
        {
          "relay": 2,
          "name": "Tool Outlet",
          "powerMonitoring": true
        }
      ]
    }
  ]
}
```

### Config Validation (Phase 2)

The configuration validator should check:

1. **Platform level:**
   - `auth` is required and valid (password or privateKey)
   - If password: `password` field is present
   - If privateKey: `keyPath` is readable
   - `pollInterval` is between MIN and MAX

2. **Device level:**
   - `host` is non-empty
   - `outlets` array is non-empty
   - Device credentials (if overridden) are valid

3. **Outlet level:**
   - `relay` is positive integer (1, 2, 3, ...)
   - `relay` is unique within device
   - `name` is non-empty

## SSH Connection Management

### Single Connection Per Device

```
mPowerSSHPlatform
  └── mPowerDevice (instance per physical device)
      └── SSHClient (one connection)
          ├── Relay 1 polling
          ├── Relay 2 polling
          └── Relay 3 polling
```

One SSH connection per physical device is more efficient than a connection-per-outlet.

### Command Batching

For efficient polling, commands can be batched:

```
Polling interval tick
  └── Single SSH exec combining multiple queries
      └── cat /proc/power/relay1; cat /proc/power/active_pwr1; ...
      └── Parse all results in one pass
      └── Update all outlets
```

### Reconnection Strategy

```
Connection established
  ↓ [connection lost or timeout]
  ↓ Reconnect attempt 1 (wait 2s)
  ↓ Reconnect attempt 2 (wait 2s)
  ↓ ...
  ↓ Max 5 attempts
  ↓ [give up, log error, retry on next poll]
```

Key points:
- Bounded backoff (exponential jitter could be added later)
- Don't hammer offline devices
- One device offline doesn't affect others
- Automatic recovery when device comes back online

## State Management

### Relay State

Two sources of truth:

1. **Physical state** (from `/proc/power/relayN`)
   - Polled every `pollInterval` seconds
   - Used to initialize accessory on startup
   - Used to detect external changes
   - Published to HomeKit on each poll

2. **User command** (from HomeKit)
   - Remote command executed immediately
   - Expected state updated optimistically
   - Actual state confirmed on next poll

**Key Design:**
- Never assume command was successful
- Next poll verifies actual state
- If physical state differs, accessory updates
- Logs external changes for debugging

### Power Metrics

If power monitoring is enabled:

1. **Polled** every `pollInterval` seconds
2. **Cached** to avoid excessive HomeKit updates
3. **Published** to Matter (Phase 3)
4. **Never cached** for more than one poll cycle

## Testing Strategy

### Unit Tests (Phase 1)

- **Parser tests** (`test/mpower/parser.test.ts`)
  - Relay state parsing: "0" → false, "1" → true
  - Numeric parsing: integers, decimals, scientific notation
  - Error handling: reject NaN, Infinity, garbage
  - Whitespace handling: CR/LF/spaces
  - Multi-field parsing: parse multiple values in one go

- **Algorithm tests** (`test/ssh/algorithms.test.ts`)
  - Verify required algorithms are present
  - Check no unexpected algorithms included

### Integration Tests (Phase 2)

- **SSH client tests** (`test/ssh/client.test.ts`) - uses mocked ssh2
  - Connection/disconnection
  - Command execution
  - Error handling
  - Timeout behavior
  - Credential handling (ensure not logged)

- **Device tests** (`test/mpower/device.test.ts`) - uses mocked SSHClient
  - Relay state GET/SET
  - Polling cycle
  - External state change detection
  - Reconnection behavior

- **Platform tests** (`test/platform.test.ts`) - uses mocked devices
  - Configuration validation
  - Accessory creation/removal
  - State synchronization

### Mocking Strategy

```
Parser tests:
  → No mocking needed (pure functions)

SSH tests:
  → Mock ssh2.Client
  → Simulate success/failure scenarios
  → Test timeout handling

Device tests:
  → Mock SSHClient
  → Simulate network issues
  → Verify polling behavior

Platform tests:
  → Mock mPowerDevice
  → Mock Homebridge API
  → Verify accessory lifecycle
```

## Development Workflow

### Phase 0: Scaffolding ✓
- [x] Project structure
- [x] TypeScript configuration
- [x] Package.json with dependencies
- [x] ESLint/Jest setup
- [x] Type definitions
- [x] Core parsing functions
- [x] Basic SSH types

### Phase 1: SSH + Device Probe ✓ (current)
- [x] SSH client abstraction
- [x] Legacy algorithm configuration
- [x] Command execution
- [x] Parser implementation
- [x] Device probe CLI utility
- [x] Unit tests for parsing

### Phase 2: Homebridge Platform (next)
- [ ] Device abstraction layer (mPowerDevice class)
- [ ] Configuration schema (config.schema.json)
- [ ] Configuration validator
- [ ] Dynamic platform (MPowerSSHPlatform class)
- [ ] HAP Accessory (Switch/Outlet)
- [ ] Polling implementation
- [ ] State synchronization
- [ ] Integration tests
- [ ] Error handling and logging

### Phase 3: Matter Support
- [ ] Matter outlet implementation
- [ ] ElectricalPowerMeasurement cluster
- [ ] Power metric publishing
- [ ] Matter-specific configuration
- [ ] Apple Home testing

### Phase 4: Cumulative Energy
- [ ] Device probe for energy fields
- [ ] Energy parsing
- [ ] Persistent storage for integration
- [ ] ElectricalEnergyMeasurement cluster (if applicable)

### Phase 5: Polish
- [ ] README screenshots
- [ ] Configuration examples
- [ ] Migration guide from ShellSwitch
- [ ] Cleanup logging
- [ ] Test coverage analysis
- [ ] Performance optimization
- [ ] npm package preparation

## Security Considerations

### Credential Handling

**Never:**
- Log passwords, even at debug level
- Include credentials in error messages
- Store credentials in accessory state
- Expose credentials in serialized diagnostics
- Use credentials in shell commands (interpolation risk)

**Implementation:**
- Credentials only used in `SSHClient.buildConnectConfig()`
- All logging routed through `Logger` which redacts sensitive patterns
- Config parser validates but doesn't retain credentials
- Device class receives secrets only at initialization

### SSH Algorithm Security

The mPower requires cryptographically weak algorithms. This is documented extensively:

- README warning
- Algorithm module warning
- Code comments explaining why each is necessary
- Installation documentation warning

### Input Validation

- Relay numbers: positive integer only
- Commands: built from validated numbers (no interpolation)
- Host: used as-is for SSH (no shell metacharacters)
- Passwords/keys: not used in any command constructions

## Performance Notes

### Connection Efficiency
- Single SSH connection per device → efficient
- Command batching during polls → efficient
- Backoff on connection errors → prevents hammering offline devices

### Polling Efficiency
- Configurable interval (default 10 seconds)
- No polling for disconnected devices
- Batch queries reduce round-trips

### Memory
- No unbounded buffers (all output streams drained)
- Timeouts prevent connection leaks
- Periodic cleanup of old state

## Future Enhancements (Out of Scope)

1. **Device Discovery** (mDNS/SSDP)
2. **Web Configuration UI** (Homebridge plugin UI)
3. **Per-outlet Credentials**
4. **Scheduled Relay Scenes** (e.g., turn off at bedtime)
5. **Energy Cost Tracking**
6. **Historical Metrics Storage**
7. **Thread/Thread Border Router** (if mPower gets Thread support)
8. **Multiple SSH Sessions** (if device behavior requires it)

## References

- [Homebridge Developer Docs](https://developers.homebridge.io/)
- [Homebridge Plugin Template](https://github.com/homebridge/homebridge-plugin-template)
- [ssh2 Library Documentation](https://github.com/mscdex/ssh2)
- [RFC 4253 - SSH Transport Layer Protocol](https://tools.ietf.org/html/rfc4253)
