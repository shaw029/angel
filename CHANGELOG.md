# Changelog

Changes are grouped by release. Unreleased entries describe this source tree, not the current store listing. Dates below are GitHub publication dates in UTC.

## Unreleased — 0.3.0

Development builds currently identify as `0.3.0-dev.1`.

### Added

- Explicit AI download consent with size disclosure, an illustrative example, and a remembered Not now choice.
- Download progress across model files, cancellation, retry, cached-only automatic restart, and revision-specific consent.
- Lite and Full local Gemma profiles, each with a separately pinned model revision and download disclosure.
- Profile comparison gates for download reduction, companion judgment quality, and Chrome resource use.
- Website disclosure and draft store copy distinguishing the extension ZIP from the separate model download.

- Ask Angel controls for optional intent, explanations, quiet mode, and saved return points.
- Explanations and explicit correction on both nudge tiers.
- Regression tests, CI, synchronized development/release versions, packaged checksums, and a draft release workflow.

### Changed

- Ground visible nudge copy in current evidence and treat unknown intent as a reason to stay quiet.
- Learn alignment priors from explicit corrections only; retain the existing model.
- Scope context to tab/site episodes and deduplicate repeated reasons.
- Align architecture, privacy, evaluation, contribution, and release documentation with the implementation.

### Fixed

- Stale evidence and delayed inference delivery across navigation or changed preferences.
- Reminder delivery bypassing hard interruption limits.
- Concurrent counter/profile writes and previous-state duration measurement.
- Unequal feedback opportunities and unsupported awareness claims.

### Validation still required

Interactive Chrome lifecycle checks and real-model quality/performance evaluation, including Lite-versus-Full comparison.

## [0.2.2](https://github.com/shaw029/angel/releases/tag/v0.2.2) — 2026-09-18

- Added the Angel extension icon and refreshed website/store presentation.
- Published the website privacy policy and linked the Chrome Web Store listing.

## [0.2.1](https://github.com/shaw029/angel/releases/tag/v0.2.1) — 2026-09-02

- Removed unused manifest permissions and added a screenshot capture harness using the extension UI.

## [0.2.0](https://github.com/shaw029/angel/releases/tag/v0.2.0) — 2026-09-01

This historical release predates this changelog. Consult the tag and commit history for its complete contents.

## [0.1.0](https://github.com/shaw029/angel/releases/tag/v0.1.0) — 2026-05-18

Initial published GitHub release. Historical release summaries above were reconstructed from tags and commits; they are not a record of Chrome Web Store approval dates.
