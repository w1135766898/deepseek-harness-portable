# Runtime architecture and release gates

This distribution uses one repository, one mode contract model, and target-specific capability implementations. A target is never treated as supported merely because `process.platform` has a particular value.

## Runtime boundary

`apps/runtime` owns runtime startup, capability measurement, mode compilation, mode availability, and the loopback diagnostics API. `apps/desktop` owns the Electron process boundary and supervises the stdout runtime protocol. `packages/platform-contract` owns build targets and their minimum support/signing policy. Interactive Learning and Vision Bridge remain independent feature modules; runtime mode work must not rewrite their application behavior.

The desktop/runtime protocol remains stdout-only and versioned. Packaged verification launches Electron in Node mode, decodes the real `hello`/`listening` stream, waits for the loopback readiness endpoint, and rejects malformed protocol output or early exit.

## Capability evidence

`CapabilityReport` is effect-based and records `available`, `degraded`, or `unavailable` with `reason` and `remediation`. Its stable snapshot hash excludes timestamps and binds mode-resolution traces.

The runtime performs bounded probes for:

- a real `node-pty` interactive round trip;
- two calls through the same persistent Bash PTY, including retained environment state;
- PowerShell executable, command, and persistent-shell phases independently;
- WSL executable, distribution, Bash, and persistent-Bash phases independently;
- ConPTY round trip on Windows;
- POSIX signal delivery through a child handler;
- a real sandbox write inside the workspace and a denied write outside it;
- the native Windows directory-picker worker IPC v1 health message without displaying a dialog.

An unmeasured platform or phase is `unavailable`, not inferred as available. The report tells UI/API consumers why it is unavailable and how to remediate it. The loopback endpoint is `GET /api/portable/runtime-capabilities`.

## Mode contracts and variants

Standard, Code, Cordis, and Minimal each declare a `mode.yml` contract. Stable behavior stays in the base composition; the resolver appends one small target-capability variant. Standard, Code, and Cordis currently provide `posix-bash` and `win32-powershell`; Minimal provides `posix-bash` and `win32-wsl`.

Final composition validation enforces required rows, forbidden rows, the exact enabled tool rows, and exactly one provider for the variant slot. Preset YAML contains no `process.platform` branches. A degraded capability satisfies a requirement only where the selected variant explicitly accepts that degradation.

If no variant satisfies the measured report, the compiler removes `preset.yml` and `agent.cordis.yml`; upstream discovery therefore cannot present the mode as selectable. It retains `mode-resolution.json` with `reason`, `remediation`, and missing capability details for UI/API use.

Each selectable mode records:

- mode and variant IDs;
- support level and limitations;
- final preset SHA-256;
- pinned upstream commit;
- capability snapshot SHA-256.

The same trace is appended to a session when the preset is selected.

## Build layers and patch gate

The build pipeline has explicit ordered boundaries:

1. initialize and fingerprint;
2. compile workspaces;
3. deploy the runtime closure, native assets, and reviewed patches;
4. create the unpacked target application;
5. stage distribution documents;
6. run packaged capability/protocol measurement;
7. write the release manifest and rerun the packaged smoke against final application bytes;
8. create platform containers;
9. validate the final containers read-only (ZIP contents, AppImage/deb headers and deb metadata, or `hdiutil verify`);
10. attest immutable artifacts.

`patches/manifest.yml` is the patch inventory. Each declared file has reviewed content guards. The patch layer records input and output SHA-256 values; a missing guard, unexpected upstream shape, empty transform, or undeclared implementation is a conflict and stops the build.

## Release manifest and immutable publishing

Manifest schema 3 contains source identities, target, runtime versions, runtime-closure hash, measured mode support, mode/preset/capability trace fields, patch input/output hashes, distribution classification, and a sorted `files[]` inventory with type, size, and SHA-256. `release-manifest.json` excludes itself from `files[]` to avoid recursive hashing.

The first packaged smoke supplies the measured mode support. Manifest creation rejects missing modes, support below `TargetSpec.requiredModeSupport`, or the wrong required variant. After the manifest is written, the packaged native-addon/protocol/readiness smoke runs again. Only then are ZIP/Setup, AppImage/deb, or DMG containers created and hashed into `artifact-verification.json`.

Release scripts require `--input <verified-bundle>`. They re-hash every artifact and copy the exact bytes. They cannot compile, patch, test, sign, or recreate an archive. Any byte change after verification is rejected.

## CI and external gates

`verify.yml` runs contract builds, targeted tests, dependency closure checks, and the preset platform-branch gate. `package.yml` uses native platform jobs:

- Linux x64 on a native GitHub runner;
- Windows x64 on a self-hosted runner labelled for working WSL and Inno Setup;
- macOS arm64 on a self-hosted Apple Silicon runner.

The verification record refuses a platform/architecture mismatch, so a cross-built artifact cannot be marked verified. `release.yml` downloads verified bundles and performs no build.

Current packages are explicitly `non-official-unsigned`. `TargetSpec.signing` requires evidence for Authenticode (Windows), signing plus notarization (macOS), or external package signing (Linux). Official publishing fails closed without that evidence. A manual `--allow-non-official` path may publish a clearly marked prerelease, but does not upgrade its classification.

The remaining platform gates are external by design: successful native Windows/WSL/Inno, Linux, and Apple Silicon CI artifacts, plus the target signing/notarization credentials and evidence required for an official release.

---

## 中文摘要

本项目采用“单一主干 + 统一模式契约 + 多平台能力实现”。运行时通过真实副作用探测 PTY、持久 Bash/PowerShell/WSL、signals、沙箱写入和 Windows directory-picker IPC；未实测能力必须返回 `unavailable + reason + remediation`，不能按平台静态宣称支持。

Standard、Code、Cordis、Minimal 都有契约与小型 variant。最终组合必须通过 required/forbidden/exact-row/单一 variant slot 校验；无法满足能力的模式会删除可发现的 preset 文件，只保留 UI/API 可消费的诊断 JSON。模式追踪包含 variant、preset hash、upstream commit 和 capability snapshot hash。

打包先实测能力，再写 manifest，随后对含 manifest 的最终应用字节再次执行 native-addon 与 `hello → listening → readiness` 冒烟。只有原生目标主机才能生成 `artifact-verification.json`。release 脚本只重新校验并复制已验证字节，不重建、不测试、不打补丁、不重新压缩。

当前产物明确为 `non-official-unsigned`。没有 Windows Authenticode、macOS 签名与公证、Linux 外部包签名证据时，正式发布失败关闭。剩余门禁仅能由原生 CI runner 与外部签名凭证完成。
