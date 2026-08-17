#!/usr/bin/env node
/**
 * Packaged boot entry for the desktop web build. It boots
 * the same `web` profile a source `dsh --profile web` invocation composes
 * (dsh-base + dsh-web-app bundle layers, the profile's own patch layer, the
 * `$DSH_HOME/cordis.patch.yml` layer, the agent-presets shipped root, and the
 * telemetry switch), with two packaged-runtime adaptations:
 *
 * - `DSH_HOME` defaults to `<exe-dir>/.dsh` so the exe is portable; an
 *   explicit `DSH_HOME` env var still wins.
 * - Real-filesystem runtimes resolve bare plugins from the profile first and
 *   heal its installation fallback, so profile-owned updates take effect.
 *   The legacy single-file runtime keeps resolving from its packaged VFS.
 *
 * After the tree settles, the local URL is polled and (unless `--no-open`)
 * opened in the default browser. All other flags pass through to the web
 * app's own flag family (`--host`, `--port`, `--trusted-host`, `--help`).
 *
 * @module @dsh-portable/runtime/packaged-bin
 */
export {};
//# sourceMappingURL=packaged-bin.d.ts.map