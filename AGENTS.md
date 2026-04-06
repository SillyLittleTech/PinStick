# PinStick — Agent Guidelines

## Version Bump Policy

**Every code change must include a version bump.** Version numbers follow `MAJOR.MINOR.PATCH` (e.g. `2.6.3`):

| Segment | When to increment | Examples |
|---|---|---|
| **MAJOR** (first number) | Fundamental rewrites, platform additions, breaking changes to core behaviour | Adding Windows/Linux support, complete UI overhaul |
| **MINOR** (second number) | Large but non-breaking feature additions or significant refactors | New user-facing feature, substantial logic change |
| **PATCH** (third number) | Any smaller codebase change — bug fixes, copy edits, minor tweaks | Fixing a close-dialog bug, updating a label, adjusting CSS |

### Where to bump

| File | Field |
|---|---|
| `cross-platform/src-tauri/tauri.conf.json` | `package.version` |
| `cross-platform/package.json` | `version` |
| `Jot.xcodeproj/project.pbxproj` (macOS) | `MARKETING_VERSION` |

Always bump **all relevant version fields** in the same commit as the code change. No version bump = incomplete change.

---

## General Rules

- Follow existing code style; do not add comments unless they match the style of the surrounding code.
- Make the smallest possible change that fully addresses the task.
- Do not fix unrelated pre-existing issues.
- Run existing linters/tests before and after changes to catch regressions.
