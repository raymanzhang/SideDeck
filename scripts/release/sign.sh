#!/usr/bin/env bash
# Copyright (c) 2026 Rayman Zhang
# SPDX-License-Identifier: AGPL-3.0-only
set -euo pipefail
for key in APPLE_CERTIFICATE APPLE_CERTIFICATE_PASSWORD APPLE_SIGNING_IDENTITY APPLE_ID APPLE_PASSWORD APPLE_TEAM_ID EXPECTED_SHA RELEASE_TAG BUILD_TARGET BUILD_ARCH; do
  test -n "${!key:-}" || { echo "Missing required signing input: $key" >&2; exit 1; }
done
[[ "$APPLE_SIGNING_IDENTITY" == 'Developer ID Application:'* ]] || { echo 'Developer ID Application required' >&2; exit 1; }
test "$(git rev-parse HEAD)" = "$EXPECTED_SHA"
node scripts/release/release.mjs check "$RELEASE_TAG"
keychain="$RUNNER_TEMP/sidedeck-signing.keychain-db"
certificate="$RUNNER_TEMP/sidedeck-signing.p12"
keychain_password=$(openssl rand -hex 32)
echo "::add-mask::$keychain_password"
security list-keychains -d user > "$RUNNER_TEMP/sidedeck-keychains.txt"
cleanup() {
  python3 - <<'PY'
import os, shlex, subprocess
from pathlib import Path
paths = shlex.split(Path(os.environ['RUNNER_TEMP'], 'sidedeck-keychains.txt').read_text())
subprocess.run(['security', 'list-keychains', '-d', 'user', '-s', *paths], check=False)
PY
  security delete-keychain "$keychain" 2>/dev/null || true
  rm -f "$certificate" "$RUNNER_TEMP/sidedeck-keychains.txt"
}
trap cleanup EXIT
printf '%s' "$APPLE_CERTIFICATE" | base64 --decode > "$certificate"
chmod 600 "$certificate"
security create-keychain -p "$keychain_password" "$keychain"
security set-keychain-settings -lut 21600 "$keychain"
security unlock-keychain -p "$keychain_password" "$keychain"
security import "$certificate" -k "$keychain" -P "$APPLE_CERTIFICATE_PASSWORD" -T /usr/bin/codesign -T /usr/bin/security >/dev/null
security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$keychain_password" "$keychain" >/dev/null
security list-keychains -d user -s "$keychain"
# Tauri uses the imported identity; do not ask it to import a second copy.
unset APPLE_CERTIFICATE APPLE_CERTIFICATE_PASSWORD
npm run tauri -- build --target "$BUILD_TARGET" --bundles app -- --locked
app="src-tauri/target/$BUILD_TARGET/release/bundle/macos/SideDeck.app"
codesign --verify --deep --strict --verbose=2 "$app"
codesign -dv --verbose=4 "$app" 2> "$RUNNER_TEMP/sidedeck-signature.txt"
grep -F "Authority=$APPLE_SIGNING_IDENTITY" "$RUNNER_TEMP/sidedeck-signature.txt"
xcrun stapler validate "$app"
spctl --assess --type execute --verbose=2 "$app"
mkdir -p release "$RUNNER_TEMP/sidedeck-dmg"
ditto "$app" "$RUNNER_TEMP/sidedeck-dmg/SideDeck.app"
ln -s /Applications "$RUNNER_TEMP/sidedeck-dmg/Applications"
dmg="release/SideDeck-${RELEASE_TAG#v}-$BUILD_ARCH.dmg"
hdiutil create -volname SideDeck -srcfolder "$RUNNER_TEMP/sidedeck-dmg" -ov -format UDZO "$dmg"
codesign --force --timestamp --sign "$APPLE_SIGNING_IDENTITY" --keychain "$keychain" "$dmg"
xcrun notarytool submit "$dmg" --apple-id "$APPLE_ID" --password "$APPLE_PASSWORD" --team-id "$APPLE_TEAM_ID" --wait --output-format json > "$RUNNER_TEMP/sidedeck-notary.json"
python3 - <<'PY'
import os,json
from pathlib import Path
result=json.loads(Path(os.environ['RUNNER_TEMP'], 'sidedeck-notary.json').read_text())
if result.get('status') != 'Accepted': raise SystemExit('DMG notarization not accepted')
PY
xcrun stapler staple "$dmg"
xcrun stapler validate "$dmg"
codesign --verify --strict --verbose=2 "$dmg"
spctl --assess --type open --context context:primary-signature --verbose=2 "$dmg"
