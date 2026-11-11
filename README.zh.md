# dsh-visual-answer

**让 Agent 的回答，从「一大段文字」变成「一页看得懂的图」。**

中文 | [English](README.md)

> **状态：** v0.3.0，开发者预览。尚未发布到 npm，从本地仓库安装；已在 DSH `0.2.2-rc.1` / macOS 上验证。

一轮问答长这样：

```text
你： 讲讲一次请求怎么经过网关、订单服务、缓存和数据库，重试发生在哪几层。
DSH：三个决策点和两段重试窗口都画在页面上了。

     [打开调用链](.dsh/visual/20261110-1802-retry-path.html)
```

链接后面的文件就是答案：一份完整的 HTML，CSS、SVG/canvas、`<script>` 全部内联，要求不联网也能打开。它在右侧 Sidebar 里读，文件留在项目的 `.dsh/visual/` 下。

## 为什么

Agent 太能写了。问它一条请求怎么走，它能还你一千多字：结构工整、逻辑完整，然后你读到三分之二，还是没记住谁调了谁。调用链是一句话，两个方案的差别隔了三段，重试窗口藏在从句里。文字是单线程的，而理解是网状的——最后是读者在脑子里重新画一遍图。

打开开关，形状直接画出来：调用链是方块和箭头，方案取舍是并排的卡片，排障过程是一条时间轴。细节没有丢——点一步、悬停一个数值、展开一个分支——只是不再被压成段落。

一句话能答完的问题、需要原样复制的命令输出、纯代码改动，关掉开关用文字更快。

## 你会得到什么

| 位置 | 名字 | 作用 |
| --- | --- | --- |
| 输入框 | **可视化**开关 | 按会话打开或关闭；从下一轮开始生效 |
| 会话页签 | **可视化** | 列出项目里 `.dsh/visual/` 下的页面，新的在前；点一行在右侧 Sidebar 打开 |
| 命令 | `/visual` | `on`、`off`、切换，或 `status` 自检 |
| 轮次门禁 | 一次补写 | 一轮结束时没有合格页面，Host 给模型一次补写机会；再没有，这一轮就没有页面 |

开关状态通过运行时上下文追加一条说明，不改写系统提示词，所以来回切换不会让整段提示词缓存失效。

## 快速开始

### 1. 构建

仓库不提交 `lib/`，装之前先构建：

```sh
git clone https://github.com/kevinxcw/dsh-visual-answer.git
cd dsh-visual-answer
pnpm install
pnpm build
```

### 2. 装进 profile

**桌面版：** 打开插件管理，安装本地目录（上面这个 checkout）。不要用命令行操作 `desktop` profile，它会直接报错：`profile "desktop" is managed exclusively by the Electron application`。

**dsh 命令能启动的 profile：**

```sh
dsh plugin --profile <profile> add link:"$PWD"
```

`dsh` 随 DeepSeek Harness 一起安装；不在 `PATH` 里就用桌面版的插件管理。

### 3. 重启并确认

Host 侧不支持热更新，重启 DSH，再确认插件行：

```sh
dsh --profile <profile> --dump-config | grep -n -A3 dsh-visual-answer
```

### 4. 第一次提问

点输入框工具栏里的 **可视化** 开关（权限控件右侧），然后问一个适合图解的问题：

```text
讲讲一次请求怎么经过网关、订单服务、缓存和数据库，重试发生在哪几层。
```

预期：`.dsh/visual/` 下多一个页面；回复只有一两句话加一个相对链接；会话顶部的 **可视化** 页签里能看到这一页。

## 命令

| 命令 | 作用 |
| --- | --- |
| `/visual on` | 打开，从下一轮生效 |
| `/visual off` | 关闭，从下一轮生效 |
| `/visual` | 在开与关之间切换 |
| `/visual status` | 模式、目录、文档数、最新一份是否通过校验、上一次门禁结果 |

开关记在会话日志里，刷新、重启、fork、回放都还在。

## 配置

只有一个键，通常不用动：

| 字段 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `contextOrder` | number | `300` | 模式说明在运行时上下文块里的位置，越小越靠前 |

