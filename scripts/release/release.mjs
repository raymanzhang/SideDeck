// Copyright (c) 2026 Rayman Zhang
// SPDX-License-Identifier: AGPL-3.0-only
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, basename } from 'node:path';
import { pathToFileURL } from 'node:url';

const fail = (message) => { throw new Error(message); };
const requireThat = (condition, message) => { if (!condition) fail(message); };
const read = (path) => JSON.parse(readFileSync(path, 'utf8'));
export const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
export const repository = 'https://github.com/raymanzhang/SideDeck';
const semver = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
export function checkVersion(root, tag) {
  requireThat(semver.test(tag), 'Invalid release tag');
  const version = tag.slice(1);
  const pkg = read(`${root}/package.json`), lock = read(`${root}/package-lock.json`);
  const tauri = read(`${root}/src-tauri/tauri.conf.json`);
  requireThat(/^[1-9]\d*$/.test(tauri.bundle?.macOS?.bundleVersion), 'macOS numeric build version missing');
  const plist = readFileSync(`${root}/src-tauri/Info.plist`, 'utf8');
  requireThat(plist.match(/<key>CFBundleShortVersionString<\/key>\s*<string>([^<]+)<\/string>/)?.[1] === version.split('-')[0], 'macOS short version mismatch');
  const cargo = readFileSync(`${root}/src-tauri/Cargo.toml`, 'utf8');
  const cargoLock = readFileSync(`${root}/src-tauri/Cargo.lock`, 'utf8');
  const versions = [pkg.version, lock.version, lock.packages[''].version, tauri.version,
    cargo.match(/^version = "([^"]+)"/m)?.[1], cargoLock.match(/name = "sidedeck"\nversion = "([^"]+)"/)?.[1]];
  requireThat(versions.every(v => v === version), 'Tag/package/lockfile version mismatch');
  requireThat(pkg.homepage === repository && pkg.repository?.url === `${repository}.git` && cargo.includes(`repository = "${repository}"`), 'Repository/source link missing or placeholder');
  const changelog = readFileSync(`${root}/CHANGELOG.md`, 'utf8');
  requireThat(changelog.includes(`## ${version}\n`), 'Version missing from changelog');
  requireThat(changelog.includes(`${repository}/tree/${tag}`), 'Version source link missing from changelog');
  requireThat(pkg.license === 'AGPL-3.0-only' && cargo.includes('license = "AGPL-3.0-only"'), 'License mismatch');
  return version;
}
export function verifyManifest(manifest, directory, tag, commit) {
  requireThat(manifest.schema === 1 && manifest.tag === tag && manifest.commit === commit, 'Manifest tag/commit mismatch');
  requireThat(/^[a-f0-9]{40}$/.test(commit), 'Invalid commit SHA');
  requireThat(manifest.validation?.commit === commit && manifest.validation?.result === 'passed', 'Tag commit validation missing or mismatched');
  requireThat(String(manifest.validation.run) === String(manifest.run) && /^\d+$/.test(String(manifest.run)), 'Validation run mismatch');
  requireThat(manifest.files?.length > 1, 'Empty asset manifest');
  const names = new Set();
  for (const file of manifest.files) {
    requireThat(file.name === basename(file.name) && /^[\w.-]+$/.test(file.name) && !names.has(file.name), 'Unsafe or duplicate asset name');
    names.add(file.name);
    requireThat(/^[a-f0-9]{64}$/.test(file.sha256), 'Invalid asset digest');
    requireThat(sha256(`${directory}/${file.name}`) === file.sha256, `Asset digest mismatch: ${file.name}`);
    requireThat(file.kind === 'source' || file.kind === 'dmg', 'Unknown asset type');
    if (file.kind === 'dmg') requireThat(['aarch64', 'x86_64'].includes(file.arch) && file.signed === true && file.notarized === true && file.stapled === true, 'Signing evidence missing');
  }
  requireThat(manifest.files.filter(f => f.kind === 'source').length === 1, 'Expected exactly one source archive');
  const archs = manifest.files.filter(f => f.kind === 'dmg').map(f => f.arch);
  requireThat(archs.length && new Set(archs).size === archs.length, 'Missing or duplicate architecture');
  const actual = readdirSync(directory).filter(n => !['manifest.json', 'SHA256SUMS'].includes(n)).sort();
  requireThat(JSON.stringify(actual) === JSON.stringify([...names].sort()), 'Asset set differs from manifest');
  const sums = manifest.files.map(f => `${f.sha256}  ${f.name}\n`).join('');
  requireThat(readFileSync(`${directory}/SHA256SUMS`, 'utf8') === sums, 'Checksum list differs from manifest');
}
const basic = ['download', 'signature', 'gatekeeper', 'install', 'finder', 'about', 'sourceLink', 'upgradePreferences', 'icons', 'cliDiscovery', 'authFailureIsolation'];
const hardware = ['fullscreen', 'spaces', 'sleep', 'scaling', 'displayUnplug'];
export function gate(manifest, acceptance, channel, selected) {
  requireThat(['prerelease', 'stable'].includes(channel), 'Invalid channel');
  requireThat(semver.test(manifest.tag), 'Invalid tag');
  requireThat(channel === 'prerelease' ? manifest.tag.includes('-') : !manifest.tag.includes('-'), 'Version/channel mismatch');
  requireThat(acceptance.schema === 1 && acceptance.tag === manifest.tag && acceptance.commit === manifest.commit, 'Acceptance tag/commit mismatch');
  requireThat(acceptance.authorized === true, 'Publication not authorized');
  requireThat(acceptance.publicContent === 'passed' && acceptance.licenses === 'passed', 'Public content/license review incomplete');
  requireThat(acceptance.designCompatibility === 'passed', 'Design compatibility review incomplete');
  requireThat(acceptance.olderSystems === 'untested-user-validation', 'Disclose older-system validation policy');
  requireThat(acceptance.fatalIssues === false && typeof acceptance.disclosure === 'string' && acceptance.disclosure.trim(), 'Missing disclosure or fatal issue present');
  requireThat(selected.length > 0 && new Set(selected).size === selected.length, 'Empty/duplicate selected architectures');
  const source = manifest.files.find(f => f.kind === 'source');
  requireThat(acceptance.source?.sha256 === source?.sha256 && acceptance.source?.commit === manifest.commit && acceptance.source?.contentsVerified === true, 'Source archive acceptance mismatch');
  for (const arch of selected) {
    const asset = manifest.files.find(f => f.arch === arch && f.kind === 'dmg');
    const evidence = acceptance.architectures?.[arch];
    requireThat(asset && evidence?.sha256 === asset.sha256, `Missing/stale acceptance: ${arch}`);
    requireThat(evidence.os && evidence.device && evidence.testedBy && evidence.date, `Missing device evidence: ${arch}`);
    requireThat(basic.every(k => evidence.checks?.[k] === 'passed'), `Basic acceptance incomplete: ${arch}`);
    requireThat(evidence.checks?.currentSystem === 'passed', `Current-system acceptance incomplete: ${arch}`);
    requireThat(Array.isArray(evidence.integrations) && evidence.integrations.length === 2, `No supported integration scope: ${arch}`);
    const ids = new Set();
    for (const i of evidence.integrations) {
      requireThat(['claude', 'codex'].includes(i.provider) && !ids.has(i.provider), 'Invalid/duplicate integration provider'); ids.add(i.provider);
      requireThat(i.cliVersion && i.installMethod && i.loginMethod && i.backgroundService && i.evidence, 'Missing authenticated integration details');
      requireThat(i.sessions === 'passed' && i.account === 'passed' && i.keychainDenied === 'passed' && i.loggedOut === 'passed' && i.unsupported === 'passed', 'Authenticated integration acceptance incomplete');
    }
    requireThat(ids.has('claude') && ids.has('codex'), 'Both declared provider integrations require evidence');
    if (channel === 'stable') requireThat(hardware.every(k => evidence.checks?.[k] === 'passed'), `T8 acceptance incomplete: ${arch}`);
    else requireThat(hardware.every(k => ['passed', 'failed', 'not tested'].includes(evidence.checks?.[k])), 'Disclose every T8 check');
  }
  return manifest.files.filter(f => f.kind === 'source' || selected.includes(f.arch));
}
export function createManifest(directory, tag, commit, run, attempt) {
  checkVersion('.', tag);
  const files = readdirSync(directory).sort().filter(n => n.endsWith('.dmg') || n.endsWith('.tar.gz')).map(name => ({
    name, sha256: sha256(`${directory}/${name}`),
    ...(name.endsWith('.dmg') ? { kind: 'dmg', arch: name.includes('aarch64') ? 'aarch64' : name.includes('x86_64') ? 'x86_64' : fail('Missing architecture'), signed: true, notarized: true, stapled: true } : { kind: 'source' })
  }));
  requireThat(files.filter(f => f.kind === 'dmg').length === 2, 'Both build architectures are required');
  const manifest = { schema: 1, tag, commit, run, attempt, validation: { commit, run, result: 'passed' }, files };
  writeManifest(directory, manifest);
  verifyManifest(manifest, directory, tag, commit);
  return manifest;
}
export function writeManifest(directory, manifest) {
  writeFileSync(`${directory}/manifest.json`, JSON.stringify(manifest, null, 2) + '\n');
  writeFileSync(`${directory}/SHA256SUMS`, manifest.files.map(f => `${f.sha256}  ${f.name}\n`).join(''));
}
export function template(manifest) {
  const checks = Object.fromEntries([...basic, 'currentSystem', ...hardware].map(k => [k, 'not tested']));
  return { schema: 1, tag: manifest.tag, commit: manifest.commit, run: String(manifest.run), attempt: String(manifest.attempt), authorized: false, publicContent: 'not tested', licenses: 'not tested', designCompatibility: 'not tested', olderSystems: 'untested-user-validation', fatalIssues: null, disclosure: '', source: { sha256: manifest.files.find(f => f.kind === 'source').sha256, commit: manifest.commit, contentsVerified: false }, architectures: Object.fromEntries(manifest.files.filter(f => f.kind === 'dmg').map(f => [f.arch, { sha256: f.sha256, os: '', device: '', testedBy: '', date: '', checks, integrations: ['claude', 'codex'].map(provider => ({provider, cliVersion: '', installMethod: '', loginMethod: '', backgroundService: '', evidence: '', sessions: 'not tested', account: 'not tested', keychainDenied: 'not tested', loggedOut: 'not tested', unsupported: 'not tested'})) }])) };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'check') console.log(checkVersion('.', args[0] ?? `v${read('package.json').version}`));
  else if (command === 'manifest') createManifest(...args);
  else if (command === 'template') writeFileSync(args[1], JSON.stringify(template(read(args[0])), null, 2) + '\n');
  else fail('Unknown release command');
}
