// Copyright (c) 2026 Rayman Zhang
// SPDX-License-Identifier: AGPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkVersion, gate, sha256, template, verifyManifest, writeManifest } from '../scripts/release/release.mjs';
const commit = 'a'.repeat(40);
function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'sidedeck-release-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const files = ['aarch64', 'x86_64'].map(arch => ({ name: `SideDeck-0.1.0-alpha.1-${arch}.dmg`, arch, kind: 'dmg', signed: true, notarized: true, stapled: true }));
  files.push({ name: 'SideDeck-0.1.0-alpha.1-source.tar.gz', kind: 'source' });
  for (const file of files) { writeFileSync(join(dir, file.name), file.name); file.sha256 = sha256(join(dir, file.name)); }
  const m = { schema: 1, tag: 'v0.1.0-alpha.1', commit, run: '123', attempt: '1', validation: { commit, run: '123', result: 'passed' }, files };
  writeManifest(dir, m);
  const a = template(m);
  Object.assign(a, { authorized: true, publicContent: 'passed', licenses: 'passed', designCompatibility: 'passed', fatalIssues: false, disclosure: 'macOS 26.5.2 tested; 13.3 design target only; T8 untested.' });
  a.source.contentsVerified = true;
  for (const e of Object.values(a.architectures)) {
    Object.assign(e, { os: '26.5.2', device: 'synthetic test device', testedBy: 'test', date: '2026-09-18' });
    for (const k of Object.keys(e.checks)) if (!['fullscreen', 'spaces', 'sleep', 'scaling', 'displayUnplug'].includes(k)) e.checks[k] = 'passed';
    for (const i of e.integrations) Object.assign(i, { cliVersion: 'test', installMethod: 'test', loginMethod: 'test', backgroundService: 'test', evidence: 'synthetic tests only', sessions: 'passed', account: 'passed', keychainDenied: 'passed', loggedOut: 'passed', unsupported: 'passed' });
  }
  return { dir, m, a };
}
test('real package metadata agrees, invalid tags fail', () => {
  assert.equal(checkVersion('.', 'v0.1.0-alpha.1'), '0.1.0-alpha.1');
  assert.throws(() => checkVersion('.', 'v9.0.0'), /mismatch/);
  assert.throws(() => checkVersion('.', '../bad'), /Invalid/);
});
test('placeholder repository and missing changelog/source link fail', t => {
  const root = mkdtempSync(join(tmpdir(), 'sidedeck-versions-')); t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'src-tauri'));
  for (const f of ['package.json', 'package-lock.json', 'CHANGELOG.md', 'src-tauri/Cargo.toml', 'src-tauri/Cargo.lock', 'src-tauri/tauri.conf.json', 'src-tauri/Info.plist']) copyFileSync(f, join(root, f));
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'))); pkg.homepage = 'https://github.com/OWNER/REPO';
  writeFileSync(join(root, 'package.json'), JSON.stringify(pkg));
  assert.throws(() => checkVersion(root, 'v0.1.0-alpha.1'), /placeholder/);
  copyFileSync('package.json', join(root, 'package.json')); writeFileSync(join(root, 'CHANGELOG.md'), '## 0.1.0-alpha.1\n');
  assert.throws(() => checkVersion(root, 'v0.1.0-alpha.1'), /source link/);
});
test('failed validation or another commit cannot pass manifest verification', t => {
  const { m, dir } = fixture(t);
  for (const validation of [{ ...m.validation, result: 'failed' }, { ...m.validation, commit: 'b'.repeat(40) }, { ...m.validation, run: '999' }]) assert.throws(() => verifyManifest({ ...m, validation }, dir, m.tag, commit));
});
test('qualified prerelease permits only accepted architecture and untested older OS', t => {
  const { m, a, dir } = fixture(t); verifyManifest(m, dir, m.tag, commit);
  delete a.architectures.x86_64;
  assert.deepEqual(gate(m, a, 'prerelease', ['aarch64']).map(f => f.kind), ['dmg', 'source']);
  assert.throws(() => gate(m, a, 'prerelease', ['aarch64', 'x86_64']), /Missing/);
});
test('modified DMG invalidates both bytes and old acceptance', t => {
  const { m, a, dir } = fixture(t);
  writeFileSync(join(dir, m.files[0].name), 'replacement');
  assert.throws(() => verifyManifest(m, dir, m.tag, commit), /digest mismatch/);
  m.files[0].sha256 = sha256(join(dir, m.files[0].name)); writeManifest(dir, m);
  verifyManifest(m, dir, m.tag, commit);
  assert.throws(() => gate(m, a, 'prerelease', ['aarch64']), /stale/);
});
test('identical reupload can reuse digest-bound evidence', t => {
  const { m, a, dir } = fixture(t);
  const name = join(dir, m.files[0].name); const bytes = readFileSync(name); writeFileSync(name, bytes);
  m.run = '456'; m.validation.run = '456'; writeManifest(dir, m);
  verifyManifest(m, dir, m.tag, commit); assert.equal(gate(m, a, 'prerelease', ['aarch64']).length, 2);
});
test('changed source, asset collection, signing or checksum list fail', t => {
  const { m, a, dir } = fixture(t);
  a.source.sha256 = 'f'.repeat(64); assert.throws(() => gate(m, a, 'prerelease', ['aarch64']), /Source/);
  m.files[0].signed = false; assert.throws(() => verifyManifest(m, dir, m.tag, commit), /Signing/); m.files[0].signed = true;
  writeFileSync(join(dir, 'unexpected.dmg'), 'unexpected'); assert.throws(() => verifyManifest(m, dir, m.tag, commit), /Asset set/); rmSync(join(dir, 'unexpected.dmg'));
  writeFileSync(join(dir, 'SHA256SUMS'), 'wrong'); assert.throws(() => verifyManifest(m, dir, m.tag, commit), /Checksum/);
});
test('basic acceptance, authentication and fatal issues never bypassed by prerelease', t => {
  const { m, a } = fixture(t);
  for (const change of [x => x.authorized = false, x => x.licenses = 'not tested', x => x.fatalIssues = true, x => x.architectures.aarch64.checks.finder = 'not tested', x => x.architectures.aarch64.integrations[0].account = 'unavailable', x => x.architectures.aarch64.integrations[0].keychainDenied = 'not tested']) {
    const altered = structuredClone(a); change(altered); assert.throws(() => gate(m, altered, 'prerelease', ['aarch64']));
  }
});
test('stable requires current-system/design/T8 but not old OS runtime', t => {
  const { m, a } = fixture(t); m.tag = a.tag = 'v0.1.0';
  assert.throws(() => gate(m, a, 'stable', ['aarch64']), /T8/);
  for (const k of Object.keys(a.architectures.aarch64.checks)) a.architectures.aarch64.checks[k] = 'passed';
  assert.equal(gate(m, a, 'stable', ['aarch64']).length, 2);
  a.designCompatibility = 'not tested'; assert.throws(() => gate(m, a, 'stable', ['aarch64']), /Design/); a.designCompatibility = 'passed';
  a.architectures.aarch64.checks.currentSystem = 'not tested'; assert.throws(() => gate(m, a, 'stable', ['aarch64']), /Current-system/);
});
test('workflow signing/upload jobs depend on tag SHA validation', () => {
  const w = readFileSync('.github/workflows/release.yml', 'utf8');
  assert.match(w, /build:\n    needs: \[resolve, validate\]/);
  assert.match(w, /draft:\n    needs: \[resolve, validate, build\]/);
  assert.match(w, /ref: \$\{\{ needs.resolve.outputs.sha \}\}/);
  assert.doesNotMatch(readFileSync('.github/workflows/validate.yml', 'utf8'), /secrets\.|secrets: inherit/);
});
