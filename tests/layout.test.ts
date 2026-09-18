// Copyright (c) 2026 Rayman Zhang
// SPDX-License-Identifier: AGPL-3.0-only

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calculateLayout,
  PANEL_WIDTH,
  SHORT_HEIGHT,
  visiblePanels,
} from "../src/state/dashboardLayout.ts";
import {
  readUiSize,
  saveUiSize,
  UI_PREFS_KEY,
} from "../src/state/uiPreferences.ts";
test("all presets honor exact thresholds, hysteresis, short heights and multi-column jumps", () => {
  for (const size of ["standard", "large", "extra-large"] as const) {
    const m = PANEL_WIDTH[size];
    const two = 32 + 2 * m + 12,
      three = 32 + 3 * m + 24;
    assert.equal(calculateLayout(two - 1, 500, size).columns, 1);
    assert.equal(calculateLayout(two, 500, size).columns, 2);
    assert.equal(calculateLayout(two + 15, 500, size, 1).columns, 1);
    assert.equal(calculateLayout(two + 16, 500, size, 1).columns, 2);
    assert.equal(calculateLayout(three + 15, 500, size, 2).columns, 2);
    assert.equal(calculateLayout(three + 16, 500, size, 2).columns, 2);
    assert.equal(calculateLayout(three, 500, size, 2).columns, 2);
    assert.equal(calculateLayout(three - 1, 500, size, 2).columns, 2);
    assert.equal(calculateLayout(3000, 500, size, 1).columns, 2);
    assert.equal(calculateLayout(300, 500, size, 2).columns, 1);
    assert.equal(
      calculateLayout(1200, SHORT_HEIGHT[size] - 1, size).shortHeight,
      true,
    );
    assert.equal(
      calculateLayout(1200, SHORT_HEIGHT[size], size).shortHeight,
      false,
    );
  }
});
test("large reference widths and active panel selection survive shrinking and reorder", () => {
  assert.deepEqual(
    [900, 1200, 1600].map((w) => calculateLayout(w, 420, "large").columns),
    [1, 2, 2],
  );
  const order = ["system", "ai-tools"] as const;
  for (const columns of [2, 1] as const)
    assert.ok(
      visiblePanels([...order], "ai-tools", columns).includes("ai-tools"),
    );
  assert.deepEqual(visiblePanels([...order], "ai-tools", 2), [
    "system",
    "ai-tools",
  ]);
  assert.deepEqual(visiblePanels([...order], "system", 2, "ai-tools"), [
    "system",
    "ai-tools",
  ]);
  assert.deepEqual(visiblePanels(["ai-tools", "system"], "system", 2), [
    "ai-tools",
    "system",
  ]);
});
test("versioned size preferences reject bad values and never write panel order", () => {
  for (const raw of [
    null,
    "{",
    "{}",
    '{"version":2,"size":"standard"}',
    '{"version":1,"size":"tiny"}',
  ])
    assert.equal(readUiSize({ getItem: () => raw }), "large");
  const values = new Map([
    ["sys-hud:panel-order", '["ai-tools","system","ai-account"]'],
  ]);
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
  assert.equal(saveUiSize(storage, "standard"), null);
  assert.equal(readUiSize(storage), "standard");
  assert.equal(
    values.get("sys-hud:panel-order"),
    '["ai-tools","system","ai-account"]',
  );
  assert.ok(values.has(UI_PREFS_KEY));
  assert.match(
    saveUiSize(
      {
        setItem: () => {
          throw Error("quota");
        },
      },
      "large",
    )!,
    /could not be saved/,
  );
  assert.equal(
    readUiSize({
      getItem: () => {
        throw Error("blocked");
      },
    }),
    "large",
  );
});

test("panel migration filters, backs up and remains idempotent with blocked writes", async () => {
  const { migrateOrder, PANEL_ORDER_KEY, migrateActive } = await import(
    "../src/state/panelOrder.ts"
  );
  for (const raw of [
    '["ai-account","ai-tools","system"]',
    '["ai-tools","ai-tools","broken"]',
  ]) {
    const map = new Map([["sys-hud:panel-order", raw]]);
    const storage = {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => {
        map.set(k, v);
      },
    };
    assert.deepEqual(migrateOrder(storage), ["ai-tools", "system"]);
    assert.deepEqual(migrateOrder(storage), ["ai-tools", "system"]);
    assert.equal(map.get("sys-hud:panel-order:backup"), raw);
    assert.equal(map.get("sys-hud:panel-order"), raw);
    assert.ok(map.has(PANEL_ORDER_KEY));
  }
  assert.deepEqual(
    migrateOrder({
      getItem: () => "{",
      setItem: () => {
        throw Error();
      },
    }),
    ["system", "ai-tools"],
  );
  assert.equal(migrateActive("ai-account"), "ai-tools");
});
