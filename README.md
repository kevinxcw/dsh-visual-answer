# dsh-visual-answer

一个 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 插件：把模型回答从"一大段文字"换成"一份可交互的 HTML 文档"。

打开输入框里的「可视化」开关后，模型不再用长段落解释，而是写一个自包含的 HTML 页面（内联 CSS / SVG / 脚本，离线可用），并在回复里给出一个链接；会话顶部还有一个页签，列出本会话产出的全部页面。

## 功能

| 功能 | 位置 | 说明 |
| --- | --- | --- |
| 模式开关 | 输入框工具行，权限控件右侧 | 打开后，本会话后续请求会多注入一段系统提示词，要求模型用 HTML 页面作答；关闭即恢复普通文字回答。状态按会话保存，刷新、重启、fork、回放后保持一致。开关上带状态点，切换失败会变红并显示「切换失败」 |
| 产出校验 | Host 侧，每轮结束 | 检查本轮是否真的写出了可用的 HTML（存在于目录、mtime 落在本轮、有 `<html>`/`<body>` 且结尾完整）。不合格就触发门禁 |
| 轮末门禁 | Host 侧，`agent/turn-stopping` | 本轮没产出时，给模型补一次机会（注入一条「视觉门禁」消息，强制再写一轮）；仍然没有就作罢，本轮不产出文档，Host 不会代写 |
| 轮内配置冻结 | Host 侧，`turn/start` | 每一轮的「可视化/普通」在轮次开始、提示词组装时定死。轮次进行中切换开关，本轮仍按开始时的那套走，改动从下一轮生效 |
| 「可视化」页签 | 会话顶部页签栏 | 列出本会话在文档目录下产出的 HTML 文件，点击用 DSH 右侧 Sidebar 的 HTML 预览打开；标题旁显示模式开/关 |
| 关闭态提示 | Host 侧，系统提示词 | 本会话一旦开过模式又被关掉，提示词里会补一段「Visual answers: off」：明确要求回到普通文字、不要继续写页面、不要把历史文档当作要继续的格式。没开过模式的会话完全没有这段 |
| `/visual status` | 输入框 | 自检：模式状态、目录、文档数量、最新一份是否校验通过、上一次门禁结果 |

插件只做这些事，不在会话里自己渲染 HTML，也不修改 DSH 的其他界面。

## 环境要求

- DeepSeek Harness `0.2.2-rc.1`（`engines.dsh` 为精确版本，版本不符时安装会被拒绝）
- 桌面版或 Web 版图形界面（本插件只提供 Web 端界面，不含 CLI / TUI 部分）
- 构建时需要 pnpm（`corepack enable pnpm` 或 `npm i -g pnpm`）

## 安装

插件尚未发布到 npm，从仓库安装需要先构建，因为仓库不提交构建产物 `lib/`。

```sh
git clone https://github.com/kevinxcw/dsh-visual-answer.git
cd dsh-visual-answer
pnpm install
pnpm build          # 产出 lib/index.js 与 lib/client.js，安装时必需
```

然后把这个目录装进 DSH 的 profile，二选一：

- **桌面版**：在 DSH 的插件管理里安装本地目录（也可以让 DSH 助手用 `plugin_manager` 安装，目标填该目录的绝对路径）。
  不要用命令行操作 `desktop` profile，它会直接报错：`profile "desktop" is managed exclusively by the Electron application`。
- **Web / 命令行**：装进一个 `dsh` 命令能启动的 profile，例如

  ```sh
  dsh plugin --profile web add link:"$PWD"
  ```

装好后重启 DSH（Host 侧改动不支持热更新），或至少刷新页面让界面加载插件。

## 使用

1. 点输入框里的「可视化」开关，控件变成选中状态（旁边的小圆点会实心）。
2. 问一个适合图解的问题：解释一条调用链、对比两个方案、拆解一组数据、走一遍状态机。
3. 模型写一个 HTML 文件，回复通常只有一两句话加一个链接。点链接，或到顶部「可视化」页签里点那一行，在右侧 Sidebar 打开。
4. 再点一次开关即恢复普通文字回答。

不用鼠标也可以：输入框里敲 `/visual on`、`/visual off`，敲 `/visual` 则在开与关之间切换。

