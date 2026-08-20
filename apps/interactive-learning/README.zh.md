# Interactive Learning Experience Pack

`@dsh-portable/interactive-learning` 为 DeepSeek Harness 增加一个由用户显式选择的
`learning` Agent preset。Standard、Code、Minimal 与 Cordis 的工具 schema 和
standing prompt 保持不变。

## 架构

- 包根提供 `learningActivities` Host broker，并在加载持久化 Learning 会话前注册
  必需的 `learning/state` session event 类型；它不注册任何模型可见工具。
- `./agent` 只由 Learning preset 挂载，初始模型目录包含紧凑的
  `learning_visual_select`、静默的 `learning_state_update` 和可选的
  `learning_checkpoint_select`。standing policy 只来自
  一个规范 TypeScript 源，不再由 Skill 复制维护。
- `./client` 在对话流中原位渲染 visual 与可选 checkpoint；state update 明确为空
  视图。V1/V2 活动和 V3 visual 仍保留只读回放。
- `./protocol` 维护封闭、版本化的声明式协议。
- `preset/learning/skills/interactive-teaching` 按需提供更细的教学判断。

普通对话仍是默认路径。图表是普通回答里的可操作插图，不会接管用户回合。唯一的
主动等待是 reflective pause：只有当学习者的回答会改变下一教学动作时，才使用兼容
旧协议命名的 checkpoint 工具，并在一次结果后结束。

## Learn intent 与首轮路由

系统先区分“建立理解”和普通任务，再选择首轮形状。`what is X`、裸概念名、持续
混淆/没学会、先修知识与学习路径、以及 flashcards/study guide 请求都属于 learn
intent；编码实现/调试、翻译改写、新闻更新、资源推荐和观点判断留在普通任务路径。
当前或有争议主题在用户要结构化理解时仍属于 learn intent。裸概念先做一次改变
路线的校准；定义、明确的混淆和清晰目标直接讲最小必要概念。

## 非阻塞学习流程

1. 助手先用普通文本解释真正缺失的概念。
2. 只有当操控参数确实能帮助理解时，才调用一次 `learning_visual`，传入安全的
   声明式图表。
3. 参数流式传输期间，工具调用所在位置显示正在准备的视觉标题，而不是一句笼统的
   等待提示。
4. 校验后立刻返回 `visual-result@4`。不会创建 lesson token、pending question、
   提交按钮、Reveal 调用或五分钟用户等待。结果区分 `ready` 与 `unavailable`：
   当前组合若没有 Learning Client，视觉不会渲染，助手改用普通文字讲清同一件事，
   并且不会提到学习者看不到的图；未渲染的视觉也不会被记成一次已发生的教学动作。
5. 图表在工具调用所在位置渲染；会话刷新或结果回放后仍可操作。
6. 助手继续解释关键现象，并在有必要时用普通文本问一个自然问题；学习者下一回合
   直接通过正常输入框回答。

这条链路移除了旧 Question → Reveal 双工具结构。旧结构会天然重复轮次，并让模型
回合在等待用户期间一直处于运行状态。周围文字仍须自洽，因此 Client 无法渲染时
只会失去增强图，而不会卡住模型或用户。

## Session-scoped LearnerState

Learning 只为当前 session 保存一份小型、暂定的教学状态：当前目标、已展示的先验、
误解或缺口、由 learner evidence 推导的支架需求、急迫/真正卡住的证据、评估语境、
带表示方式和失败原因的有界 failed-move 历史，以及独立完成（含新情境迁移）的证据。
learner evidence 可以是 `correct`、`partial`、`incorrect` 或未知；partial 不会被当成掌握。

生产链路是显式且可审计的：

1. 普通 learner message 仍进入正常会话。只有具体观察会实质改变下一教学动作时，
   模型才可调用内部 `learning_state_update`，不能机械地每轮调用。
2. visual 完成与 checkpoint 终态只写入 Host 能确定观察到的事实。仅“提交”只证明发生
   了 learner action，绝不自动代表正确、独立、取得进展或掌握。
