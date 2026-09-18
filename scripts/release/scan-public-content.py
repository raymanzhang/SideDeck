#!/usr/bin/env python3
# Copyright (c) 2026 Rayman Zhang
# SPDX-License-Identifier: AGPL-3.0-only
"""Bounded scan: report file/category only; never print matched secret text."""
from pathlib import Path
import subprocess
import re
import json
patterns = {
    'private-key': rb'-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----',
    'github-token': rb'\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})',
    'aws-key': rb'\b(?:AKIA|ASIA)[A-Z0-9]{16}\b',
    'provider-key': rb'\bsk-(?:ant-)?[A-Za-z0-9_-]{20,}',
    'personal-home': rb'/Users/' + re.escape(Path.home().name.encode()),
}
paths = subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard','-z']).decode().split('\0')
tracked = subprocess.check_output(['git', 'ls-files', '-z']).decode().split('\0')
private_roots = {'.claude', '.codex', '.cursor', '.vscode', 'openspec', 'docs', 'license', 'licenses'}
findings = [{'path': name, 'category': 'internal-project-file'} for name in tracked
            if name and (name.split('/')[0] in private_roots or
                         ('/' not in name and name.startswith('THIRD_PARTY_')))]
count = 0
binary = 0
for name in sorted(set(paths)):
    if not name or not Path(name).is_file(): continue
    count += 1
    data = Path(name).read_bytes()
    if b'\0' in data:
        binary += 1
        continue
    for category, pattern in patterns.items():
        if re.search(pattern, data): findings.append({'path':name,'category':category})
print(json.dumps({'scope':'tracked and unignored untracked working-tree files; excludes binary text and .git', 'files':count,'binary_files_not_text_scanned':binary,'findings':findings},indent=2))
if findings: raise SystemExit(1)