```yaml
- insert:
    - id: dsh-visual-answer
      name: dsh-visual-answer
      config:
        contextOrder: 300
```

按 `id` 覆盖这一行时，`config` 会整段替换，不会深合并。

## 兼容性

| 项目 | 值 |
| --- | --- |
| DSH | `0.2.2-rc.1`（`engines.dsh`） |
| 组成 | Host + Client |
| Node | 24.21.0，DSH 自带运行时 |
| 已验证 | macOS 26.6.2 + DSH 0.2.2-rc.1 |

Windows 和 Linux 未验证。

## 权限与安全

- **读取：** 会话工作目录下的 `.dsh/visual/`——文件名、大小、修改时间，以及校验时读的页面内容；会话命令与事件；`visualMode` 会话投影。
- **写入：** 插件自己不写文件。页面由模型用自己的文件工具写，走 DSH 当前的文件权限与审批；门禁只注入一条文本消息。
- **执行：** 不跑 shell，不起子进程。
- **联网：** 不联网。页面必须自包含，插件也不会去下载任何东西。
- **凭据：** 不读取。
- **审批：** 写页面按当前文件策略走；被拒绝就是这一轮没有页面。
- **卸载：** `dsh plugin --profile <profile> remove dsh-visual-answer`。已生成的页面留在各项目的 `.dsh/visual/` 里，需要时手动删除。

## 已知限制

- **每轮一页是约定**，操作型请求（跑命令、提交代码、改文件）也一样，会给一张简短的「操作回执页」。
- **目录固定**在 `.dsh/visual/`，按项目算而不是按会话算，同一项目里其它会话的页面也会出现在同一个页签里。它是隐藏目录，但仍会出现在 `git status` 里，建议把 `.dsh/` 加进 `.gitignore`。
- **页面脚本不一定执行。** DSH 只有在 Coding Tools 里开启交互式 HTML 预览时才运行页面里的 JavaScript；关掉时是净化后的静态预览。
- **没有兜底页。** 只给一次补写机会，再没有就按模型当时说的话收尾。
- **校验只看结构。** 非空、含 `<html>` 和 `<body>`、以 `</html>` 结尾就算合格；内容质量插件不管。
- **开关慢一轮。** 本轮进行中切换，本轮仍按开始时的模式走。
- **关闭后偶尔有惯性。** 历史里堆满页面时，模型可能还会顺手写一页；上下文里的关闭说明能收敛，但不是硬约束。
- **页面是模型产出。** 转发前自己看一眼，插件不做内容审核。

## 排错

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| `profile "desktop" is managed exclusively by the Electron application` | 用命令行操作了桌面 profile | 改用桌面版插件管理安装这个目录 |
| 插件装上了，但没有 **可视化** 开关 | Client 侧还是旧的 | 重启 DSH，再刷新页面 |
| 回复里有链接，页签里却是空的 | 页面写到了会话工作目录之外 | `/visual status` 会打印它监视的目录 |
| 页面能开，但按钮和标签页没反应 | 交互式 HTML 预览没开 | 到 DSH 的 Coding Tools 设置里打开 |
| `.dsh/` 出现在 `git status` 里 | 输出目录在项目内 | 把 `.dsh/` 加进 `.gitignore` |
| 安装时报找不到 `lib/index.js` | checkout 没构建 | 先 `pnpm build` 再安装 |
| 某一轮结束时没有页面 | 补写那次也没产出 | `/visual status` 会标成 `miss`；检查写入权限后再问一次 |

## 开发

```sh
pnpm install
pnpm build       # tsc → lib/index.js + lib/gate.js，并把 src/client.js 复制为 lib/client.js
pnpm typecheck
pnpm test        # node --test：门禁单测 + 桩 Cordis context 驱动 apply() 的集成测试
pnpm pack --dry-run
```

`pack --dry-run` 里应能看到 `lib/`、`cordis.patch.yml`、`locale/`、`icon.svg` 和 `README.md`。

问题与建议：<https://github.com/kevinxcw/dsh-visual-answer/issues>。

## 许可证

MIT，见 [LICENSE](LICENSE)。
