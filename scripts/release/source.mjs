// Copyright (c) 2026 Rayman Zhang
// SPDX-License-Identifier: AGPL-3.0-only
import { execFileSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
const [commit, tag, output] = process.argv.slice(2);
if (!/^[a-f0-9]{40}$/.test(commit) || !/^v[\w.-]+$/.test(tag)) throw new Error('Invalid source archive inputs');
writeFileSync(output, gzipSync(execFileSync('git', ['archive', '--format=tar', `--prefix=SideDeck-${tag.slice(1)}/`, commit], { maxBuffer: 100 * 1024 * 1024 }), { level: 9 }));
