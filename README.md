# dsh-visual-answer

**Turns DeepSeek Harness answers into one self-contained, interactive HTML page, so you read the structure instead of a wall of prose.**

English | [中文](README.zh.md)

> **Status:** v0.3.0, developer preview. Not on npm yet — install from a local checkout. Tested with DSH `0.2.2-rc.1` on macOS.

A turn looks like this:

```text
You:  Trace a request through the gateway, the order service, the cache and the
      database, and mark where it retries.
DSH:  The three decision points and both retry windows are on the page.

      [Open the retry path](.dsh/visual/20261110-1802-retry-path.html)
```

The file behind the link is the answer: one complete HTML document with inline CSS, inline SVG or canvas and inline `<script>`, required to work without the network. It opens in the right sidebar and stays in the project under `.dsh/visual/`.

## Why

Agents write well, which is the problem. Ask how a request flows through four services and you get 1,200 accurate, orderly, hard-to-remember words: the call chain is a sentence, the two options sit three paragraphs apart, the retry window is a subordinate clause. Text is one-dimensional; the thing you are trying to understand is a graph. The reader ends up redrawing the diagram in their head.

With the switch on, the shape is drawn: boxes and arrows for the chain, cards side by side for a trade-off, a timeline for an incident. Detail stays available — click a step, hover a value, expand a branch — instead of being flattened into prose.

Keep it off for one-line answers, raw command output and pure code changes: there, prose is faster.

## What you get

| Surface | Name | What it does |
| --- | --- | --- |
| Composer | **Visual** switch | Turns the mode on or off for the current session. Takes effect from the next turn. |
| Session tab | **Visual** | Lists the pages in the project's `.dsh/visual/`, newest first; clicking a row opens it in the right sidebar. |
| Command | `/visual` | `on`, `off`, toggle, or `status` from the keyboard. |
| Turn gate | one corrective step | A turn that ends without a valid page gets exactly one nudge; if that produces nothing, the turn closes with no page. |

While the mode is on, the model receives a short note in the runtime context, not in the system prompt: toggling never rewrites the cached prompt.

## Quick start

### 1. Build the checkout

The repository does not ship `lib/`, so build before installing:

```sh
git clone https://github.com/kevinxcw/dsh-visual-answer.git
cd dsh-visual-answer
pnpm install
pnpm build
```

### 2. Install into a profile

**Desktop app:** open the plugin manager and install the local directory (the checkout above). Do not run the CLI against `desktop`: it answers `profile "desktop" is managed exclusively by the Electron application`.

**A profile the `dsh` CLI can start:**

```sh
dsh plugin --profile <profile> add link:"$PWD"
```

`dsh` ships with DeepSeek Harness; if it is not on your `PATH`, use the app's plugin manager.

### 3. Restart and confirm

The Host half is not hot-reloaded — restart DSH, then check the row:

```sh
dsh --profile <profile> --dump-config | grep -n -A3 dsh-visual-answer
```

### 4. First answer

Turn on **Visual** in the composer toolbar, next to the permission control, then ask something that benefits from a picture:

```text
Trace how a request moves through the gateway, the order service, the cache and
the database, and mark where it retries.
```

Expected: a page appears under `.dsh/visual/`, the reply is a sentence or two plus a relative link, and the **Visual** tab at the top of the conversation lists the page.

## Commands

| Command | Effect |
| --- | --- |
| `/visual on` | Turn the mode on; applies from the next turn. |
| `/visual off` | Turn it off; applies from the next turn. |
| `/visual` | Toggle. |
| `/visual status` | Mode, directory, page count, the latest page's verdict, and the last gate outcome. |

The switch is stored in the session log, so it survives reload, restart, fork and replay.

## Configuration

One key, and most people never touch it:

| Key | Type | Default | Description |
| --- | --- | --- | --- |
| `contextOrder` | number | `300` | Position of the mode note among runtime-context blocks. Lower comes earlier. |

```yaml
- insert:
    - id: dsh-visual-answer
      name: dsh-visual-answer
      config:
        contextOrder: 300
```

Overriding the row by `id` replaces the whole `config`; it is not a deep merge.

## Compatibility

| Item | Value |
| --- | --- |
| DSH | `0.2.2-rc.1` (`engines.dsh`) |
| Halves | Host + Client |
| Node | 24.21.0, the runtime bundled with DSH |
| Tested on | macOS 26.6.2, DSH 0.2.2-rc.1 |

Windows and Linux are untested.

## Permissions and safety

- **Reads:** `.dsh/visual/` under the session working directory — names, sizes, mtimes, and the content it validates; session commands and events; the `visualMode` session projection.
- **Writes:** the plugin writes no files. The model writes the page with its normal file tools, under DSH's file policy and approval. The gate only injects a text message.
- **Executes:** no shell, no subprocess.
- **Network:** none. Pages must be self-contained; the plugin never fetches anything.
- **Credentials:** none.
- **Approval:** writing the page follows the current file policy. If a write is denied, the turn ends without a page.
- **Uninstall:** `dsh plugin --profile <profile> remove dsh-visual-answer`. Pages stay in each project's `.dsh/visual/` until you delete them.

## Limits

- **One page per turn is the contract**, including operational turns such as running a command or committing. Those get a short receipt page instead of a report.
- **The directory is fixed** at `.dsh/visual/` and belongs to the project rather than the session, so pages from other sessions in the same project share the tab. It is hidden but still shows up in `git status`; add `.dsh/` to the project's `.gitignore`.
- **Page scripts need the interactive preview.** DSH runs a page's JavaScript only when the interactive HTML preview in Coding Tools is on; otherwise you get a sanitized static preview.
- **No fallback page.** One corrective step is offered, then the turn closes with whatever the model said.
- **Validation is structural.** A page counts when it is non-empty, contains `<html>` and `<body>`, and ends with `</html>`; the plugin does not review its content.
- **The switch is one turn behind.** Flipping it mid-turn does not change the running turn.
- **Turning it off is not absolute.** A transcript full of pages can still pull the model back to the format; the note in the context reduces it but is not a hard constraint.
- **Pages are model output.** Read before forwarding; the plugin adds no review of its own.

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `profile "desktop" is managed exclusively by the Electron application` | CLI used on the desktop profile | Install the directory from the app's plugin manager. |
| Plugin listed but there is no **Visual** switch | Client half stale | Restart DSH, then refresh the page. |
| The reply links a page but the tab is empty | Page written outside the session working directory | `/visual status` prints the exact directory it watches. |
| Page renders but buttons and tabs do nothing | Interactive HTML preview off | Turn it on in DSH's Coding Tools settings. |
| `.dsh/` shows up in `git status` | The output directory is inside the project | Add `.dsh/` to `.gitignore`. |
| Install fails with a missing `lib/index.js` | The checkout was not built | Run `pnpm build` before installing. |
| A turn ends with no page | The corrective step produced nothing either | `/visual status` reports it as `miss`; check the write policy, then ask again. |

## Development

```sh
pnpm install
pnpm build       # tsc → lib/index.js + lib/gate.js, then copies src/client.js → lib/client.js
pnpm typecheck
pnpm test        # node --test: gate unit tests and integration tests against a stub Cordis context
pnpm pack --dry-run
```

`pack --dry-run` should list `lib/`, `cordis.patch.yml`, `locale/`, `icon.svg` and `README.md`.

Bugs and requests: <https://github.com/kevinxcw/dsh-visual-answer/issues>.

## License

MIT. See [LICENSE](LICENSE).