3. 每次有效更新都会把去除 session identity 的严格完整快照追加为必需的
   `learning/state` 事件；未知的必需事件会 fail closed。
4. 每个后续 model step 前，动态 prompt context 都会重新 fold 持久事件，并生成
   100–300 token 的有界 tentative summary。

快照不携带 session id。刷新和 resume 会 fold 同一日志；fork 会把继承快照重新绑定
到新 identity，之后各自独立变化。Reset 追加清空后的新 revision，因此旧异步结果
不能复活之前的状态；dispose 只清理进程内 fold cache。这不是跨会话用户画像、人格或
“学习风格”分类，也不是长期掌握度。学习者可在普通对话中纠正状态，但自称掌握不能
替代独立正确证据。

## Session 内学习路线

多数学习片段不需要路线：一个概念、一次直接回答或一处纠正本身就是完整的。只有当
目标确实跨越几个互相依赖的步骤时（多章节材料、有真实先修的过程、学习者自己提出
的多部分目标），才会记录一条路线。

路线随 LearnerState 存活于当前 session，同样是可修订的假设而不是契约：

- 最多 6 个步骤，状态只有 `pending`、`active`、`evidenced`，任何时刻至多一个
  `active`。
- 步骤只能由学习者产生的证据推进，不能因为"讲过了"就标记完成。
- 修订路线会保留同一步骤 id 上已经取得的 `evidenced`，不会抹掉已证明的进展。
- 注入模型的上下文只包含目标和当前这一步，不列出整张清单——路线因此无法被当成
  待办事项逐条推进。
- 已展示迁移即结束该学习片段，无论路线还剩几步；未走完的路线永远不是继续的理由。
- reset 会连同路线一起清空。

## 可选 Reflective Pause（兼容 checkpoint protocol v1）

`dsh-learning/checkpoint@1` 只用于会实质改变下一教学动作的预测、解释、对比、设计选择、
调试诊断、边界情况或迁移应用。它不是默认输入路径，也不能变成每轮 Continue 仪式。

- 每个 session 最多一个 pending checkpoint；每个 model step 最多一个不同 checkpoint。
- 五种封闭类型为 `free_text`、`single_choice`、`numeric`、`prediction` 和
  `code_slot`。单选结果传稳定 option id，label 只负责展示。
- 卡片标题显示这次要求的认知动作（预测、解释、对比、迁移或尝试），而不是“检查点”这类内部机制标签——标准策略本就禁止把普通回合标注成机制名称。
- pending payload 只能包含当前 prompt、context、expected evidence、无答案 options
  和自洽 fallback；正确答案、评分 rubric、solution 与未来步骤都会被拒绝。
- 终态只有 `submitted`、`skipped`、`cancelled`。刷新恢复同一 wait 和 draft；call 与
  receipt 重放幂等，冲突复用则 fail closed。
- Skip、Cancel、timeout、renderer failure 或无 rich Client 都会恢复普通对话；不会再
  产生 Reveal、animation、Continue 或第二次等待。

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

通过 schema 校验的载荷一定会渲染成对应图形，不会退化成 Markdown、描述文字或
错误框。如果某条曲线在声明的坐标范围内没有任何取值（例如负数域上的 `log`、
`sqrt`，或整条曲线落在 y 轴范围之外），图表仍然照常绘制，并在空白处说明当前
坐标范围内没有可显示的数值，同时在图例中标出该系列，而不是留给学习者一个看
起来坏掉的空框。

V3 参数图与 V1/V2 活动仅为历史回放保留，Learning preset 不再向模型暴露它们的
旧工具。历史工具结果若失败，会明确显示错误和文字降级内容，不再伪装成一张灰色的
“已完成”活动。

## 设计系统与可访问性

所有学习界面共用一套设计令牌，声明在 `src/client/tokens.module.css` 的
`[data-learning-scope]` 上。两个 CSS Module 会被编译成各自独立的 `<style>`
标签，无法通过 class 共享样式，因此共享值以自定义属性的形式继承下去；每个根
组件通过 `learningScope` 加上该属性即可加入同一套标准。

