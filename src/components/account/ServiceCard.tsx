// Copyright (c) 2026 Rayman Zhang
// SPDX-License-Identifier: AGPL-3.0-only

import type { ReactNode } from "react";
import type { AccountStatus } from "../../types/account";

interface ServiceCardProps {
  name: string;
  status: AccountStatus | "loading" | "coming_soon";
  plan?: string | null;
  error?: string;
  children?: ReactNode;
}

export function ServiceCard({ name, status, plan, error, children }: ServiceCardProps) {
  const warning = ["error", "auth_error", "auth_expired"].includes(status);
  const message = status === "loading" ? "Loading usage…"
    : status === "coming_soon" || status === "unsupported" ? "Coming Soon"
    : error ?? (status === "no_auth" ? "Sign in to view usage" : "Usage unavailable");
  return (
    <section className="rounded border border-hud-border bg-hud-panel pad-card" aria-label={`${name} account`}>
      <div className="mb-2 flex min-w-0 items-baseline justify-between gap-2">
        <h3 className="text-title font-semibold text-hud-text">{name}</h3>
        {plan && <span className="break-words text-small text-hud-text-dim">{plan}</span>}
      </div>
      {status === "ok" ? children : (
        <p className={`break-words text-small leading-relaxed ${warning ? "text-amber-400" : "text-hud-text-dim"}`} role={warning ? "status" : undefined} >{message}{status === "unsupported" && error ? ` — ${error}` : ""}</p>
      )}
    </section>
  );
}
