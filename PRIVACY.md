# Privacy and local data

This document describes the implementation reviewed for 0.1.0-alpha.1.
SideDeck is not fully offline. It does not implement its own analytics or
crash-upload service; account providers and the CLI subprocesses can use the
network. There is currently no per-provider privacy toggle.

- System metrics use local OS interfaces for CPU, memory, disks, network
  counters, battery, and available temperature sensors.
- Claude discovery invokes `claude agents --json`, then reads matching JSONL
  logs under `~/.claude/projects`. Session events can contain private prompts,
  project paths, tool arguments, and outputs; do not share the raw logs.
- Codex reads `session_index.jsonl` and session logs under `CODEX_HOME` or
  `~/.codex`. It also starts a bounded CLI proxy request for thread/account
  information. The CLI's own authentication, services, and network behavior
  apply; SideDeck does not replace those settings.
- Anthropic usage reads the macOS Keychain generic-password item with service
  `com.anthropic.claude-code` and account `oauth_credentials`. Its access token
  is used as a bearer credential for
  `https://api.anthropic.com/api/oauth/usage`, normally every 60 seconds. Access
  can be denied. Missing/expired credentials or unsupported responses are
  shown as unavailable/error states. The app does not write this token to its
  own preference files.
- OpenAI account data is requested through the Codex CLI proxy, with in-memory
  caches of approximately 30 seconds. Local fallback session logs do not
  establish authenticated account quota availability.
- Native window preferences are stored in the Tauri app-data directory for
  `com.syshud.app` as `window-preferences.json`; legacy display settings can
  be read for migration. Codex attention episode state is persisted at
  `~/Library/Application Support/com.syshud.app/codex-episodes-v1.json`.
  WebView local storage retains layout, interface size, animation preferences,
  and seen attention state using the existing `sys-hud:*` keys.
- Provider errors may be written to stderr. Debug builds can enable native
  window tracing with `SYSHUD_WINDOW_TRACE`; diagnostic output can include
  paths, display identifiers, or CLI errors. Review it before sharing.
- About-page links open GitHub in the system browser only when selected.

To remove app-owned preferences/cache, quit SideDeck and remove its app-data
and WebView storage through macOS file-management tools. This resets settings.
Uninstalling the app does not necessarily remove those files. Keep CLI logins,
Keychain items, and session logs unless you also intend to reset the relevant
CLI. Signed-installation privacy and authentication acceptance remains pending.
