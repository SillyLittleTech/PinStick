# AGENTS.md

## Cursor Cloud specific instructions

### Project overview

PinStick is a lightweight desktop note-pinning app with two implementations:
- **Native macOS app** — Swift/SwiftUI (cannot build on Linux)
- **Cross-platform app** — Tauri 1.5 (Rust + HTML/CSS/JS) under `cross-platform/`

Cloud agents work exclusively with the **cross-platform Tauri app** since the macOS native app requires Xcode/macOS.

### Running the cross-platform app

```bash
cd cross-platform
npm install
npx tauri dev    # development mode with hot-reload
npm run build    # production build (outputs .deb and .AppImage)
npm run check    # debug build without bundling (fast compile check)
```

### Linting and formatting

```bash
cd cross-platform/src-tauri
cargo clippy       # Rust linter
cargo fmt --check  # Rust format check
```

There is no JavaScript linter configured (the frontend is vanilla JS with no ESLint).

### Key caveats (Ubuntu 24.04 / Noble)

- **webkit2gtk-4.0 is unavailable** on Ubuntu 24.04. Tauri 1.5 requires it, but only `webkit2gtk-4.1` ships with Noble. The update script installs the 4.1 packages and creates pkg-config shims (`webkit2gtk-4.0.pc`, `javascriptcoregtk-4.0.pc`) plus library symlinks (`libwebkit2gtk-4.0.so` → `libwebkit2gtk-4.1.so`, etc.) to satisfy the build.
- **Rust stable must be the default toolchain.** The pre-installed pinned version (1.83) is too old; `rustup default stable` switches to the latest stable (1.95+), which supports `edition2024` required by transitive dependencies.
- The Tauri dev server emits a harmless deprecation warning: `webkit_settings_set_enable_offline_web_application_cache is deprecated and does nothing.` — this is safe to ignore.

### Tests

There are no automated tests for the cross-platform Tauri app. The native macOS app has `JotTests.swift` and `JotUITests.swift` but these cannot run on Linux.

Manual testing: launch the app with `npx tauri dev` (requires an X11 display) and verify the note textarea and pin button work.
