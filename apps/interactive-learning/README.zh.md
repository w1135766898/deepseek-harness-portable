# Interactive Learning Experience Pack

`@dsh-portable/interactive-learning` 为 DeepSeek Harness 增加一个由用户显式选择的
`learning` Agent preset。Standard、Code、Minimal 与 Cordis 的工具 schema 和
standing prompt 保持不变。

## 架构

- 包根保留旧 `learningActivities` Host broker，只用于安全回放 V1/V2 历史会话；
  它不注册任何模型可见工具。
- `./agent` 只由 Learning preset 挂载，注册一个首选工具 `learning_visual` 和精简
  教学策略。
- `./client` 在对话流中原位渲染交互图，同时保持普通消息输入框可用；它也为旧
  `learning_activity`、`learning_question`、`learning_reveal` 调用保留只读回放。
- `./protocol` 维护封闭、版本化的声明式协议。
- `preset/learning/skills/interactive-teaching` 按需提供更细的教学判断。

当前设计把“解释”和“交互”解耦：图表是普通回答里的可操作插图，而不是接管用户
回合的表单。

## 非阻塞学习流程

1. 助手先用普通文本解释真正缺失的概念。
2. 只有当操控参数确实能帮助理解时，才调用一次 `learning_visual`，传入安全的
   声明式图表。
3. 校验后立刻返回 `visual-result@4 { status: "ready" }`。不会创建 lesson token、
   pending question、提交按钮、Reveal 调用或五分钟用户等待。
4. 图表在工具调用所在位置渲染；会话刷新或结果回放后仍可操作。
5. 助手继续解释关键现象，并在有必要时用普通文本问一个自然问题；学习者下一回合
   直接通过正常输入框回答。

这条链路移除了旧 Question → Reveal 双工具结构。旧结构会天然重复轮次，并让模型
回合在等待用户期间一直处于运行状态。周围文字仍须自洽，因此 Client 无法渲染时
只会失去增强图，而不会卡住模型或用户。

## 语义 Visual Protocol v4

`dsh-learning/visual@4` 会先按概念语义选择可信的原生渲染器：

- `plot`：函数、数据、概率、柱形以及其他定量关系；
- `node_link`：神经网络层、树、流程、因果关系与连接拓扑；
- `scene_2d`：几何、向量、力与带标注的空间示意；
- `relation`：对比、矩阵、分类以及集合关系；
- `timeline`：历史事件、发现过程、阶段和年代；
- `formula_steps`：公式推导、代数变换与逐步证明；
- `study_map`：带章节/页码锚点、先修关系和概念角色的参考材料导览；
- `recall_deck`：带提示、揭示和本地复习状态的主动回忆卡片。

任一类型都可加入仅聚焦已声明 id 的本地步骤序列。交互只用于探索，不会接管普通
对话输入框。渲染器提供可见标题、键盘可访问的对象检查、响应式布局、结构化文字
替代和局部错误边界。

`plot` 支持可选的有界滑块、静态散点、折线、柱、计算曲线、稳定坐标轴及参数指标；
当“改变参数”不是教学目标时不会强行加入滑块。单纯回忆公式应直接给公式；用户要求
网络结构时则必须显示节点和真实连线，不能再用一条曲线或 Markdown 字符画代替。

当用户附带整份文档、PDF、讲义或多份材料时，系统先保留真实章节与页码/标题锚点，
按需要用 `study_map` 给出可导航总览，再逐个概念选用更具体的视觉组件。不会把整份
材料压成一张巨型关系图，也不会未经请求就机械转换成卡片。

曲线使用封闭的递归数学 AST。叶节点为 `constant`、`variable`；二元运算为 `add`、
`sub`、`mul`、`div`、`pow`；一元运算为 `neg`、`abs`、`sqrt`、`sin`、`cos`、
`exp`、`log` 和数值稳定的 `sigmoid`。曲线可引用 `x` 与已声明参数；指标只能引用
参数，不能引用 `x`。

模型 schema 与运行时 parser 共享相同的表达式深度限制。未知字段、未声明变量、
非有限数值、无效引用、过大载荷和非法范围都会被拒绝。模型提供的 HTML、Markdown
图、SVG 标记或 JavaScript 永远不会执行。

V3 参数图与 V1/V2 活动仅为历史回放保留，Learning preset 不再向模型暴露它们的
旧工具。历史工具结果若失败，会明确显示错误和文字降级内容，不再伪装成一张灰色的
“已完成”活动。

## 开发与验证

真实桌面/Web 运行时通过 package exports 读取 `lib`，因此源码修改后必须重新构建并
完整重启：

```powershell
pnpm --filter @dsh-portable/interactive-learning run build
pnpm --filter @dsh-portable/interactive-learning test
pnpm run desktop:dev
```

浏览器 fixture 直接读取源码组件，适合快速视觉检查：

```powershell
& 'vendor/deepseek-harness/apps/web/node_modules/.bin/vite.cmd' `
  --config 'apps/interactive-learning/tests/browser/vite.config.mjs'
```

打开 `http://127.0.0.1:41739/`。它是组件验收页，不能替代真实打包桌面 smoke。

离线教学评估不读取真实用户凭证，也不冒充远程模型质量评分：

```powershell
node apps/interactive-learning/lib/eval-cli.js
```

发布前还应运行仓库完整测试和正常 Windows 打包流程，不要使用 `--skip-build`。

## 外部安装与启用

从干净包安装时：

1. 在 Host composition 中加入包根：

   ```yaml
   - id: interactive-learning
     name: '@dsh-portable/interactive-learning'
   ```

2. 让 Web module loader 读取包内 `dsh.client` 声明。
3. 安装 preset 并重启 Host/Web：

   ```powershell
   dsh-learning-preset install --home <DSH_HOME>
   ```

4. 在新会话中显式选择 Learning。

安装器在 `.agent-presets/learning/.dsh-managed.json` 中记录所有权，只更新未被用户
修改的 owned file；用户修改过的文件会保留，新版本放到 sidecar。卸载同样只删除
hash 仍归包所有的文件。

```powershell
dsh-learning-preset uninstall --home <DSH_HOME>
```

干净 tarball 生命周期测试验证 Host/Agent/protocol export、Client 激活元数据，以及
安全安装、升级和卸载：

```powershell
node apps/interactive-learning/tests/package-lifecycle.mjs <package.tgz>
```

暂不包含：任意可执行 widget、跨会话掌握度、间隔复习、知识图谱、LMS 适配，以及
静默采集滑块状态。如果精确参数值对下一步教学重要，应让学习者在普通回答里描述或
引用它们。
