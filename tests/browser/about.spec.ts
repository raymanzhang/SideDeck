// Copyright (c) 2026 Rayman Zhang
// SPDX-License-Identifier: AGPL-3.0-only

import { test, expect } from "@playwright/test";
import metadata from "../../package.json" with { type: "json" };

test("about works offline and restores keyboard focus", async ({ page, context }) => {
  await page.goto("/tests/fixture.html");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const trigger = page.getByRole("button", { name: "About SideDeck", exact: true });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const about = page.getByRole("dialog", { name: "About SideDeck" });
  await expect(about).toBeVisible();
  await context.setOffline(true);
  await expect(about).toContainText(`SideDeck ${metadata.version}`);
  await expect(about).toContainText("Rayman Zhang");
  await expect(about).toContainText(`${metadata.homepage}/tree/v${metadata.version}`);
  await about.getByText("Read license offline", { exact: true }).click();
  await expect(about.locator("pre")).toContainText("GNU AFFERO GENERAL PUBLIC LICENSE");
  await expect(about.locator("pre")).toContainText("END OF TERMS AND CONDITIONS");
  await page.keyboard.press("Escape");
  await expect(about).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Settings", exact: true })).toBeFocused();
});

test("about supports touch return", async ({ browser }) => {
  const context = await browser.newContext({ hasTouch: true, viewport: { width: 800, height: 600 } });
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:5174/tests/fixture.html");
  await page.getByRole("button", { name: "Settings", exact: true }).tap();
  await page.getByRole("button", { name: "About SideDeck", exact: true }).tap();
  await page.getByRole("button", { name: "← Back to Settings" }).tap();
  await expect(page.getByRole("button", { name: "About SideDeck", exact: true })).toBeFocused();
  await context.close();
});
