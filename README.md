# PinStick

## Cross-platform (macOS/Windows/Linux) preview — Flutter

A lightweight Flutter app lives under `cross-platform/flutter` with the same core features (note editor + pin/unpin window using `window_manager`).

### Build locally

```bash
cd cross-platform/flutter
flutter create . --platforms=macos,windows,linux --project-name pinstick_cross
flutter pub get
flutter test
# build for your platform, e.g.:
flutter build macos --release
```

On Linux, install the GTK toolchain first (same as CI):

```bash
sudo apt-get update
sudo apt-get install -y clang cmake ninja-build pkg-config libgtk-3-dev liblzma-dev
```