不确定现在到底开没开、上一轮到底写没写？敲 `/visual status`，它会给出模式、目录、文档数量、最新一份的校验结果和上一次门禁结果。

## 配置

没有用户可配置项。输出目录固定为 `<会话工作目录>/.dsh/visual/`：模型写入的位置和顶部页签读取的位置是同一个常量，所以暂不提供改路径的开关。

`cordis.patch.yml` 里的 `sectionOrder`（默认 `11800`）只控制注入的提示词段落排在系统提示词中的位置，影响与其它插件提示词段的先后顺序，一般不需要动。

## 已知限制

- **页面里的 JavaScript 不一定执行**：DSH 只有在开启「Coding Tools」的交互式 HTML 预览时才运行页面脚本；关闭时是净化后的静态预览，动效和交互不生效。这是 DSH 的全局设置，插件不会修改它。
- **`.dsh/` 是隐藏目录**：产出的文件会出现在 `git status` 里，建议在自己项目的 `.gitignore` 加上 `.dsh/`。插件不会替你改项目文件。
- **输出位置固定**：文档固定写到 `.dsh/visual/`，暂不支持改路径；模型写到别处的 HTML 不会出现在页签里。
- **门禁会多花一轮**：本轮没产出时，门禁注入一条补写消息让模型再走一步；这一步会多一次模型调用。
- **补写失败就是没有**：一轮只有一次补写机会，仍然没有文件时本轮不产出文档，Host 不会代写兜底页；页签里就是没有这一轮。
- **操作型追问也会留页**：提交代码、跑命令这类轮次也要写一张「操作回执页」，这是「每轮都有文档」的代价。
- **关闭后的惯性只能靠提示词约束**：模式关闭时 Host 不会拦截模型写 HTML（那会误伤"给我做个页面"这类正常请求），只会在本会话开过模式后补一段关闭说明。若你看到关闭后仍在产出页面，先看页签标题旁的「模式已关闭」，再敲 `/visual status` 确认。
- **页签不自动刷新**：新文档生成后需要点一次「刷新」，或切走再切回页签。
- **上下文成本仍然存在**：HTML 内容会作为 `write` 的工具结果进入会话历史，只是比把整页 HTML 写进回复正文小得多。文档过大时回复可能被截断，提示词已要求控制在约 80 KB。
- **开关会留下日志**：每次切换在会话日志里产生 `command/run` 与 `command/done` 各一条，这是 DSH 命令的固有行为。
- **未发布到 npm**：目前只能从仓库安装，且需要自行构建。

## 卸载

在插件管理里移除，或在对应 profile 下执行：

```sh
dsh plugin --profile <name> remove dsh-visual-answer
```

卸载后已生成的 HTML 文件仍留在各自项目的 `.dsh/visual/` 里，需要时手动删除。

## 开发

```sh
pnpm install
pnpm build        # tsc 产出 lib/index.js / lib/gate.js，并把 src/client.js 复制为 lib/client.js
pnpm typecheck
pnpm test         # node --test：gate.ts 的纯函数 + 用桩 Context 驱动 apply() 的门禁集成测试（含轮内切换）
```

目录结构：

| 路径 | 内容 |
| --- | --- |
| `src/index.ts` | Host 侧：`/visual` 命令、`visualMode` 会话投影、条件注入的系统提示词段、轮末门禁 |
| `src/gate.ts` | 页面校验、产出挑选、门禁三步策略（纯函数，可单测） |
| `test/*.test.mjs` | `node --test` 用例：校验、命名、Markdown 渲染、门禁三步策略、整条 Host 链路 |
| `src/client.js` | Client 侧：输入框开关、「可视化」页签 |
| `cordis.patch.yml` | bundle patch，插入一行 `dsh-visual-answer` |
| `locale/*.json` | 中英文案 |

兼容性：DSH `0.2.2-rc.1`；`@deepseek-ai/cordis` ~4.1.0、`@deepseek-ai/schemastery` ~3.19.0、`zod` 4.4.3。Host 侧依赖 Cordis 服务 `commands`、`systemPrompt`、`sessionProjections`，Client 侧依赖 `slots`、`locale`、`remote`、`remote.commands`、`remote.workspaceFiles`、`sidebarRight`。

## 许可证

[MIT](./LICENSE)
