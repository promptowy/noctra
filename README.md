# noctra

> every tracker on every page: connection refused.

Noctra is a Chromium-based (Electron) browser that blocks ads, trackers and cookie
walls **by default, with no off switch**. No telemetry, no accounts, no token economy.
Isolated colour-coded profiles. One-popup settings.

Made by [Promptowy](https://promptowy.pl).

## download

Latest Windows installer: see [Releases](https://github.com/promptowy/noctra/releases/latest).
Installs per-user (no admin), auto-updates from this repository's releases.

## develop

```
npm install
npm start                # run from source
npm run dist             # build the NSIS installer into release/
```

Useful while developing: `npx electron . --remote-debugging-port=9222`, then
`node tools/cdp-test.js` drives the UI over CDP (navigation, shield, profiles).

## release (maintainer notes)

1. Bump `version` in package.json.
2. `npm run dist` → `release/Noctra-Setup-<version>.exe` + `latest.yml`.
3. Create a GitHub release tagged `v<version>` and upload **both** files
   (`latest.yml` is what installed copies poll for auto-update).
4. The landing-page download button points at
   `releases/latest/download/Noctra-Setup-<version>.exe`.

## code signing (before a big public launch)

Unsigned builds trigger Windows SmartScreen ("unknown publisher"). Options:

- **Certum Open Source Code Signing** (~€25/yr + card reader, Polish CA) — cheapest
  legitimate route for an open-source project; validates an individual developer.
- **Azure Trusted Signing** (~$9.99/mo) — Microsoft's own service, best SmartScreen
  reputation, requires an Azure account.
- Classic OV certificates (Sectigo/DigiCert resellers, ~€200+/yr).

Once you have a cert, electron-builder signs automatically via the
`win.certificateSubjectName` / `signtoolOptions` config — one line in package.json.

## license

MIT
