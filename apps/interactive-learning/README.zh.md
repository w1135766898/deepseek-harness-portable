# Interactive Learning Experience Pack

`@dsh-portable/interactive-learning` 是一个可独立安装的 DeepSeek Harness
学习体验包。它只新增由用户显式选择的 `learning` Agent preset，不会向
Standard、Code、Minimal 或 Cordis 增加模型工具或 standing prompt。

## 架构边界

- 包根入口是 Host capability，只注册不面向模型的 `learningActivities`
  协调服务。
- `./agent` 只由 Learning preset 挂载，注册唯一的
  `learning_activity` 工具和精简教学策略。
- `./client` 注册 Learning 专属 composer、已完成工具视图和可扩展的活动
  renderer registry。
- `./protocol` 定义版本化、声明式的 Activity/Response 协议。
- `preset/learning/skills/interactive-teaching` 是按需加载的教学资源，不是
  产品外壳。

Client 即使全局加载，也只会接管同时满足以下条件的 pending wait：包含
Host 生成的 `dsh-learning/transport@1` envelope，并且 `sessionId` 与当前
会话完全相同。因此普通问题和非 Learning preset 不会被接管，fork 也不会
使父会话的 pending activity 复活。

## rc.5 交互闭环

1. Agent 调用带 `dsh-learning/activity@1` 的 `learning_activity`。
2. Host 严格校验 schema、生成可信 `activityId`，并创建 durable question
   wait；detail 同时携带版本化 envelope 和可读 Markdown fallback。
3. Client 渲染原生活动，把 `dsh-learning/response@1` 提交回同一个 wait。
4. broker 解除原工具调用，canonical result 随正常会话日志保存和回放；模型
   必须依据用户实际提交的证据续讲。

活动开始时没有在线 Client 会立即安全降级。活动显示后的临时断线可在 kernel
wait 中恢复；默认五分钟超时、session abort 或插件卸载都会生成 canonical
`skip`/`cancel` 结果，不会永久阻塞模型。重复 response 由 wait 的单次完成语义
拒绝。

## Activity Protocol v1

MVP 提供三个固定组件：

- `parameter_explorer`：1～2 个有界参数、1～3 条曲线。用户必须先写下并锁定
  预测，之后才可用鼠标或方向键调参。
- `process_stepper`：2～12 个步骤，可在 checkpoint 执行“先预测，再揭示”。
- `structure_compare`：对齐两个结构的项目，选择关键差异并解释。

协议拒绝未知版本、未知字段、过大 payload、非法引用、非有限数值及过深 JSON
或表达式。曲线只接受有限白名单数学 AST；不接受任意 HTML、JavaScript、
React、动态 import、网络脚本或 `eval`。

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

离线教学门禁覆盖：简单事实不过度使用 visual；参数关系、过程状态、结构差异
分别选择正确组件；续讲引用 response 证据；达到迁移标准后结束教学段。它是
可复现的规则与 fixture 门禁，不冒充真实模型质量评分。远程模型评分仍是需要
外部授权的独立门禁，本地测试不会读取或使用真实用户凭证。

真实浏览器验收使用生产组件和原生 DOM 事件，覆盖三组件鼠标/键盘操作、
submit/cancel、续讲、刷新回放、fork pending 隔离、Standard UI 隔离和零
Learning 网络请求。pinned composition 测试还会逐字比较 Standard、Code、
Minimal、Cordis 在挂载 Host broker 前后的完整 tool schema 与 assembled
standing prompt。

## Phase 0 结论

实现基于 pinned `ff70851` / kernel `0.1.0-rc.5`，没有假设 upstream master
或 rc.6 API。当前 keyed tool renderer、question PendingWait、稳定 session/call
identity 和 canonical tool result replay 足以支持 MVP；Host、`./agent`、
`./client`、协议、preset 和 Skill 均由同一可安装包提供。

按方案继续延期的内容包括：跨会话掌握度、间隔复习、知识图谱、Obsidian/LMS
适配、任意模型生成 widget、第三方活动类型及 Electron 专用 Learning 代码。
