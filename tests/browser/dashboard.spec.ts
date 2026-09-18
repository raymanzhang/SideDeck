// Copyright (c) 2026 Rayman Zhang
// SPDX-License-Identifier: AGPL-3.0-only

import { test, expect, type Page } from "@playwright/test";
const metric = (id = 1, cores = 8) => ({
  sample_id: id,
  sampled_at_ms: 1000 + id * 2000,
  sample_gap: id === 1,
  cpu: { overall: 42, cores: Array.from({ length: cores }, (_, i) => i % 101) },
  memory: { used: 8 * 1024 ** 3, total: 16 * 1024 ** 3, percent: 50 },
  disk: { used: 50 * 1024 ** 3, total: 100 * 1024 ** 3, percent: 50 },
  network: {
    rx_rate: id === 1 ? null : 10 * 1024 ** 2,
    tx_rate: id === 1 ? null : 1024 ** 2,
  },
  temperature: { cpu: null },
  battery: null,
});
async function push(page: Page, data: unknown) {
  await page.evaluate((data) => (window as any).pushMetrics(data), data);
}
async function start(page: Page, size = "large", width = 1280, height = 432) {
  await page.setViewportSize({ width, height });
  await page.addInitScript((size) => {
    if (!localStorage.getItem("sys-hud:ui-prefs"))
      localStorage.setItem(
        "sys-hud:ui-prefs",
        JSON.stringify({ version: 1, size }),
      );
  }, size);
  await page.goto("/tests/fixture.html");
  await expect(
    page.getByRole("button", { name: "Settings", exact: true }),
  ).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => (window as any).systemListenerCount()))
    .toBe(1);
  await push(page, metric());
  await push(page, metric(2));
  await page.evaluate(async () => {
    await (window as any).pushProvider("anthropic-usage", {
      status: "ok",
      plan: "Pro",
      daily: {
        usage_percent: 42,
        reset_at: new Date(Date.now() + 3600000).toISOString(),
      },
      weekly: {
        usage_percent: 72,
        reset_at: new Date(Date.now() + 7200000).toISOString(),
      },
    });
    await (window as any).pushProvider("openai-usage", {
      status: "ok",
      quota: {
        status: "ok",
        accountId: null,
        ordinaryUsageAllowed: true,
        buckets: [],
        source: "ipc",
      },
      activity: {
        status: "ok",
        summary: { lifetimeTokens: 1000 },
        dailyUsageBuckets: [],
        source: "ipc",
      },
      sampledAt: Date.now(),
    });
  });
}
for (const size of ["standard", "large", "extra-large"])
  for (const [width, height] of [
    [800, 400],
    [1280, 432],
    [1920, 576],
    [2550, 864],
  ]) {
    test(`${size} ${width}x${height}: sizes, navigation, charts and reachable settings`, async ({
      page,
    }, info) => {
      await start(page, size, width, height);
      const bodySize = {
        standard: "16px",
        large: "18px",
        "extra-large": "20px",
      }[size];
      expect(
        await page
          .locator("#root")
          .evaluate((el) => getComputedStyle(el).fontSize),
      ).toBe(bodySize);
      const target = { standard: 48, large: 56, "extra-large": 64 }[size]!;
      const buttons = await page
        .locator("button:visible:not(:disabled)")
        .evaluateAll((nodes) =>
          nodes.map((n) => ({
            w: n.getBoundingClientRect().width,
            h: n.getBoundingClientRect().height,
          })),
        );
      expect(buttons.every((b) => b.w >= target && b.h >= target)).toBe(true);
      expect(
        await page
          .locator("body")
          .evaluate((el) => el.scrollWidth <= innerWidth),
      ).toBe(true);
      const body = page.locator('[data-panel="system"] .system-overview');
      const bodyHeight = await body.evaluate((el) => el.clientHeight);
      await expect(body).toHaveAttribute(
        "data-short",
        String(
          bodyHeight < { standard: 380, large: 420, "extra-large": 460 }[size]!,
        ),
      );
      await page.screenshot({
        path: info.outputPath(`${size}-${width}x${height}.png`),
      });
      await page.getByRole("button", { name: "Settings", exact: true }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.getByRole("button", { name: "Close", exact: true }).click();
      await expect(
        page.getByRole("button", { name: "Settings", exact: true }),
      ).toBeFocused();
    });
  }
test("detail and active panel survive 2 → 1; return preserves scroll and focus", async ({
  page,
}) => {
  await start(page, "large", 1920, 576);
  await page
    .locator('[data-panel="system"] .page-scroll')
    .evaluate((el) => (el.scrollTop = el.scrollHeight));
  const card = page.getByRole("button", { name: "Open Temperature details" });
  await card.click();
  await expect(
    page.getByRole("region", { name: "Temperature details" }),
  ).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 432 });
  await page.setViewportSize({ width: 800, height: 400 });
  await expect(
    page.getByRole("region", { name: "Temperature details" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(card).toBeFocused();
  expect(
    await page
      .locator('[data-panel="system"] .system-overview')
      .evaluate((el) => el.scrollTop),
  ).toBeGreaterThan(0);
  await page.getByRole("button", { name: "AI Tools", exact: true }).click();
  await page.setViewportSize({ width: 1600, height: 576 });
  await page.setViewportSize({ width: 1200, height: 432 });
  await expect(page.locator('[data-panel="ai-tools"]')).toBeVisible();
  await expect(page.locator('[data-panel="system"]')).toBeVisible();
  await page.setViewportSize({ width: 800, height: 400 });
  await expect(page.locator('[data-panel="ai-tools"]')).toBeVisible();
});
test("all presets cross thresholds with hysteresis", async ({ page }) => {
  await start(page);
  for (const [size, m] of [
    ["standard", 420],
    ["large", 480],
    ["extra-large", 540],
  ] as const) {
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page
      .getByRole("button", {
        name:
          size === "extra-large"
            ? "Extra large"
            : size === "large"
              ? "Large"
              : "Standard",
        exact: true,
      })
      .click();
    await page.getByRole("button", { name: "Close", exact: true }).click();
    const two = 32 + 2 * m + 12,
      three = 32 + 3 * m + 24;
    for (const [width, columns] of [
      [two - 1, 1],
      [two + 15, 1],
      [two + 16, 2],
      [three + 15, 2],
      [three + 16, 2],
      [three, 2],
      [three - 1, 2],
    ]) {
      await page.setViewportSize({ width, height: 432 });
      await expect(page.locator(".dashboard")).toHaveAttribute(
        "data-columns",
        String(columns),
      );
    }
  }
});
test("synthetic cores, missing sensors, zeros, gaps, pauses and subscription lifetime", async ({
  page,
}) => {
  await start(page, "large", 1920, 576);
  for (const cores of [1, 8, 64, 128]) {
    await push(page, metric(cores + 10, cores));
    await page.getByRole("button", { name: "Open CPU details" }).click();
    await expect(page.locator(".detail-page .core-row")).toHaveCount(cores);
    await page.getByRole("button", { name: "Back", exact: false }).click();
  }
  await push(page, {
    ...metric(200),
    disk: null,
    network: { rx_rate: 0, tx_rate: 0 },
    sample_gap: true,
  });
  await expect(page.locator(".metric-disk")).toContainText("Unavailable");
  await expect(page.locator(".metric-temperature")).toContainText(
    "Unavailable",
  );
  await expect(
    page.getByRole("heading", { name: "Battery", exact: true }),
  ).toHaveCount(0);
  expect(
    await page
      .locator("svg path")
      .evaluateAll((nodes) =>
        nodes.some((n) => /NaN|Infinity/.test(n.getAttribute("d") ?? "")),
      ),
  ).toBe(false);
  await expect(page.locator(".metric-network")).toContainText("0 B/s");
  await expect
    .poll(() => page.evaluate(() => (window as any).systemListenerCount()))
    .toBe(1);
  await page.clock.install();
  await page.clock.fastForward(7000);
  await expect(
    page.getByText("Paused — showing last values", { exact: true }),
  ).toBeVisible();
  await push(page, metric(201));
  await expect(
    page.getByText("Paused — showing last values", { exact: true }),
  ).toHaveCount(0);
});
test("settings, keyboard reorder, persistence, failed writes and session details", async ({
  page,
}) => {
  await start(page, "large", 800, 400);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Extra large", exact: true }).click();
  await page.getByRole("button", { name: "Edit layout", exact: true }).click();
  const later = page.getByRole("button", { name: "Move System later" });
  await later.focus();
  await page.keyboard.press("Enter");
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("sys-hud:panel-order:v2")!).order,
    ),
  ).toEqual(["ai-tools", "system"]);
  await page.getByRole("button", { name: "Done editing", exact: true }).click();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute(
    "data-size",
    "extra-large",
  );
  expect(
    await page
      .locator(".panel-slot")
      .evaluateAll((nodes) =>
        nodes.map((node) => (node as HTMLElement).dataset.panel),
      ),
  ).toEqual(["ai-tools", "system"]);
  await page.getByRole("button", { name: "AI Tools", exact: true }).click();
  await page.evaluate(() =>
    (window as any).pushProvider("claude", {
      status: "ok",
      sessions: Array.from({ length: 12 }, (_, i) => ({
        session_id: `s${i}`,
        cwd: `/projects/very/long/path/project${i}`,
        started_at: "2026-09-17T01:00:00Z",
        status: "running",
        session_type: "cli",
      })),
      recent_events: {},
    }),
  );
  const session = page.getByRole("button", { name: /project11/ });
  await session.click();
  await expect(
    page.getByRole("region", { name: "Claude · s11 details" }),
  ).toBeVisible();
  await expect(
    page.getByText("/projects/very/long/path/project11", { exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(session).toBeFocused();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw Error("quota");
    };
  });
  await page.getByRole("button", { name: "Standard", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "could not be saved" }),
  ).toContainText("could not be saved");
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Settings", exact: true }),
  ).toBeFocused();
  await expect(page.locator("html")).toHaveAttribute("data-size", "standard");
});

