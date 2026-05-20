# PinStick

## Cross-platform (Windows/Linux/macOS) — Tauri preview

A lightweight Tauri app lives under `cross-platform/` with the same core features: note editor with local persistence, pin/unpin window via `always_on_top`, and **overlay mode** (always-on-top + transparency + click-through except the header toolbar).

**Overlay on Linux:** Full desktop click-through works on **X11**. On **Wayland**, transparency and toolbar controls (exit overlay, opacity menu) still work, but click-through to the desktop is not available—the app shows an in-window notice and keeps the header interactive.

### Build locally

```bash
cd cross-platform
npm install
npm run build
```

On Linux (Ubuntu 22.04, same as CI), install the Tauri GTK/WebKit toolchain first:

```bash
sudo apt-get update
sudo apt-get install -y \
  libgtk-3-dev \
  libwebkit2gtk-4.0-dev \
  libjavascriptcoregtk-4.0-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev \
  libsoup2.4-dev \
  build-essential \
  libssl-dev \
  patchelf \
  pkg-config
```
