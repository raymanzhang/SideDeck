// Copyright (c) 2026 Rayman Zhang
// SPDX-License-Identifier: AGPL-3.0-only

import { useLayoutEffect, useRef, useState } from "react";
import { calculateLayout, type Columns } from "../state/dashboardLayout";
import type { UiSize } from "../state/uiPreferences";
export function useDashboardLayout(size: UiSize) {
  const container = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState<Columns>(1);
  useLayoutEffect(() => {
    const node = container.current;
    if (!node) return;
    let previous: Columns | undefined;
    const measure = () => {
      previous = calculateLayout(node.getBoundingClientRect().width, 0, size, previous).columns;
      setColumns(previous);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(node); measure();
    return () => observer.disconnect();
  }, [size]);
  return { container, columns };
}
