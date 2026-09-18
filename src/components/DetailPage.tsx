// Copyright (c) 2026 Rayman Zhang
// SPDX-License-Identifier: AGPL-3.0-only

import { useLayoutEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
/** Keep the overview mounted; it retains scroll and state while this page is open. */
export function DetailPage({
  host,
  title,
  onClose,
  children,
}: {
  host: HTMLElement;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const page = useRef<HTMLDivElement>(null);
  const back = useRef<HTMLButtonElement>(null);
  const origin = useRef<HTMLElement | null>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useLayoutEffect(() => {
    // Preserve the original trigger through StrictMode's effect replay.
    origin.current ??= document.activeElement as HTMLElement | null;
    const trigger = origin.current;
    const siblings = Array.from(host.children).filter(
      (node) => node !== page.current,
    ) as HTMLElement[];
    const previous = siblings.map((node) => node.inert);
    siblings.forEach((node) => {
      node.inert = true;
    });
    back.current?.focus({ preventScroll: true });
    const escape = (event: KeyboardEvent) => {
      if (
        event.key === "Escape" &&
        page.current?.getClientRects().length &&
        !document.querySelector("dialog[open]")
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
        close.current();
      }
    };
    document.addEventListener("keydown", escape, true);
    return () => {
      document.removeEventListener("keydown", escape, true);
      siblings.forEach((node, index) => {
        node.inert = previous[index];
      });
      // React restores the previously focused (still mounted) element at the
      // end of its commit. Restore the detail trigger after that restoration.
      requestAnimationFrame(() => {
        if (
          trigger?.isConnected &&
          !trigger.closest("[inert]") &&
          trigger.getClientRects().length
        )
          trigger.focus({ preventScroll: true });
        else
          host
            .querySelector<HTMLElement>("[data-list-heading]")
            ?.focus({ preventScroll: true });
      });
    };
  }, [host]);
  return createPortal(
    <div
      ref={page}
      className="detail-page page-stack"
      role="region"
      aria-label={`${title} details`}
    >
      <div className="page-nav">
        <button ref={back} className="control" onClick={onClose}>
          ← Back
        </button>
        <h3 className="text-title">{title}</h3>
      </div>
      <div className="page-scroll pad-card">{children}</div>
    </div>,
    host,
  );
}
