// Copyright (c) 2026 Rayman Zhang
// SPDX-License-Identifier: AGPL-3.0-only

import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser', timeout: 30000, fullyParallel: false,
  use: { baseURL: 'http://127.0.0.1:5174', screenshot: 'only-on-failure' },
  projects: [{name:'chromium',use:{browserName:'chromium'}}, {name:'webkit',use:{browserName:'webkit'}}],
  webServer: { command: 'npm run dev -- --host 127.0.0.1 --port 5174', url: 'http://127.0.0.1:5174', reuseExistingServer: false },
});
