// Copyright (c) 2026 Rayman Zhang
// SPDX-License-Identifier: AGPL-3.0-only

import { test, expect, type Page } from "@playwright/test";
import { activityFixture, accountFixture } from "../fixtures/activity";
async function start(page: Page) {
  await page.setViewportSize({ width: 800, height: 500 });
  await page.goto("/tests/fixture.html");
  await expect
    .poll(() => page.evaluate(() => (window as any).systemListenerCount()))
    .toBe(1);
}
async function push(page: Page, data: ReturnType<typeof activityFixture>) {
  await page.evaluate(
    (data) => (window as any).pushProvider("codex", data),
    data,
  );
}
async function codex(page: Page) {
  await page.getByRole("button", { name: /^AI Tools/ }).click();
  await page.getByRole("button", { name: /^Codex/ }).click();
}
test("hidden badge navigates; viewing preserves pending; new request and resolution", async ({
  page,
}) => {
  await start(page);
  const d = activityFixture();
  await push(page, d);
  await expect(
    page.getByRole("button", { name: /AI Tools.*1 pending.*New/ }),
  ).toBeVisible();
  await codex(page);
  const card = page.locator('[data-session="alpha"]');
  await expect(card.locator(".activity-status")).toHaveClass(
    /attention-breathe/,
  );
  await card.click();
  await expect(
    page.getByRole("region", { name: "Task alpha details" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Back/ }).click();
  await expect(card).toBeFocused();
  await expect(card.locator(".activity-status")).not.toHaveClass(
    /attention-breathe/,
  );
  await expect(
    page.getByRole("button", { name: /Codex.*1 pending/ }),
  ).toBeVisible();
  d.telemetry!.alpha.episodes.push({
    id: "request-2",
    kind: "waitingOnUserInput",
    startedAt: Date.now(),
  });
  d.sampledAt = Date.now();
  await push(page, d);
  await expect(card.locator(".activity-status")).toHaveClass(
    /attention-breathe/,
  );
  await card.click();
  d.telemetry!.alpha.episodes.push({
    id: "request-3",
    kind: "waitingOnUserInput",
    startedAt: Date.now(),
  });
  d.sampledAt = Date.now();
  await push(page, d);
  await expect(
    page.getByRole("button", { name: "Mark 1 request(s) viewed" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Back/ }).click();
  d.telemetry!.alpha.state = "active";
  d.telemetry!.alpha.episodes = [];
  d.sampledAt = Date.now();
  await push(page, d);
  await expect(
    page.getByRole("button", { name: /Codex.*pending/ }),
  ).toHaveCount(0);
});
test("detail survives switching tools and disappearance; fallback focus is reachable", async ({
  page,
}) => {
  await start(page);
  const d = activityFixture();
  await push(page, d);
  await codex(page);
  await page.locator('[data-session="alpha"]').click();
  await page.getByRole("button", { name: /^Claude/ }).click();
  await expect(
    page.getByRole("region", { name: "Task alpha details" }),
  ).not.toBeVisible();
  await page.getByRole("button", { name: /^Codex/ }).click();
  await expect(
    page.getByRole("region", { name: "Task alpha details" }),
  ).toBeVisible();
  d.threads = d.threads.filter((t) => t.id !== "alpha");
  delete d.telemetry!.alpha;
  d.sampledAt = Date.now();
  await push(page, d);
  await expect(
    page.getByText("Session unavailable · last snapshot"),
  ).toBeVisible();
  await page.getByRole("button", { name: /Back/ }).click();
  await expect(
    page.getByRole("heading", { name: "Codex activity" }),
  ).toBeFocused();
});
test("stale provider and reconnect preserve viewed; animations off and reduced motion", async ({
  page,
}) => {
  await start(page);
  await page.clock.install();
  const d = activityFixture();
  await push(page, d);
  await codex(page);
  const status = page.locator('[data-session="alpha"] .activity-status');
  await page.clock.fastForward(16000);
  await expect(status).not.toHaveClass(/attention-breathe/);
  await expect(status).toContainText("Last known");
  d.sampledAt = await page.evaluate(() => Date.now());
  await push(page, d);
  await expect(status).toHaveClass(/attention-breathe/);
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(await status.evaluate((e) => getComputedStyle(e).animationName)).toBe(
    "none",
  );
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Attention animations: On" }).click();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  expect(await status.evaluate((e) => getComputedStyle(e).animationName)).toBe(
    "none",
  );
  await page.locator('[data-session="alpha"]').click();
  await page.getByRole("button", { name: /Back/ }).click();
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => (window as any).systemListenerCount()))
    .toBe(1);
  d.sampledAt = await page.evaluate(() => Date.now());
  await push(page, d);
  await codex(page);
  await expect(status).not.toHaveClass(/attention-breathe/);
});
test("stable sorting, historical collapse, account details and two-column migration", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      "sys-hud:panel-order",
      '["ai-account","ai-tools","system"]',
    ),
  );
  await start(page);
  const d = activityFixture();
  await push(page, d);
  await page.evaluate(
    (data) => (window as any).pushProvider("openai-usage", data),
    accountFixture,
  );
  await codex(page);
  const before = await page
    .locator("[data-session]")
    .evaluateAll((nodes) => nodes.map((n) => n.getAttribute("data-session")));
  d.threads.reverse();
  d.sampledAt = Date.now();
  await push(page, d);
  expect(
    await page
      .locator("[data-session]")
      .evaluateAll((nodes) => nodes.map((n) => n.getAttribute("data-session"))),
  ).toEqual(before);
  await expect(page.locator('[data-session="gamma"]')).toHaveCount(0);
  await page.getByRole("button", { name: /Show history/ }).click();
  await expect(page.locator('[data-session="gamma"]')).toBeVisible();
  await page
    .getByRole("button", { name: /Current signed-in account.*quota warning/ })
    .click();
  await expect(
    page.getByRole("region", { name: "OpenAI account details" }),
  ).toBeVisible();
  await expect(page.getByText("5h:", { exact: false })).toContainText("92%");
  await expect(page.getByText(/Balance|Remaining \/ total/)).toHaveCount(0);
  await page.getByRole("button", { name: /Back/ }).click();
  await page.setViewportSize({ width: 2550, height: 400 });
  await expect(page.locator(".dashboard")).toHaveAttribute("data-columns", "2");
  await expect(page.locator(".panel-slot")).toHaveCount(2);
  expect(
    await page
      .locator(".panel-slot")
      .evaluateAll((nodes) => nodes.map((n) => n.getAttribute("data-panel"))),
  ).toEqual(["ai-tools", "system"]);
});

