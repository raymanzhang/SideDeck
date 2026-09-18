// Copyright (c) 2026 Rayman Zhang
// SPDX-License-Identifier: AGPL-3.0-only

use std::path::{Path, PathBuf};

fn executable(path: &Path) -> bool {
    let Ok(metadata) = path.metadata() else { return false; };
    #[cfg(unix)]
    { use std::os::unix::fs::PermissionsExt; metadata.is_file() && metadata.permissions().mode() & 0o111 != 0 }
    #[cfg(not(unix))]
    { metadata.is_file() }
}

fn find(name: &str, configured: Option<PathBuf>, directories: Vec<PathBuf>) -> Option<PathBuf> {
    if let Some(path) = configured {
        // An explicit invalid override must not silently execute another program.
        return (path.is_absolute() && executable(&path)).then_some(path);
    }
    directories.into_iter().filter(|p| p.is_absolute()).map(|p| p.join(name)).find(|p| executable(p))
}

fn directories() -> Vec<PathBuf> {
    let mut paths: Vec<_> = std::env::var_os("PATH").map(|p| std::env::split_paths(&p).collect()).unwrap_or_default();
    if let Some(home) = std::env::var_os("HOME") { paths.push(PathBuf::from(home).join(".local/bin")); }
    paths.extend(["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin"].map(PathBuf::from));
    paths
}

pub fn resolve(name: &str) -> Option<PathBuf> {
    let key = match name { "claude" => "SIDEDECK_CLAUDE_PATH", "codex" => "SIDEDECK_CODEX_PATH", _ => return None };
    find(name, std::env::var_os(key).map(PathBuf::from), directories())
}

pub fn command(name: &str) -> std::io::Result<tokio::process::Command> {
    let path = resolve(name).ok_or_else(|| std::io::Error::new(std::io::ErrorKind::NotFound, format!("{name} CLI unavailable; install in ~/.local/bin, /opt/homebrew/bin or /usr/local/bin, or set SIDEDECK_{}_PATH to an absolute executable path and restart", name.to_uppercase())))?;
    let mut paths = vec![path.parent().unwrap().to_path_buf()];
    paths.extend(directories());
    let mut command = tokio::process::Command::new(path);
    // Also let #!/usr/bin/env node resolve a sibling or standard Node install.
    if let Ok(path) = std::env::join_paths(paths) { command.env("PATH", path); }
    Ok(command)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    #[cfg(unix)]
    fn bounded_resolution_handles_missing_override_spaces_and_nonexecutables() {
        use std::os::unix::fs::PermissionsExt;
        let root = std::env::temp_dir().join(format!("sidedeck-cli-{}", std::process::id()));
        std::fs::create_dir_all(root.join("with spaces")).unwrap();
        let executable_path = root.join("with spaces/codex");
        std::fs::write(&executable_path, "#!/bin/sh\nexit 0\n").unwrap();
        assert!(find("codex", None, vec![root.join("with spaces")]).is_none());
        std::fs::set_permissions(&executable_path, std::fs::Permissions::from_mode(0o700)).unwrap();
        assert_eq!(find("codex", None, vec![root.join("with spaces")]), Some(executable_path.clone()));
        assert_eq!(find("codex", Some(executable_path.clone()), vec![]), Some(executable_path));
        assert!(find("codex", Some(root.join("missing")), vec![root.join("with spaces")]).is_none());
        assert!(find("codex", Some(PathBuf::from("relative/codex")), vec![]).is_none());
        assert!(find("claude", None, vec![root.clone()]).is_none());
        std::fs::remove_dir_all(root).unwrap();
    }
}
