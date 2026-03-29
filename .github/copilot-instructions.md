# PinStick — Development & Porting Guide

## Project Overview

PinStick is a lightweight macOS note-pinning app (formerly named "Jot") built with Swift/SwiftUI. It lives in the `SillyLittleTech/PinStick` repository.

---

## Branch Strategy

| Branch | Purpose |
|---|---|
| `main` | Stable macOS app with ARM (Apple Silicon) support |
| `cross-platform-dev` | Windows and Linux porting work |

### Working Rules
- All production-ready macOS changes merge into `main`.
- Cross-platform experiments stay on `cross-platform-dev` until proven stable and tested.
- Bug fixes that apply to both platforms should be cherry-picked from `main` into `cross-platform-dev` (or vice-versa) rather than duplicated.
- Open a PR to `main` only when the cross-platform work is validated through CI.

---

## ARM Support (Apple Silicon)

The app was originally built with x64 in mind. To make it ARM-native:

### Xcode Build Settings
1. Open `Jot.xcodeproj` (unzip `Jot.xcodeproj.zip` first).
2. Select the **Jot** target → **Build Settings**.
3. Set **Architectures** to `$(ARCHS_STANDARD)` (includes `arm64` + `x86_64` automatically).
4. Set **Build Active Architecture Only** to `No` for Release builds.
5. Under **Deployment**, set **macOS Deployment Target** to `12.0` or later for full Apple Silicon support.

### Verifying ARM Compatibility
```bash
# After building, check the binary supports both architectures
lipo -info build/Release/Jot.app/Contents/MacOS/Jot
# Expected: Architectures in the fat file: arm64 x86_64
```

### Testing Recommendations
- Build and run on Apple Silicon hardware (M1/M2/M3).
- Use GitHub Actions `macos-latest` runners — they run on Apple Silicon and will catch ARM-specific issues in CI.
- Run existing unit tests (`JotTests`) after the architecture change to confirm no regressions.

---

## Windows & Linux Porting Strategy

### Why Not a Full Rewrite Immediately?
AI-generated cross-platform code can have platform-specific bugs that are impossible to catch without running the app. The strategy below uses CI runners and beta testers as the safety net, avoiding the need for local VMs.

### Framework Options

| Framework | Language | Pros | Cons |
|---|---|---|---|
| **Qt** | C++ | Native look, powerful, cross-platform | Steep learning curve, C++ |
| **Tauri** | Rust + Web (HTML/CSS/JS) | Lightweight, modern, secure | Rust learning curve |
| **Flutter** | Dart | Fast UI, growing desktop support | Non-native look by default |
| **.NET MAUI** | C# | Microsoft-backed, good Windows support | Less mature on Linux |
| **Electron** | JS/TypeScript | Easy, huge ecosystem | Large binary size |

**Recommendation for PinStick**: Given the app's simplicity (note editor + pin-to-front), **Tauri** is the best fit — it produces small binaries, uses web tech for the UI, and has first-class GitHub Actions support.

### Code Organization for Shared Logic

```
PinStick/
├── shared/              # Business logic shared across platforms
│   ├── models/          # Note data model
│   └── storage/         # Persistence layer
├── macos/               # Native Swift/SwiftUI macOS app
│   └── Sources/
├── cross-platform/      # Tauri / Qt / Flutter app (cross-platform-dev branch)
│   ├── src-tauri/       # Rust backend
│   └── src/             # Web frontend (HTML/CSS/JS)
└── .github/
    └── workflows/
```

---

## GitHub Actions CI/CD

### Current Workflows

| Workflow | Trigger | What It Does |
|---|---|---|
| `prerelease.yml` | PR marked ready for review | Builds macOS app, creates prerelease; includes Windows/Linux placeholder job for future ports |
| `build-and-release.yml` | Push to `main` | Builds macOS app, tags release, publishes; includes Windows/Linux placeholder job for future ports |

### Testing on Windows & Linux Without Local VMs

GitHub Actions provides free hosted runners for all major platforms:

