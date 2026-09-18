// Copyright (c) 2026 Rayman Zhang
// SPDX-License-Identifier: AGPL-3.0-only

use serde::Serialize;

#[derive(Serialize)]
pub(super) struct Volume {
    name: String,
    pub mount_point: String,
    used: u64,
    total: u64,
    percent: f32,
}

impl Volume {
    fn new(mount_point: String, total: u64, available: u64) -> Option<Self> {
        if total == 0 {
            return None;
        }
        let name = if mount_point == "/" {
            "System".to_owned()
        } else {
            std::path::Path::new(&mount_point)
                .file_name()?
                .to_string_lossy()
                .into_owned()
        };
        let used = total.saturating_sub(available);
        Some(Self {
            name,
            mount_point,
            used,
            total,
            percent: (used as f64 / total as f64 * 100.0) as f32,
        })
    }
}

#[cfg(target_os = "macos")]
fn user_volume(path: &str, device: &str, flags: u32) -> bool {
    path == "/"
        || (flags & libc::MNT_LOCAL as u32 != 0
            && flags & libc::MNT_DONTBROWSE as u32 == 0
            && device.starts_with("/dev/disk")
            && !path.starts_with("/System/")
            && !path.starts_with("/Library/Developer/"))
}

#[cfg(target_os = "macos")]
pub(super) fn sample() -> Vec<Volume> {
    // Only filesystem syscalls: CoreFoundation volume enumeration triggers
    // FileIDMap / CacheDelete messages even when requesting metadata alone.
    let count = unsafe { libc::getfsstat(std::ptr::null_mut(), 0, libc::MNT_NOWAIT) };
    if count <= 0 {
        return Vec::new();
    }
    // Spare entries tolerate mounts appearing between the two calls.
    // SAFETY: statfs is a C structure whose fields all admit zero values.
    let mut mounts = vec![unsafe { std::mem::zeroed::<libc::statfs>() }; count as usize + 8];
    let bytes = mounts.len() * std::mem::size_of::<libc::statfs>();
    let Ok(bytes) = i32::try_from(bytes) else {
        return Vec::new();
    };
    // SAFETY: mounts owns bytes writable bytes and remains alive during the call.
    let filled = unsafe { libc::getfsstat(mounts.as_mut_ptr(), bytes, libc::MNT_NOWAIT) };
    if filled <= 0 {
        return Vec::new();
    }
    let text = |chars: &[libc::c_char]| {
        String::from_utf8_lossy(
            &chars
                .iter()
                .take_while(|c| **c != 0)
                .map(|c| *c as u8)
                .collect::<Vec<_>>(),
        )
        .into_owned()
    };
    let mut volumes = Vec::new();
    for mount in mounts.iter().take(filled as usize) {
        let path = text(&mount.f_mntonname);
        if !user_volume(&path, &text(&mount.f_mntfromname), mount.f_flags) {
            continue;
        }
        let Ok(cpath) = std::ffi::CString::new(path.as_bytes()) else {
            continue;
        };
        let mut stats = std::mem::MaybeUninit::<libc::statfs>::uninit();
        // SAFETY: cpath is NUL-terminated and stats is writable statfs storage.
        if unsafe { libc::statfs(cpath.as_ptr(), stats.as_mut_ptr()) } != 0 {
            continue;
        }
        // SAFETY: successful statfs initializes the output.
        let stats = unsafe { stats.assume_init() };
        let block_size = u64::from(stats.f_bsize);
        if let (Some(total), Some(available)) = (
            stats.f_blocks.checked_mul(block_size),
            stats.f_bavail.checked_mul(block_size),
        ) {
            if let Some(volume) = Volume::new(path, total, available) {
                volumes.push(volume);
            }
        }
    }
    volumes.sort_by(|a, b| a.mount_point.cmp(&b.mount_point));
    volumes
}

#[cfg(not(target_os = "macos"))]
pub(super) fn sample() -> Vec<Volume> {
    sysinfo::Disks::new_with_refreshed_list()
        .iter()
        .filter_map(|disk| {
            Volume::new(
                disk.mount_point().to_string_lossy().into_owned(),
                disk.total_space(),
                disk.available_space(),
            )
        })
        .collect()
}

#[cfg(all(test, target_os = "macos"))]
mod tests {
    use super::*;

    #[test]
    fn excludes_auxiliary_volumes_but_keeps_external_storage() {
        let local = libc::MNT_LOCAL as u32;
        assert!(user_volume("/", "/dev/disk3s1s1", local));
        assert!(user_volume("/Volumes/External", "/dev/disk7s1", local));
        for path in [
            "/dev",
            "/System/Volumes/Data",
            "/System/Volumes/VM",
            "/Library/Developer/CoreSimulator/Volumes/iOS",
        ] {
            assert!(!user_volume(
                path,
                "/dev/disk3s2",
                local | libc::MNT_DONTBROWSE as u32
            ));
        }
        assert!(!user_volume("/Volumes/Network", "server:/share", 0));
    }

    #[test]
    fn native_capacity_sampling() {
        for _ in 0..3 {
            let volumes = sample();
            assert!(volumes.iter().any(|v| v.mount_point == "/"));
            for volume in volumes {
                assert!(volume.total > 0 && volume.used <= volume.total);
                println!(
                    "{}: {} / {} bytes",
                    volume.mount_point, volume.used, volume.total
                );
            }
        }
    }
}
