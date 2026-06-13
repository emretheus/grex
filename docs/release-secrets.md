# Release Secrets

Configure these GitHub repository secrets before running the macOS release workflow.

## Required for release creation

- `GITHUB_TOKEN`
  - Provided automatically by GitHub Actions
  - Must have `contents: write` permission in the workflow

## Required for Tauri updater signing

- `TAURI_SIGNING_PRIVATE_KEY`
  - Contents of your Tauri updater private key
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
  - Password used when generating the updater private key
- `GREX_UPDATER_PUBKEY`
  - Public key embedded into the app at build time
- `GREX_UPDATER_ENDPOINTS`
  - Comma-separated updater endpoint list
  - Stable-only default:
    - `https://github.com/emretheus/grex/releases/latest/download/latest.json`

macOS release publication uses the official `tauri-action`. It uploads the signed
updater bundle and generates the `latest.json` manifest consumed by Grex's updater.

## Required for macOS signing and notarization

Signing reuses the `Developer ID Application` certificate stored under the
electron-builder secret names; notarization uses an App Store Connect API key.

- `CSC_LINK`
  - Base64-encoded `.p12` export of your `Developer ID Application` certificate
- `CSC_KEY_PASSWORD`
  - Password used when exporting the `.p12`
- `APPLE_SIGNING_IDENTITY`
  - Example: `Developer ID Application: Your Name (TEAMID)`
- `APPLE_API_ISSUER`
  - App Store Connect API issuer ID (UUID)
- `APPLE_API_KEY_ID`
  - App Store Connect API key ID
- `APPLE_API_KEY`
  - Contents of the `AuthKey_<KEY_ID>.p8` file (raw PEM or base64); the
    workflow writes it to disk and passes it to `notarytool`
- `APPLE_TEAM_ID`
  - Apple Developer Team ID (kept for reference; not required for API-key notarization)

## Local-only files created during setup

The repository now uses ignored `*.local` files for local release setup:

- `tauri-updater-private-key.local`
- `tauri-updater-private-key.local.pub`
- `tauri-updater-password.local`

The macOS release flow imports the `Developer ID Application` certificate
into a temporary keychain before the build starts so nested vendor binaries can
be re-signed consistently both locally and on GitHub Actions.

Keep the private key and password out of source control and back them up securely.
