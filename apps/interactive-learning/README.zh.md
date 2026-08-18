# Interactive Learning Experience Pack

`@dsh-portable/interactive-learning` 是一个可独立安装的 DeepSeek Harness
学习体验包。它只新增由用户显式选择的 `learning` Agent preset，不会向
Standard、Code、Minimal 或 Cordis 增加模型工具或 standing prompt。

## 架构边界

- 包根入口是 Host capability，只注册不面向模型的 `learningActivities`
  协调服务。
- `./agent` 只由 Learning preset 挂载，注册两个窄工具
  `learning_question`、`learning_reveal` 和精简教学策略。
- Learning preset 还挂载 rc.7 原生 `ask_user_question`，只承接方向、深度、
  节奏等用户自主选择；有合理默认时不弹问题，教学证据由 Question/Reveal
  gate 承接。
- `./client` 注册 Learning 专属 composer、已完成工具视图和可扩展的活动
  renderer registry。
- `./protocol` 定义版本化、声明式的 Activity/Response 协议。
- `preset/learning/skills/interactive-teaching` 是按需加载的教学资源，不是
  产品外壳。

Client 即使全局加载，也只会接管同时满足以下条件的 pending wait：包含
Host 生成的 `dsh-learning/wait@2` envelope，并且 session、稳定 `callId`、
activity、phase 和 seq 与当前调用完全相同。因此普通问题和非 Learning preset
不会被接管，fork 也不会使父会话的 pending activity 复活。

## rc.7 交互闭环

1. Agent 以 `learning_question` 只发送一个当前 frame，Host 严格校验、签发
   lesson/round token，并创建一次 durable wait。
2. 学习者回答解除 Question；模型看到真实回答后，才为同一 token/seq 构造
   `learning_reveal`。
3. Reveal 在动画期间保持 pending。动画完成前“继续”不可用；reduced motion
   直接提交最终 frame，但仍必须等待用户继续。
4. 用户继续后保存 canonical `response@2` 并解除 Reveal。只有此后模型才可
   生成下一 Question，因此未来标题、问题和答案不会预装到 Client。

活动开始时没有在线 Client 会立即安全降级。活动显示后的临时断线可在 kernel
wait 中恢复；默认五分钟超时、session abort 或插件卸载都会生成 canonical
`skip`/`cancel` 结果，不会永久阻塞模型。重复 response 由 wait 的单次完成语义
拒绝。

## Activity Protocol v2

当前 frame 支持三种视觉：

- `parameter`：1～2 个有界参数、1～3 条曲线。
- `process`：Question 只有一个当前 frame，Reveal 只有同轮 before/after。
- `structure`：一个当前结构对比。

Question schema 不含答案、揭示或未来步骤字段；Reveal schema 不含下一问题或
新 input。两者都拒绝未知字段、非法引用、非有限数值及过大/过深数据。曲线只
接受有限白名单数学 AST。`activity@1` 仅用于旧会话回放，不再暴露为实时模型
工具。

## 外部安装与启用

从 npm 或干净 tarball 安装包后：

1. 在 Host composition 中添加包根
   `@dsh-portable/interactive-learning`，用于启用 broker；不要把 `./agent`
   全局挂载。

```yaml
- id: interactive-learning
  name: '@dsh-portable/interactive-learning'
```

2. 让 DSH Web module loader 读取包内 `dsh.client` 声明并加载 `./client` 及其
   inject 依赖。
3. 安装用户 preset，并重启 Host/Web runtime：

```powershell
dsh-learning-preset install --home <DSH_HOME>
```

4. 在新会话中显式选择 Learning。卸载时先停止使用该 preset、从 Host
   composition 移除包并重启，然后执行：

```powershell
dsh-learning-preset uninstall --home <DSH_HOME>
```

安装器在 `.agent-presets/learning/.dsh-managed.json` 中记录所有权。再次运行
`install` 即可升级：未修改的 owned file 会更新，用户修改过的文件会保留，
新版本以 sidecar 形式放在旁边。卸载只删除 hash 仍与 owned hash 一致的文件。

## 定向验证

不需要付费模型或用户凭证：

```powershell
pnpm --filter @dsh-portable/interactive-learning run build
pnpm --filter @dsh-portable/interactive-learning test
node apps/interactive-learning/lib/eval-cli.js
node apps/interactive-learning/tests/package-lifecycle.mjs <package.tgz>
```

离线教学门禁覆盖：visual 克制、续讲引用 response 证据、达到迁移标准后结束；
同时检查每个模型 step 只有一个 gate、Question/Reveal 时间顺序，以及配置的
答案/未来轮次标记没有提前泄漏。它是
可复现的规则与 fixture 门禁，不冒充真实模型质量评分。远程模型评分仍是需要
外部授权的独立门禁，本地测试不会读取或使用真实用户凭证。

真实浏览器验收使用生产组件和原生 DOM 事件，覆盖三组件鼠标/键盘操作、
submit/cancel、续讲、刷新回放、fork pending 隔离、Standard UI 隔离和零
Learning 网络请求。pinned composition 测试还会逐字比较 Standard、Code、
Minimal、Cordis 在挂载 Host broker 前后的完整 tool schema 与 assembled
standing prompt。

## Phase 0 结论

实现基于 pinned kernel `0.1.0-rc.7`，不依赖尚未发布的 upstream API。当前
keyed tool renderer、question PendingWait、稳定 session/call
identity 和 canonical tool result replay 支持双门控流程。rc.7 的
`ToolRunContext` 已直接暴露 `callId/rootCallId`；`tools/pre-execute`、
`tools/execute`、`tools/post-execute`、`tools/result` 与 `agent/pre-step`
可作为观测点，无需引入私有 telemetry API。Host、`./agent`、
`./client`、协议、preset 和 Skill 均由同一可安装包提供。

按方案继续延期的内容包括：跨会话掌握度、间隔复习、知识图谱、Obsidian/LMS
适配、任意模型生成 widget、第三方活动类型及 Electron 专用 Learning 代码。
