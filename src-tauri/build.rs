// Copyright (c) 2026 Rayman Zhang
// SPDX-License-Identifier: AGPL-3.0-only

fn main() {
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        cc::Build::new()
            .file("src/window/native.m")
            .flag("-fobjc-arc")
            .flag("-mmacosx-version-min=13.3")
            .compile("hud_window_native");
        println!("cargo:rustc-link-lib=framework=Cocoa");
        println!("cargo:rustc-link-lib=framework=CoreGraphics");
        println!("cargo:rerun-if-changed=src/window/native.m");
    }
    tauri_build::build()
}