令牌覆盖字号阶、间距阶、圆角、层级阴影、控件尺寸、动效时长，以及唯一的主色、
语义色板与焦点环。两份样式表因此不再出现裸字号、裸圆角或直接引用的主机别名。
每个主机别名在令牌层内都带降级值，主题若缺少某个别名，界面会退化为可用颜色而
不是失效声明。

视觉渲染器面向键盘与辅助技术：

- 一张图形只占一个 Tab 停靠点。`node_link` 最多可声明 48 个节点与 160 条连线，
  `scene_2d` 最多 64 个图元；进入图形后用方向键在图元间移动，Home / End 跳到
  首尾，Enter 或 Space 选中。
- 图表探针的读数写入 `aria-live` 区域，键盘探查因此会被朗读；按 Escape 清除。
- 图形的可访问名称只是一句摘要，完整的结构化文字替代作为可读内容存在，便于逐
  条浏览而不是被当成一长串名称念出。
- 焦点环、动效时长与减弱动效偏好都由令牌层统一提供。

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

打开 `http://127.0.0.1:41739/`。它覆盖 visual 回放，以及 checkpoint 的提交、跳过、
取消、刷新草稿和 session 隔离；但仍只是组件验收页，不能替代真实打包桌面 smoke，
页面自带的测试输入框也不能证明真实 Host composer 的生命周期。

无凭证离线教学评估使用手写 rubric fixture，只验证 grader 与协议不变量；它不是
“模型已经会教学”的真实行为证据：

```powershell
pnpm --filter @dsh-portable/interactive-learning eval
```

退役的 V2 Question → Reveal → animation → Continue 时序只保留为明确命名的
`gradeLegacyV2ReplayTranscript` 只读历史回放审计。默认 V4.1 eval 不会调用它，
也不会把双门时序当作当前教学成功标准。

`tests/model-canary.mts` 是单独标注、可选的真实模型 smoke，只验证一次非阻塞 visual
调用；它不是多轮教学质量结论，并需要 `DSH_CANARY_API_KEY`。真实模型结果必须保留
provenance，不能与 fixture 结果混报。

包级验证会构建产物、扫描已发布 JS/map 是否泄漏 checkout 或盘符绝对路径、创建真实
tarball、安装到干净临时 consumer、解析 Host/Agent/Client exports，并验证托管 preset
生命周期：

```powershell
pnpm --filter @dsh-portable/interactive-learning run test:package:purity
pnpm --filter @dsh-portable/interactive-learning run test:package
```

发布前还应运行仓库完整测试和正常 Windows 打包流程，不要使用 `--skip-build`。

## 外部安装与启用

从干净包安装时：

1. 在构造 Loader、agent-loop 或恢复任何 configured session 之前，先导入带副作用的
   bootstrap（再次显式调用其导出函数也是安全的）：

   ```ts
   import '@dsh-portable/interactive-learning/bootstrap'
   ```

   Host 也可把兼容性 bootstrap composition row 明确放在 `agent-loop` 之前，但普通的
   晚加载插件 row 不能提供同等时序保证。portable runtime 通过 boot 前静态导入
   `./preset` 获得这一顺序。

2. 在 Host composition 中加入包根：

   ```yaml
   - id: interactive-learning
     name: '@dsh-portable/interactive-learning'
   ```

3. 让 Web module loader 读取包内 `dsh.client` 声明。
4. 安装 preset 并重启 Host/Web：

   ```powershell
   dsh-learning-preset install --home <DSH_HOME>
   ```

5. 在新会话中显式选择 Learning。

安装器在 `.agent-presets/learning/.dsh-managed.json` 中记录所有权，只更新未被用户
修改的 owned file；用户修改过的文件会保留，新版本放到 sidecar。卸载同样只删除
hash 仍归包所有的文件。

```powershell
dsh-learning-preset uninstall --home <DSH_HOME>
```

暂不包含：任意可执行 widget、跨会话掌握度、间隔复习、知识图谱、LMS 适配，以及
静默采集滑块状态。如果精确参数值对下一步教学重要，应让学习者在普通回答里描述或
引用它们。
