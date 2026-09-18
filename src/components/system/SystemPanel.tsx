// Copyright (c) 2026 Rayman Zhang
// SPDX-License-Identifier: AGPL-3.0-only

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { SystemHistory } from "../../state/systemHistory";
import type { UiSize } from "../../state/uiPreferences";
import { calculateLayout } from "../../state/dashboardLayout";
import { clampPercent, networkCeiling } from "../../state/charts";
import { formatBytes, formatRate } from "../../utils/format";
import { CpuCores } from "./CpuCores";
import { UsageRing } from "../charts/UsageRing";
import { CapacityBar } from "../charts/CapacityBar";
import { Sparkline } from "../charts/Sparkline";
import { MetricIcon, type MetricKind } from "../charts/MetricIcon";
import { DetailPage } from "../DetailPage";
const labels = { cpu: "CPU", memory: "Memory", network: "Network", disk: "Disk", temperature: "Temperature", battery: "Battery" };
const percent = (value: number | null | undefined) => { const n = clampPercent(value); return n === null ? "Unavailable" : `${n.toFixed(1)}%`; };
export function SystemPanel({ history, size }: { history: SystemHistory; size: UiSize }) {
  const overview = useRef<HTMLDivElement>(null);
  const [shortHeight, setShortHeight] = useState(false);
  const [detail, setDetail] = useState<Exclude<MetricKind, "battery"> | null>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const data = history.samples[history.samples.length - 1];
  const volumes = data?.disks ?? (data?.disk ? [{ ...data.disk, name: "System", mount_point: "/" }] : []);
  const temperature = data?.temperature.value ?? data?.temperature.cpu;
  useLayoutEffect(() => {
    const node = overview.current;
    if (!node) return;
    setHost(node.closest<HTMLElement>(".panel-body"));
    const measure = () => { if (node.clientHeight) setShortHeight(calculateLayout(0, node.clientHeight, size).shortHeight); };
    const observer = new ResizeObserver(measure); observer.observe(node); measure();
    return () => observer.disconnect();
  }, [size]);
  const ceiling = networkCeiling(history.samples.flatMap(sample => [sample.network.rx_rate, sample.network.tx_rate]));
  const chart = (kind: "cpu" | "rx_rate" | "tx_rate") => <Sparkline
    points={history.samples.map(sample => ({ time: sample.sampled_at_ms, value: kind === "cpu" ? sample.cpu.overall : sample.network[kind], gap: sample.sample_gap }))}
    endTime={data?.sampled_at_ms ?? 0} ceiling={kind === "cpu" ? 100 : ceiling} dashed={kind === "tx_rate"}
    label={`${kind === "cpu" ? "CPU, 0–100%" : kind === "rx_rate" ? "Download" : "Upload"}, last 60 seconds; gaps indicate unavailable samples`} />;
  const content = (kind: MetricKind): ReactNode => {
    if (!data) return null;
    switch (kind) {
      case "cpu": return <><strong className="text-value">{percent(data.cpu.overall)}</strong><div className="text-hud-accent">{chart("cpu")}</div><span className="text-small text-hud-text-dim">0–100% · Last 60 seconds · {data.cpu.cores.length} cores</span></>;
      case "memory": return <><div className="memory-summary"><UsageRing percent={data.memory.percent} label="Memory occupied" /><span>{formatBytes(data.memory.used)} / {formatBytes(data.memory.total)}</span></div><span className="text-small text-hud-text-dim">Occupied memory</span></>;
      case "network": return <><span className="text-small text-hud-text-dim">Shared scale: 0–{formatRate(ceiling)} · Last 60 seconds</span>
        <div className="text-neon-blue"><p>↓ Download <strong>{formatRate(data.network.rx_rate)}</strong></p>{chart("rx_rate")}</div>
        <div className="text-[#63dbdc]"><p>↑ Upload <strong>{formatRate(data.network.tx_rate)}</strong></p>{chart("tx_rate")}</div></>;
      case "disk": return volumes.length ? volumes.map(volume => <div key={volume.mount_point} className="volume-metric">
        <span className="volume-heading"><span title={volume.mount_point}>{volume.name}</span><strong>{percent(volume.percent)}</strong></span>
        <CapacityBar percent={volume.percent} label={`${volume.name} occupied`} />
        <span className="text-small text-hud-text-dim">{formatBytes(volume.used)} / {formatBytes(volume.total)}</span>
      </div>) : <strong className="text-value">Unavailable</strong>;
      case "temperature": return <><strong className="text-value">{temperature != null && Number.isFinite(temperature) ? `${temperature.toFixed(0)}°C` : "Unavailable"}</strong>{data.temperature.sensor && <span className="text-small text-hud-text-dim">{data.temperature.sensor}</span>}</>;
      case "battery": return data.battery && <><strong className="text-value">{percent(data.battery.percent)}</strong><CapacityBar percent={data.battery.percent} label="Battery charge" /><span>{data.battery.state === "charging" ? "⚡ Charging" : data.battery.state}</span></>;
    }
  };
  return <>
    <div ref={overview} className="page-scroll system-overview" data-short={shortHeight}>
      {!data ? <p className="pad-card text-hud-text-dim">Waiting for system metrics…</p> : <div className="pad-card">
        {history.paused && <p role="status" className="text-neon-amber mb-3">Paused — showing last values</p>}
        <div className="metric-grid">{(["cpu", "memory", "network", "disk", "temperature"] as const).map(kind => <button key={kind} className={`metric-card metric-${kind}`} onClick={event => { event.currentTarget.focus({ preventScroll: true }); setDetail(kind); }} aria-label={`Open ${labels[kind]} details`}>
          <span className="metric-heading"><MetricIcon kind={kind} /><span>{labels[kind]}</span><span aria-hidden="true" className="ml-auto">↗</span></span>{content(kind)}
        </button>)}
        {data.battery && <section className="metric-card"><h3 className="metric-heading"><MetricIcon kind="battery" />Battery</h3>{content("battery")}</section>}
        </div>
      </div>}
    </div>
    {detail && host && data && <DetailPage host={host} title={labels[detail]} onClose={() => setDetail(null)}>
      {history.paused && <p className="text-neon-amber">Paused — showing last values</p>}
      <div className="metric-detail">{content(detail)}</div>
      {detail === "cpu" && <><h4 className="text-title my-4">All cores</h4><CpuCores cores={data.cpu.cores} /></>}
      {detail === "memory" && <p className="mt-4 text-hud-text-dim">Occupancy is not a measure of memory pressure. The system may use memory for caches.</p>}
      {detail === "disk" && <div className="mt-4 text-hud-text-dim"><p>Mounted storage volumes. Volumes may share physical storage; capacities are not added together. Available space excludes purgeable caches on macOS.</p>{volumes.map(volume => <p key={volume.mount_point}>{volume.mount_point} · {formatBytes(Math.max(0, volume.total - volume.used))} available</p>)}</div>}
      {detail === "temperature" && <p className="mt-4 text-hud-text-dim">{data.temperature.kind === "other" ? "Hottest available sensor. This reading is not identified as CPU / SoC temperature." : temperature != null ? "Hottest available CPU / SoC sensor reading." : "No valid temperature reading is available from the current sensor interface."}</p>}
      {detail === "network" && <p className="mt-4 text-hud-text-dim">Combined network interfaces. Solid: download. Dashed: upload. Rates are unavailable during the first sample and after a sampling interruption.</p>}
    </DetailPage>}
  </>;
}
