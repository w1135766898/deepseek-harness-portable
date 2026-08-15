# DeepSeek Harness for Win v1.0.7

[中文](RELEASE_NOTES.zh.md)

Windows x64 portable release · 2026-08-15

Community distribution, not an official Microsoft-signed build.

## Features

- Unified SemVer 2.0 parser and precedence comparator across JavaScript runtime, CLI, and PowerShell updater scripts.
- Clean Windows process tree termination via taskkill with PID recycling safety guards.
- Atomic configuration store writes, automatic backups, recovery fallbacks, and schema version upgrades.
- Section badge counts in release notes summaries within the desktop shell view.

## Improvements

- Refactored updater to transaction-based pipeline with pre-update backup, layout verification, post-update loopback health check probe, and automatic rollback on failure.
- Modularized standalone `update.ps1` to share underlying modules with `updater.psm1`.
- Added comprehensive Pester automated test suite with 6 test suites covering Checksum, MirrorFallback, PathSafety (Zip Slip prevention), ProcessTree, RollbackTransaction, and Semver.

## Fixes

- Idempotent legacy session data migration to `.dsh/sessions` with `.migrated` marker and directory lifecycle orchestration.
- Prevented stale desktop runtime metadata and guarded release packaging with strict source-consistency checks.

## Components

- Distribution: 1.0.7
- Desktop shell: 0.1.0-shell.2
- Kernel: 0.1.0-rc.5 (@deepseek-ai/dsh-web-app)
- Tag: v1.0.7

## Checksums and security

- Portable ZIP SHA-256: `49482891EB11355B3045FB1D487182651F8CD77540C23013E1AEC649CCAE1E4A`
- Setup SHA-256: `0E1ABBDC4A37D2448FBF6CC496230B61180025CDFEA9E222D4055FF96BFEA8C0`
- Verify SHA256SUMS.txt before launching.
- The executable is unsigned; Windows SmartScreen may warn.
- Conversations, credentials, settings, and attachments stay outside the release directory during updates.
