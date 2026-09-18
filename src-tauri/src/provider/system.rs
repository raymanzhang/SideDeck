// Copyright (c) 2026 Rayman Zhang
// SPDX-License-Identifier: AGPL-3.0-only

use super::traits::{Provider, ProviderCategory};
use serde_json::json;
use std::pin::Pin;
use std::sync::Mutex;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use sysinfo::{Components, Networks, System};
mod storage;

struct SystemState {
    sys: System,
    networks: Networks,
    components: Components,
    sample_id: u64,
    previous_refresh: Option<(Instant, SystemTime)>,
}

pub struct SystemProvider {
    state: Mutex<SystemState>,
}

impl SystemProvider {
    pub fn new() -> Self {
        let mut sys = System::new();
        sys.refresh_cpu_all();
        sys.refresh_memory();

        let networks = Networks::new_with_refreshed_list();
        let components = Components::new_with_refreshed_list();

        Self {
            state: Mutex::new(SystemState {
                sys,
                networks,
                components,
                sample_id: 0,
                previous_refresh: None,
            }),
        }
    }
}

impl Provider for SystemProvider {
    fn id(&self) -> &str {
        "system"
    }

    fn display_name(&self) -> &str {
        "System Metrics"
    }

    fn category(&self) -> ProviderCategory {
        ProviderCategory::System
    }

    fn poll_interval(&self) -> Duration {
        Duration::from_secs(2)
    }

    fn poll(
        &self,
    ) -> Pin<
        Box<
            dyn std::future::Future<
                    Output = Result<serde_json::Value, Box<dyn std::error::Error + Send + Sync>>,
                > + Send
                + '_,
        >,
    > {
        Box::pin(async {
            let mut state =
                self.state
                    .lock()
                    .map_err(|e| -> Box<dyn std::error::Error + Send + Sync> {
                        format!("lock poisoned: {e}").into()
                    })?;

            // Refresh CPU & memory
            state.sys.refresh_cpu_all();
            state.sys.refresh_memory();

            // CPU
            let cpu_overall = state.sys.global_cpu_usage();
            let cpu_cores: Vec<f32> = state.sys.cpus().iter().map(|c| c.cpu_usage()).collect();

            // Memory
            let mem_used = state.sys.used_memory();
            let mem_total = state.sys.total_memory();
            let mem_percent = if mem_total > 0 {
                (mem_used as f64 / mem_total as f64 * 100.0) as f32
            } else {
                0.0
            };

            let disks = storage::sample();
            // Keep the root summary for older consumers; the UI uses all volumes.
            let disk = disks.iter().find(|d| d.mount_point == "/");

            // Network — use received()/transmitted() which give bytes since last refresh
            state.networks.refresh(true);
            let refreshed_at = Instant::now();
            let sampled_at = SystemTime::now();
            let elapsed = state.previous_refresh.map(|(monotonic, wall)| {
                (
                    refreshed_at.duration_since(monotonic).as_secs_f64(),
                    sampled_at
                        .duration_since(wall)
                        .ok()
                        .map(|d| d.as_secs_f64()),
                )
            });
            state.previous_refresh = Some((refreshed_at, sampled_at));
            state.sample_id += 1;
            let (mut total_rx, mut total_tx) = (0u64, 0u64);
            for (_name, data) in state.networks.iter() {
                total_rx = total_rx.saturating_add(data.received());
                total_tx = total_tx.saturating_add(data.transmitted());
            }
            let interval = valid_interval(elapsed);
            let rx_rate = network_rate(total_rx, interval);
            let tx_rate = network_rate(total_tx, interval);

            // Temperature
            state.components.refresh(true);
            let temperature = select_temperature(
                state
                    .components
                    .iter()
                    .map(|c| (c.label(), c.temperature())),
            );

            // Battery
            let battery_info = match battery::Manager::new() {
                Ok(manager) => match manager.batteries() {
                    Ok(mut batteries) => batteries.next().and_then(|b| {
                        b.ok().map(|bat| {
                            use battery::units::ratio::percent as ratio_percent;
                            let pct = bat.state_of_charge().get::<ratio_percent>();
                            let state_str = match bat.state() {
                                battery::State::Charging => "charging",
                                battery::State::Discharging => "discharging",
                                battery::State::Full => "full",
                                _ => "unknown",
                            };
                            json!({ "percent": pct, "state": state_str })
                        })
                    }),
                    Err(_) => None,
                },
                Err(_) => None,
            };

            Ok(json!({
                "sample_id": state.sample_id,
                "sampled_at_ms": sampled_at.duration_since(UNIX_EPOCH).unwrap_or_default().as_millis() as u64,
                "sample_gap": interval.is_none(),
                "cpu": {
                    "overall": cpu_overall,
                    "cores": cpu_cores
                },
                "memory": {
                    "used": mem_used,
                    "total": mem_total,
                    "percent": mem_percent
                },
                "disk": disk,
                "disks": disks,
                "network": {
                    "rx_rate": rx_rate,
                    "tx_rate": tx_rate
                },
                "temperature": temperature,
                "battery": battery_info
            }))
        })
    }
}

