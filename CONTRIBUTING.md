# Contributing

Use the Node version in `.nvmrc` and Rust toolchain in `rust-toolchain.toml`.
On macOS, install the Xcode command-line tools. Then run:

```sh
npm ci
npx playwright install chromium webkit
npm test
npm run test:release
npm run test:browser
npm run build
cargo test --locked --manifest-path src-tauri/Cargo.toml
```

Describe the problem, the observable change, and the checks performed. Keep
the application identifier and existing preference keys compatible. New
SideDeck-owned source uses the Rayman Zhang copyright and AGPL-3.0-only SPDX
header. Preserve third-party notices and generated-file boundaries.

Report issues at https://github.com/raymanzhang/SideDeck/issues with app version,
OS version, architecture, CLI version/installation method where relevant,
reproduction steps, expected/actual behavior, and whether this is a source
build or installed release. Use invented session IDs, prompts, and paths.
Redact credentials, account identifiers, private project names, display serials,
and filesystem paths from logs and screenshots. Never attach Keychain exports,
authentication files, raw session logs, or signing credentials. For suspected
security issues, use GitHub private vulnerability reporting if enabled; do not
post sensitive exploit data or credentials in a public issue.

Passing automated tests is not hardware acceptance. Record untested devices
and authenticated integration paths honestly; do not check off physical tests
based on mocks or compilation alone.