test("activity details retain scroll and touch targets across sizes and short screens", async ({
  page,
}, info) => {
  await start(page);
  const d = activityFixture();
  for (let i = 0; i < 8; i++) {
    const id = `extra-${i}`;
    d.threads.push({ ...d.threads[1], id, name: `Extra ${i}` });
    d.telemetry![id] = { ...d.telemetry!.beta, threadId: id, state: "idle" };
  }
  await push(page, d);
  await codex(page);
  for (const [size, width, height] of [
    ["standard", 800, 400],
    ["large", 1280, 432],
    ["extra-large", 1920, 576],
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
    await page.setViewportSize({ width, height });
    await expect(page.locator(".dashboard")).toHaveAttribute(
      "data-columns",
      width === 800 ? "1" : "2",
    );
    await expect(page.locator(".panel-slot")).toHaveCount(2);
    const targets = await page
      .locator('[data-panel="ai-tools"] button:visible:not(:disabled)')
      .evaluateAll((nodes) =>
        nodes.map((n) => ({
          w: n.getBoundingClientRect().width,
          h: n.getBoundingClientRect().height,
        })),
      );
    const minimum = { standard: 48, large: 56, "extra-large": 64 }[size];
    expect(targets.every((t) => t.w >= minimum && t.h >= minimum)).toBe(true);
    await expect(
      page.getByRole("button", { name: "Show all recent" }),
    ).toBeVisible();
    await page.screenshot({
      path: info.outputPath(`activity-${size}-${width}.png`),
    });
  }
  await page.getByRole("button", { name: "Show all recent" }).click();
  const card = page.locator('[data-session="extra-7"]');
  await card.scrollIntoViewIfNeeded();
  const overview = page.locator(".tool-view:visible > .page-scroll");
  const before = await overview.evaluate((e) => e.scrollTop);
  expect(before).toBeGreaterThan(0);
  await card.focus();
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: /Back/ }).click();
  await expect(card).toBeFocused();
  expect(await overview.evaluate((e) => e.scrollTop)).toBe(before);
});
