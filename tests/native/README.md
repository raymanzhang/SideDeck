# Native fullscreen probe (macOS)

This test-only Tauri example uses the installed Tauri/Tao/Wry and the existing frontend assets. It does not start providers, save preferences, register autostart, or change global menu-bar/Spaces preferences. Its native observer library is loaded only by the example, never by the production application.

Build:

```sh
mkdir -p test-results/native
clang -dynamiclib -fobjc-arc -framework Cocoa tests/native/fullscreen_observer.m -o test-results/native/fullscreen_observer.dylib
npm run build
cargo build --manifest-path src-tauri/Cargo.toml --example fullscreen_probe --features tauri/custom-protocol
```

Run from the repository root, with stdin available:

```sh
T8_OBSERVER_DYLIB="$PWD/test-results/native/fullscreen_observer.dylib" src-tauri/target/debug/examples/fullscreen_probe
```

Commands: `enter`, `exit`, `state`, `primary`, `secondary`, `quit`. Wait for the corresponding **did-enter/did-exit native notification** before the next dependent command; `set_fullscreen` returning is not completion. The harness initially positions a window on the secondary monitor. It logs AppKit will/did notifications, key focus, Space changes, frame, presentation options and the public Tauri fullscreen flag. This is a protocol probe, not a production coordinator.

Observe entry, then activate a main-screen application without hiding the probe. Record menu-bar visibility, independent main-screen interaction and lack of focus stealing. Exercise system fullscreen exit and Spaces switching. Record the operator's current menu-bar/Spaces settings; do not silently change them. Finish by exiting fullscreen and issuing `quit`.

Accessibility authorization is needed for automated cross-application keyboard/mouse actions; Screen Recording is needed for desktop screenshots. The probe's own AppKit notifications do not require those permissions. Physical cable removal and sleep/wake require operator coordination.

## Production UI input helper

With the production binary running, compile `swiftc tests/native/interact.swift -o /tmp/sys-hud-interact`. The helper supports `list`, `wait <label>`, `press <label>` (accessibility action), `click <label>` (mouse event), `click-inactive <label>` (without activation), `focused`, `scroll`, `resize` (800×400), `escape`, and `quit`. It only traverses SideDeck's own window, not system menus or other applications. A window on another Space may need explicit activation before its accessibility tree is available.

For diagnostic state output, launch the debug production binary with `SYSHUD_WINDOW_TRACE=1`. This does not introduce a frontend debug control or alter the coordination protocol. Restore test preferences before finishing; the recorded integration run restored windowed mode, always-on-top off, the original panel order and the original secondary display choice.
