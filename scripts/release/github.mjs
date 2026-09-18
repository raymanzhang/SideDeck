// Copyright (c) 2026 Rayman Zhang
// SPDX-License-Identifier: AGPL-3.0-only
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { sha256, verifyManifest, gate, writeManifest, template } from './release.mjs';
const repo = process.env.GITHUB_REPOSITORY;
if (repo !== 'raymanzhang/SideDeck') throw new Error('Unexpected repository');
const gh = (...args) => execFileSync('gh', args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'inherit'] });
const api = (path, ...args) => JSON.parse(gh('api', `repos/${repo}/${path}`, ...args));
const manifest = JSON.parse(readFileSync('release/manifest.json', 'utf8'));
const { tag, commit } = manifest;
const mode = process.argv[2];
if (mode === 'promote') rmSync('release/acceptance.json', { force: true });
if (process.env.RELEASE_TAG !== tag) throw new Error('Requested tag/manifest mismatch');
const requireThat = (ok, message) => { if (!ok) throw new Error(message); };
const liveCommit = () => api(`commits/${encodeURIComponent(tag)}`).sha;
requireThat(liveCommit() === commit, 'Remote tag moved or points to another commit');
verifyManifest(manifest, 'release', tag, commit);
const expectedSource = gzipSync(execFileSync('git', ['archive', '--format=tar', `--prefix=SideDeck-${tag.slice(1)}/`, commit], { maxBuffer: 100 * 1024 * 1024 }), { level: 9 });
writeFileSync('expected-source.tar.gz', expectedSource);
requireThat(sha256('expected-source.tar.gz') === manifest.files.find(f => f.kind === 'source').sha256, 'Source archive is not the tag commit contents');
rmSync('expected-source.tar.gz');
const releases = JSON.parse(gh('api', '--paginate', '--slurp', `repos/${repo}/releases`)).flat();
let release = releases.find(r => r.tag_name === tag);
if (mode === 'draft') {
  requireThat(String(manifest.run) === process.env.GITHUB_RUN_ID, 'Manifest from another workflow run');
  requireThat(!release || release.draft, 'Published releases are immutable; use a new version');
  if (!release) {
    release = api('releases', '-X', 'POST', '-f', `tag_name=${tag}`, '-f', `target_commitish=${commit}`, '-f', `name=SideDeck ${tag}`, '-F', 'draft=true', '-F', 'prerelease=true', '-f', 'body=Draft: pending downloaded-package acceptance. See manifest.json and release run artifacts.');
  }
  // A partial retry remains draft. Old acceptance can only match unchanged bytes.
  for (const asset of api(`releases/${release.id}/assets`, '--paginate')) gh('api', '-X', 'DELETE', `repos/${repo}/releases/assets/${asset.id}`);
  gh('release', 'upload', tag, ...manifest.files.map(f => `release/${f.name}`), 'release/manifest.json', 'release/SHA256SUMS', '--repo', repo);
  writeFileSync('acceptance-template.json', JSON.stringify(template(manifest), null, 2) + '\n');
} else if (mode === 'promote') {
  requireThat(release?.draft, 'Only drafts can be promoted; public assets cannot be replaced');
  const run = api(`actions/runs/${manifest.run}`);
  mkdirSync('provenance', { recursive: true });
  gh('run', 'download', String(manifest.run), '--repo', repo, '--name', `release-manifest-${manifest.attempt}`, '--dir', 'provenance');
  const original = JSON.parse(readFileSync('provenance/manifest.json', 'utf8'));
  requireThat(JSON.stringify({ ...manifest, files: [] }) === JSON.stringify({ ...original, files: [] }) && manifest.files.every(f => original.files.some(o => JSON.stringify(o) === JSON.stringify(f))), 'Manifest not produced by the validated build run');
  requireThat(run.head_sha === commit && run.event === 'push' && run.path === '.github/workflows/release.yml' && run.conclusion === 'success', 'No successful release validation for this tag commit');
  const jobs = JSON.parse(gh('api', '--paginate', '--slurp', `repos/${repo}/actions/runs/${manifest.run}/attempts/${manifest.attempt}/jobs`)).flatMap(p => p.jobs);
  requireThat(jobs.some(j => j.name.includes('verify') && j.conclusion === 'success') && !jobs.some(j => j.conclusion !== 'success'), 'Validation/build jobs did not all pass');
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const acceptance = JSON.parse(event.inputs.acceptance);
  const selected = event.inputs.architectures.split(',').map(x => x.trim());
  const files = gate(manifest, acceptance, event.inputs.channel, selected);
  requireThat(/^\d+$/.test(String(acceptance.run)) && /^\d+$/.test(String(acceptance.attempt)), 'Acceptance must reference its original manifest run/attempt');
  // The caller downloaded all assets immediately before this check. No rebuilding.
  const approved = { ...manifest, files };
  mkdirSync('promoted', { recursive: true });
  writeManifest('promoted', approved);
  writeFileSync('promoted/acceptance.json', JSON.stringify(acceptance, null, 2) + '\n');
  const body = `${readFileSync('CHANGELOG.md', 'utf8')}\n\nPublished architectures: ${selected.join(', ')}. Other architectures withheld pending acceptance.\n\n${acceptance.disclosure}\n\nmacOS 13.3: design compatibility target; not tested on older macOS, user validation requested.\n`;
  writeFileSync('release-notes.md', body);
  // Remove unaccepted architecture assets while still draft, then replace only metadata.
  const keep = new Set(files.map(f => f.name));
  for (const asset of api(`releases/${release.id}/assets`, '--paginate')) {
    if (!keep.has(asset.name)) gh('api', '-X', 'DELETE', `repos/${repo}/releases/assets/${asset.id}`);
  }
  gh('release', 'upload', tag, 'promoted/manifest.json', 'promoted/SHA256SUMS', 'promoted/acceptance.json', '--repo', repo);
  requireThat(liveCommit() === commit, 'Tag changed during promotion');
  // Re-download all selected bytes and confirm digests before the single publication mutation.
  mkdirSync('final-check', { recursive: true });
  gh('release', 'download', tag, '--repo', repo, '--dir', 'final-check');
  rmSync('final-check/acceptance.json');
  verifyManifest(JSON.parse(readFileSync('final-check/manifest.json', 'utf8')), 'final-check', tag, commit);
  requireThat(sha256('final-check/manifest.json') === sha256('promoted/manifest.json'), 'Final manifest changed');
  gh('release', 'edit', tag, '--repo', repo, '--draft=false', `--prerelease=${event.inputs.channel === 'prerelease'}`, '--notes-file', 'release-notes.md');
} else throw new Error('Unknown mode');
