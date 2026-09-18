// Copyright (c) 2026 Rayman Zhang
// SPDX-License-Identifier: AGPL-3.0-only

use super::model::{Display, Target, WindowPreferences};
use std::io::{ErrorKind, Write};
use std::path::Path;
const FILE: &str = "window-preferences.json";
pub fn load(dir: &Path, displays: &[Display]) -> (WindowPreferences, bool, Option<String>) {
    match std::fs::read(dir.join(FILE)) {
        Ok(bytes) => match serde_json::from_slice::<WindowPreferences>(&bytes) {
            Ok(prefs) if prefs.version == 1 => (prefs, false, None),
            _ => (WindowPreferences::default(), false, Some("Window preferences are invalid or from an unsupported version; using safe defaults".into())),
        },
        Err(error) if error.kind() == ErrorKind::NotFound => {
            let mut prefs = WindowPreferences::default();
            if let Ok(bytes) = std::fs::read(dir.join("display-config.json")) {
                if let Ok(old) = serde_json::from_slice::<serde_json::Value>(&bytes) {
                    if let Some(name) = old.get("name").and_then(|name| name.as_str()) {
                        let matches: Vec<_> = displays.iter().filter(|display| display.name == name || display.legacy_name == name).collect();
                        prefs.target = Target::Display { id: if matches.len() == 1 && !matches[0].id.is_empty() { Some(matches[0].id.clone()) } else { None }, name: name.into() };
                    }
                }
            }
            (prefs, true, None)
        }
        Err(error) => (WindowPreferences::default(), false, Some(format!("Cannot read window preferences: {error}"))),
    }
}
pub fn save(dir: &Path, prefs: &WindowPreferences) -> Result<(), String> {
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let temp = dir.join("window-preferences.json.tmp");
    let result = (|| {
        let bytes = serde_json::to_vec_pretty(prefs).map_err(|e| e.to_string())?;
        let mut file = std::fs::File::create(&temp).map_err(|e| e.to_string())?;
        file.write_all(&bytes).map_err(|e| e.to_string())?;
        file.sync_all().map_err(|e| e.to_string())?;
        std::fs::rename(&temp, dir.join(FILE)).map_err(|e| e.to_string())
    })();
    if result.is_err() {
        let _ = std::fs::remove_file(temp);
    }
    result
}
