# SideDeck

系统与 AI 任务，抬眼即知。面向 Mac 副屏的状态仪表盘，基于 Tauri、Rust、React 和 TypeScript。

[English](README.en.md) · [GitHub](https://github.com/raymanzhang/SideDeck) · [隐私](PRIVACY.md) · [贡献与问题反馈](CONTRIBUTING.md)

![SideDeck 副屏仪表盘，合成测试数据](assets/screenshots/dashboard.png)

截图使用合成测试数据，不代表实机或账户验收结果。

## 功能

- CPU、内存、存储、网络、可用电池与温度指标及详情。
- Claude/Codex 会话与账户面板；能力取决于 CLI、账户和后台服务。
- 可调整布局、界面尺寸、窗口置顶、目标显示器、原生全屏和登录启动。
- 设置中的关于页面提供版本、源码入口和离线 AGPL 许可证。

## 安装与支持状态

首发目标为 `0.1.0-alpha.1`，目前没有通过完整验收的公开安装包。**macOS 13.3 为设计兼容目标，未实机验证，实际兼容性留给用户验证反馈。** 计划分别构建 Apple Silicon 和 Intel；编译通过不代表运行通过。实际验证范围和限制见下文及[更新日志](CHANGELOG.md)。

发布后从 [Releases](https://github.com/raymanzhang/SideDeck/releases) 选择标注对应架构的 DMG，核对发布的 SHA-256，打开后将 SideDeck 拖入 Applications，从 Finder 启动。只有通过签名、公证和实际下载安装验收的架构才可公开。不要关闭 Gatekeeper 绕过失败。

## CLI 前置条件与配置

CLI 发现依次检查启动环境的 `PATH`、`~/.local/bin`、`/opt/homebrew/bin`、`/usr/local/bin`；也可用 `SIDEDECK_CLAUDE_PATH` / `SIDEDECK_CODEX_PATH` 指定绝对可执行路径。先分别安装并登录 CLI。Claude 会话接口要求 `claude agents --json`；Codex 使用 `codex app-server proxy`，需要对应接口及可用后台服务。`CODEX_HOME` 可指定数据目录，默认 `~/.codex`。Claude 日志位于 `~/.claude/projects`；账户读取还依赖 Keychain OAuth 项和网络。

Finder 的 PATH 可能与终端不同；现已增加标准安装目录解析，最终签名包的 Finder 验收仍待完成。环境变量需进入 GUI 启动环境，终端 shell 配置不会自动传给 Finder；标准目录安装无需额外配置。终端开发版可用于诊断，不能代替最终安装包验收。未登录、接口不支持或权限拒绝可能导致读取不可用；目前没有通过签名安装包实测的受支持 CLI 组合。

## 开发与验证

使用 `.nvmrc` 的 Node 26.7.0、`rust-toolchain.toml` 的 Rust 1.95.0 和 Xcode 命令行工具。

```sh
npm ci
npx playwright install chromium webkit
npm run tauri dev
```

```sh
npm test
npm run test:release
npm run test:browser
npm run build
cargo test --locked --manifest-path src-tauri/Cargo.toml
npm run tauri -- build -- --locked
```

本地构建不等于签名公证发行包。`npm run dev` 提供浏览器预览，原生窗口功能需要桌面应用。

## 已知限制与许可

温度按传感器能力提供，可能不可用；其他传感器不冒充 CPU 温度。Cursor 是占位功能。最低系统、Intel、Finder、真实账户、升级及 T8 全屏/Space/休眠/缩放/副屏拔插恢复验收尚未完成。应用并非完全离线，详见[隐私说明](PRIVACY.md)。

保留 `com.syshud.app`、`sys-hud:*`、`sys-hud://*` 以延续偏好与缓存。诊断变量仍为 `SYSHUD_WINDOW_TRACE`。图标见[品牌记录](assets/brand/README.md)。

Copyright © 2026 Rayman Zhang · [AGPL-3.0-only](LICENSE)。第三方依赖遵循各自的许可证。