```yaml
strategy:
  matrix:
    os: [macos-latest, windows-latest, ubuntu-latest]
runs-on: ${{ matrix.os }}
```

This lets CI compile and test the cross-platform build on actual Windows and Linux machines without installing anything locally.

#### Docker for Lightweight Linux Testing
```yaml
- name: Test on Linux (Docker)
  uses: addnab/docker-run-action@v3
  with:
    image: ubuntu:22.04
    run: |
      ./cross-platform/scripts/build-linux.sh
      ./cross-platform/scripts/test-linux.sh
```

#### Adding Cross-Platform Builds to Workflows (Future)
When the cross-platform branch matures, extend `build-and-release.yml` with:
```yaml
- name: Build Windows App
  if: runner.os == 'Windows'
  run: |
    cd cross-platform
    npm run tauri build -- --target x86_64-pc-windows-msvc

- name: Build Linux App
  if: runner.os == 'Linux'
  run: |
    cd cross-platform
    npm run tauri build -- --target x86_64-unknown-linux-gnu
```

---

## Beta Testing Program

For real-world validation without a local VM:

1. **macOS** — TestFlight or direct `.app.zip` distribution via GitHub Releases.
2. **Windows** — GitHub Releases `.exe` / `.msi` installer; recruit Windows beta testers.
3. **Linux** — AppImage or Flatpak distributed via GitHub Releases.

Collect crash reports using Sentry or a lightweight logging service to catch issues you can't reproduce locally.

---

## Development Workflow

### Working on the `cross-platform-dev` Branch

```bash
git fetch origin
git checkout cross-platform-dev
# Make changes, commit, push
git push origin cross-platform-dev
```

Opening a PR from `cross-platform-dev` → `main` will trigger the prerelease workflow, giving you a build artifact before merging.

### Running CI Builds Without Merging

Trigger the release workflow manually with `workflow_dispatch`:

1. Go to **Actions** → **Build & Release macOS App**.
2. Click **Run workflow**, set **draft** to `true`.
3. GitHub will build and produce a draft release you can download and test.

### Merging Strategy

1. All Windows/Linux work stays on `cross-platform-dev`.
2. When a platform is stable (passes CI, passes beta testing):
   - Open a PR from `cross-platform-dev` → `main`.
   - The prerelease workflow builds and uploads artifacts automatically.
   - After review and merge, the release workflow publishes the new version.
3. Bump `MARKETING_VERSION` in `Jot.xcodeproj/project.pbxproj` before merging to trigger a new release tag.

---

## Project Structure Notes

```
PinStick/
├── Jot.xcodeproj.zip       # Xcode project (unzip before building)
├── PinStickApp.swift       # App entry point + ContentView
├── Item.swift              # Data model
├── Jot.entitlements        # macOS sandbox entitlements
├── Contents.json           # AppIcon.xcassets icon catalog
├── icon_*.png              # App icon assets (all sizes)
├── JotTests.swift          # Unit tests
├── JotUITests.swift        # UI tests
├── JotUITestsLaunchTests.swift
└── .github/
    ├── workflows/
    │   ├── prerelease.yml          # PR prerelease automation
    │   └── build-and-release.yml  # Main branch release automation
    └── copilot-instructions.md    # This file
```

### Asset Catalog Icon Sizes (macOS)

| File | Logical Size | Scale |
|---|---|---|
| `icon_16x16.png` | 16×16 | @1x |
| `icon_32x32.png` | 16×16 | @2x |
| `icon_32x32 1.png` | 32×32 | @1x |
| `icon_64x64.png` | 32×32 | @2x |
| `icon_128x128.png` | 128×128 | @1x |
| `icon_256x256.png` | 128×128 | @2x |
| `icon_256x256 1.png` | 256×256 | @1x |
| `icon_512x512.png` | 256×256 | @2x |
| `icon_512x512 1.png` | 512×512 | @1x |
| `icon_1024x1024.png` | 512×512 | @2x |