// Prefer the hottest valid CPU/SoC sensor. Other sensors remain explicitly
// labelled, since a PMU reading is not necessarily a CPU junction temperature.
fn select_temperature<'a>(
    sensors: impl Iterator<Item = (&'a str, Option<f32>)>,
) -> serde_json::Value {
    let mut cpu: Option<(&str, f32)> = None;
    let mut fallback: Option<(&str, f32)> = None;
    for (label, value) in sensors {
        let Some(value) = value.filter(|v| v.is_finite() && *v > 0.0 && *v < 150.0) else {
            continue;
        };
        if fallback.is_none_or(|(_, previous)| value > previous) {
            fallback = Some((label, value));
        }
        let name = label.to_lowercase();
        if (name.contains("cpu") || name.contains("soc"))
            && cpu.is_none_or(|(_, previous)| value > previous)
        {
            cpu = Some((label, value));
        }
    }
    let selected = cpu.or(fallback);
    json!({
        "cpu": cpu.map(|(_, value)| value),
        "value": selected.map(|(_, value)| value),
        "sensor": selected.map(|(label, _)| label),
        "kind": if cpu.is_some() { "cpu" } else if selected.is_some() { "other" } else { "unavailable" },
    })
}

// Wall time detects sleep on platforms whose monotonic clock excludes suspension.
// Only monotonic time is ever used as the rate denominator.
fn valid_interval(elapsed: Option<(f64, Option<f64>)>) -> Option<f64> {
    let (monotonic, wall) = elapsed?;
    let wall = wall?;
    (monotonic.is_finite()
        && monotonic > 0.0
        && monotonic <= 6.0
        && wall.is_finite()
        && wall > 0.0
        && wall <= 6.0
        && (wall - monotonic).abs() <= 1.0)
        .then_some(monotonic)
}
fn network_rate(bytes: u64, interval: Option<f64>) -> Option<f64> {
    interval.map(|seconds| bytes as f64 / seconds)
}

#[cfg(test)]
mod sampling_tests {
    use super::*;

    #[test]
    fn temperature_uses_valid_cpu_then_explicit_sensor_fallback() {
        let value = select_temperature(
            [
                ("CPU invalid", None),
                ("CPU 1", Some(48.0)),
                ("CPU 2", Some(52.0)),
                ("PMU tdie1", Some(60.0)),
            ]
            .into_iter(),
        );
        assert_eq!(value["cpu"], 52.0);
        assert_eq!(value["sensor"], "CPU 2");
        let value = select_temperature(
            [
                ("PMU tdie1", Some(50.0)),
                ("PMU tdie2", Some(54.0)),
                ("CPU", Some(f32::NAN)),
            ]
            .into_iter(),
        );
        assert!(value["cpu"].is_null());
        assert_eq!(value["value"], 54.0);
        assert_eq!(value["sensor"], "PMU tdie2");
        assert_eq!(value["kind"], "other");
        let value =
            select_temperature([("CPU", Some(0.0)), ("SoC", Some(f32::INFINITY))].into_iter());
        assert!(value["value"].is_null());
    }

    #[test]
    fn actual_elapsed_time_and_first_sample() {
        assert_eq!(
            network_rate(3000, valid_interval(Some((3.0, Some(3.0))))),
            Some(1000.0)
        );
        assert_eq!(network_rate(3000, valid_interval(None)), None);
        assert_eq!(
            network_rate(0, valid_interval(Some((2.0, Some(2.0))))),
            Some(0.0)
        );
    }
    #[test]
    fn discontinuities_rebaseline_then_recover() {
        for elapsed in [
            (0.0, Some(0.0)),
            (-1.0, Some(2.0)),
            (7.0, Some(7.0)),
            (2.0, Some(30.0)),
            (2.0, None),
            (f64::NAN, Some(2.0)),
            (2.0, Some(5.0)),
        ] {
            assert_eq!(network_rate(500_000, valid_interval(Some(elapsed))), None);
            assert_eq!(
                network_rate(4000, valid_interval(Some((2.0, Some(2.0))))),
                Some(2000.0)
            );
        }
    }
}
