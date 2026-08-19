# Contributing

Issues and pull requests are welcome.

Before submitting a change:

```bash
npm ci
npm run build
npm test -- --runInBand
npm run lint
```

Keep changes focused and add tests for new behavior or bug fixes. Never commit device credentials, private keys, tokens, IP inventories, or unredacted Homebridge configuration and logs.

By contributing, you agree that your contribution is licensed under the Apache License 2.0 used by this project.
