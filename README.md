# dsh-visual-answer

把 DeepSeek Harness 的回答从"一大段文字"换成"一份可交互的 HTML 文档"。

## 它做什么

三块，彼此独立：

1. **输入框开关**：出现在输入框工具行、权限控件右侧。打开后，该会话后续请求会多出一段系统提示词，要求模型把答案写成自包含的可交互页面；关闭后恢复普通文字回答。开关状态存在会话日志里（`/visual` 命令 + `visualMode` 投影），刷新、重启、fork、回放后都一致。
2. **顶部页签「可视化」**：在会话顶部的「对话 / 轨迹」后面新增一个页签，列出本会话在 `.dsh/visual/` 下产出的全部 HTML 文档，按时间倒序。点一行，用 DSH 右侧 Sidebar 自带的 HTML 预览打开（脚本会执行）。
3. **模型产出的文件**：提示词规定输出到 `<会话工作目录>/.dsh/visual/<YYYYMMDD-HHmmss>-<slug>.html`，自包含、离线可用、不用 CDN，正文最多两句话加一个相对链接。

插件本身**不做会话内渲染**，也不操作页面 DOM 之外的任何东西；展示完全交给 DSH 的文件预览。

## 安装

```sh
export DSH="/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh"
"$DSH" plugin --profile desktop add link:"$PWD/plugins/dsh-visual-answer"
```

或者用 `plugin_manager` 的 `install_bundle`，目标是本目录的绝对路径。安装后刷新页面。

## 使用

1. 点输入框下方的「可视化」开关。
2. 问一个适合图解的问题，例如让模型解释一条调用链、对比两个方案、拆解一组数据。
3. 模型会用 `write` 写一个 HTML 文件，并在回复里给出相对链接；点链接或到顶部「可视化」页签里打开。
4. 关闭开关即恢复普通回答。

也可以直接在输入框敲 `/visual on`、`/visual off`、`/visual`（切换）。

## 配置

`cordis.patch.yml` 里可以改：

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `directory` | `.dsh/visual` | 文档目录，相对会话工作目录，必须在工作区内 |
| `sectionOrder` | `11800` | 注入的提示词段落在系统提示词中的顺序 |

## 依赖与兼容

- DSH `0.2.2-rc.1`（`engines.dsh` 为精确版本）
- `@deepseek-ai/cordis` ~4.1.0、`@deepseek-ai/schemastery` ~3.19.0、`zod` 4.4.3
- 服务依赖：`commands`、`systemPrompt`、`sessionProjections`；客户端依赖 `slots`、`locale`、`remote`、`remote.commands`、`remote.workspaceFiles`、`sidebarRight`

## 开发

```sh
export PNPM="$HOME/.dsh/dsh-runtimes/dsh-primary-runtime/dependencies/pnpm/bin/pnpm.cjs"
node "$PNPM" install
node "$PNPM" build       # tsc 产出 lib/index.js；复制 src/client.js 到 lib/client.js
node "$PNPM" typecheck
```

## 已知限制

- **HTML 预览是否执行脚本取决于 DSH 设置**：只有开启「Coding Tools」的交互式 HTML 预览时，页面里的 JS 才会运行；关闭时是净化后的静态预览，动效不生效。开关在设置里，本插件不改变它。
- **`.dsh/` 是隐藏目录**：文件会出现在 `git status` 中，建议把 `.dsh/` 加进项目 `.gitignore`；插件不会替你改项目文件。
- **上下文成本仍然存在**：模型写文件用 `write`，HTML 内容会进入工具结果与会话历史，但比把整页 HTML 写进回答正文小得多。文档过大时模型可能被 `max_tokens` 截断，提示词里已要求控制在约 80 KB。
- **只识别本插件的目录**：页签只列 `.dsh/visual/` 下的 `.html`，模型若写到别处不会出现。
- **没有自动刷新**：新文档生成后，页签需要点一次「刷新」（或重新进入页签）。
- 开关命令会在会话日志里留下 `command/run` 与 `command/done` 各一条，这是 DSH 命令的固有行为。
