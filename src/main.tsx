// Copyright (c) 2026 Rayman Zhang
// SPDX-License-Identifier: AGPL-3.0-only

import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { polyfill } from "mobile-drag-drop";
import "mobile-drag-drop/default.css";

// Use the same long-press behavior even when WebView reports native drag support.
polyfill({
  holdToDrag: 500,
  forceApply: true,
  // composedPath() is empty after the polyfill's long-press timer fires.
  tryFindDraggableTarget: event => event.target instanceof Element
    ? event.target.closest<HTMLElement>(".edit-handle[draggable=true]") ?? undefined
    : undefined,
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
