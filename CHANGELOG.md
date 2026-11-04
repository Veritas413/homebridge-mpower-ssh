# Changelog

All notable changes to this project are documented here.

## 1.0.1 - 2026-11-04

- Add Node.js 26 LTS support and CI coverage.
- Refresh development dependencies to remove all critical and high-severity audit findings.
- Update GitHub Actions checkout and Node setup actions to v7.
- Add an npm trusted-publishing release workflow and maintainer release documentation.
- Support Homebridge 2.4 or newer on Node.js 22, 24, or 26.

## 1.0.0

- Control and poll individual mPower relays over SSH.
- Publish relays as HomeKit/HAP outlets or lights.
- Publish native Matter outlets or lights with active power, voltage, and current measurements.
- Protect selected loads with monitoring-only `allowControl: false` mode.
- Reconcile renamed and retyped cached accessories.
- Report offline devices and reconnect with exponential backoff.
- Recover cleanly from SSH command timeouts without blocking other strips.
- Log control requests and outcomes by transport.
- Support password and private-key authentication with the legacy algorithms required by mPower hardware.

### Compatibility notes

- Requires Homebridge 2.4 or newer and a supported Node.js 22 or 24 release.
- Apple Home may require its Matter bridge to be removed and re-paired to rediscover newly added Matter capabilities. Re-pairing can reset rooms, scenes, and automations for accessories on that bridge.