test("browser preview keeps settings usable with desktop commands unavailable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 800, height: 400 });
  await page.goto("/");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(
    page.getByText("Desktop settings unavailable in browser preview."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Always on top:/ }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Standard", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-size", "standard");
});

test("mounted volumes and labelled fallback temperature update live", async ({ page }) => {
  await start(page, "large", 1280, 720);
  const internal = { name: "System", mount_point: "/", used: 50 * 1024 ** 3, total: 100 * 1024 ** 3, percent: 50 };
  const external = { name: "External", mount_point: "/Volumes/External", used: 200 * 1024 ** 3, total: 1000 * 1024 ** 3, percent: 20 };
  await push(page, { ...metric(3), disks: [internal, external], temperature: { cpu: null, value: 54, sensor: "PMU tdie2", kind: "other" } });
  await expect(page.locator(".metric-disk .volume-metric")).toHaveCount(2);
  await expect(page.locator(".metric-disk")).toContainText("External");
  await expect(page.locator(".metric-temperature")).toContainText("54°C");
  await expect(page.locator(".metric-temperature")).toContainText("PMU tdie2");
  await page.getByRole("button", { name: "Open Disk details" }).click();
  await expect(page.locator(".detail-page")).toContainText("/Volumes/External");
  await page.getByRole("button", { name: "Back", exact: false }).click();
  await page.getByRole("button", { name: "Open Temperature details" }).click();
  await expect(page.locator(".detail-page")).toContainText("not identified as CPU / SoC temperature");
  await page.getByRole("button", { name: "Back", exact: false }).click();
  await push(page, { ...metric(4), disks: [internal] });
  await expect(page.locator(".metric-disk .volume-metric")).toHaveCount(1);
  await expect(page.locator(".metric-disk")).not.toContainText("External");
  await expect(page.locator(".metric-temperature")).toContainText("Unavailable");
});
