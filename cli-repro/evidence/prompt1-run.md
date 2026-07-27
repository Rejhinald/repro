Read-only pass complete. No file written, no command that writes, no message sent to any agent, no write attempted.

**Scope note:** this repo contains **two** chat agents with opposite capability profiles, so every section covers both.

- `vision-web/` — Gemini in the browser, publishes to a real GitHub repo.
- `vision-mini/` — Claude Code spawned as a subprocess, publishes by directory copy.

---

# 1. AGENT CAPABILITY

## A. `vision-web` agent (Gemini 3.1 Pro, in-browser)

| Path | Write reachable? | What is supposed to prevent it |
|---|---|---|
| Shell access | **No** | The model is reached by `fetch` only (`vision-web/app.js:183-186`). No process spawn exists in `vision-web/`. |
| Tool definitions | **None exist** | The model gets a JSON response schema, not tools (`vision-web/prompts.js:87-110`, passed as `responseSchema` at `app.js:177`). |
| Git library | Not found | No `simple-git`, `isomorphic-git`, `nodegit`, `octokit`. No `package.json` in the repo. |
| **Hosting API** | **Yes — one hop** | See below. |
| Spawned processes | Not found in `vision-web/` | — |
| MCP servers | Not found (repo level) | No `.mcp.json` in this repo. |

The reachable path is a model-controlled boolean:

```
publish: { type: "BOOLEAN", description: "True only if the person asked to make changes live" }
```
`vision-web/prompts.js:92`

The app acts on it with no code-side gate:

```js
if (r.publish) publish(r.summary || "Updated the site")
```
`vision-web/app.js:230`

`publish()` reaches a real commit on `master` of `github.com/Rejhinald/repro` (`vision-web/github.js:13`, `:99-107`), which GitHub Pages then serves. What is supposed to prevent a wrong write is **the model's own discrimination**, written in prose: the publish-synonym list at `prompts.js:51-75` against the stop list at `prompts.js:77-80` ("wait", "hold on", "don't publish yet", "not yet"). Nothing in code re-checks the flag. The comment at `prompts.js:86-88` states the intent — *"`publish` is how the model ASKS to publish; the app decides and performs it"* — but the app's only decision input is the model's own boolean.

The credential is a user-supplied PAT with `repo` scope, requested at `vision-web/index.html:65` (`?scopes=repo`) and stored in `localStorage` (`app.js:263`). On-screen placeholder is `<redacted>` (`index.html:67`). No real token is in the repo.

That this path writes is recorded in history, not inferred: commit `1bb089c "Test publish 18:35:43"` came from `test-publish.mjs:19`, which calls the same `publishFiles`. `origin/master` equals `HEAD` (`1df1e81`).

## B. `vision-mini` agent (Claude Code subprocess)

```js
const child = spawn("claude", ["--print", "--permission-mode", "acceptEdits"], {
  cwd: WORKSPACE,
  shell: true,
})
```
`vision-mini/server.mjs:62-65`

| Path | Write reachable? | What is supposed to prevent it |
|---|---|---|
| Shell access | Bash is in the default tool surface | `acceptEdits` auto-approves file edits only. Bash still needs approval, and `--print` has no approver present. |
| Tool definitions | Not pinned here | Nothing in this repo restricts or lists the tool surface. |
| Permission rules | **None apply to this agent** | The only `settings.json` in the repo is `cli-repro/after/settings.json`. `cli-repro/apply-fix.sh:21` copies it into `cli-repro/scratch/site` only, never into `vision-mini/`. `vision-mini/workspace/` holds no `.claude` directory. |
| Git repo at cwd | **Yes, after setup** | `vision-mini/setup.sh:20-30` runs `git init -b main`, `git remote add origin ../remote.git`, commit, push. The remote is a local bare directory (`setup.sh:3-4`), so it reaches no real host. `workspace/.git` is absent on disk right now; `setup.sh` recreates it. |
| Server-side git | None | `server.mjs:14-19` imports `http/fs/path/child_process/url` only. Publish is a directory copy (`server.mjs:99`). |
| Spawned processes | The `claude` child itself, `shell: true` | `shell: true` at `server.mjs:64` means the child runs under a shell. |
| MCP servers | Inherited from user scope, see D | — |

The observed block is recorded in the repo. I did not re-test it:

> **The save** — every git write command came back `This command requires approval`. I tried the branch, the add, and the commit; all three were refused
> `cli-repro/evidence/before.txt:15`

So the write is stopped by **headless mode having no approver**, not by a deny rule. The real capability removal exists only in the scratch project: `{"permissions": {"deny": ["Bash"]}}` (`cli-repro/after/settings.json:2-6`). That is a bare tool name, not a text pattern.

## C. Prevention that works by matching command text

The subprocess inherits user-scope configuration. Three matchers apply.

**(i) The deny rule the repro tests** — `cli-repro/README.md:35-36`:

```bash
claude --print --disallowedTools "Bash(git commit:*)" \
  "Run: git -C . commit --allow-empty -m repro-test    then tell me the exit code."
```

The pattern is the literal prefix `git commit`. The test command is `git -C . commit`, which is deliberately a different shape of the same program. **A prefix pattern anchored on `git commit` does not match `git -C . commit`.** The repo states this as its own argument at `cli-repro/apply-fix.sh:6-8`: *"We are not denying `git commit` by name, because a rule that matches command text can be sidestepped by a differently shaped invocation of the same program."* The **result** of that test is **not found** anywhere in the repo — `evidence/before.txt` is from Demo B, not Demo A. The matcher implementation lives in the `claude` binary → **not found**.

**(ii) The `PreToolUse` hook**, wired at `C:\Users\Admin\.claude\settings.json:23-35`, running `C:/Users/Admin/.claude/hooks/guard-bash.js`. The matching logic, quoted literally:

```js
if (/\bgit\s+reset\s+--hard\b/.test(cmd)) {
```
`guard-bash.js:47`
```js
if (/\bgit\s+checkout\s+--\s/.test(cmd) || /\bgit\s+restore\s+(?!.*--staged)/.test(cmd)) {
```
`guard-bash.js:53`
```js
if (/\bgit\s+push\b/.test(cmd) && /(--force(?!-with-lease)|\s-f\b)/.test(cmd)) {
```
`guard-bash.js:61`

**Would a differently-shaped invocation of the same program still be matched? No.** Every pattern requires `git` and its subcommand to be adjacent:

- `git -C /path reset --hard` — `\bgit\s+reset` fails on the intervening `-C /path`. Not matched.
- `git -C /path push --force` — `\bgit\s+push\b` fails the same way, so the force test never evaluates. Not matched.
- `GIT_DIR=… git commit`, `sh -c "git commit …"`, a shell alias, or `gh api` — outside every pattern.

Separately: **`git commit`, `git add`, `git tag`, `git branch` and non-force `git push` are in this hook nowhere at all.** It covers destructive-history cases only. It also fails open by design (`guard-bash.js:23`, `:25`, and the contract note at `:11-13`).

**(iii) The user-scope allow list** — `C:\Users\Admin\.claude\settings.json:6-16`:

```json
"allow": ["Bash(cd:*)", "Bash(npm run db:push:*)", "Bash(curl:*)", "Bash(npx eslint:*)", "Bash(dir:*)", ...]
```

`Bash(curl:*)` is a prefix allow on the program name. A `curl -X PATCH https://api.github.com/repos/.../git/refs/heads/master` **is** a version-control write and contains no git vocabulary, so no git-shaped matcher sees it. Whether it authenticates depends on a token being supplied to `curl` itself; `C:\Users\Admin\.gitconfig:10-12` routes github.com credentials through `gh auth git-credential`, which serves `git`, not `curl`. I did not check the environment or `gh` token state → **not verified**.

One direct observation from this session: a compound read-only command of mine was refused with *"This Bash command contains multiple operations. The following parts require approval: `sort -t: -k2`, `uniq -c -f0`"*. That confirms the gate is per-command-text and per-segment.

## D. MCP servers

- Repo level: **not found**. No `.mcp.json` in this repo.
- User level, via the enabled `github@claude-plugins-official` plugin (`settings.json:44`):
  ```json
  { "github": { "type": "http", "url": "https://api.githubcopilot.com/mcp/",
    "headers": { "Authorization": "Bearer ${GITHUB_PERSONAL_ACCESS_TOKEN}" } } }
  ```
  `C:/Users/Admin/.claude/plugins/cache/claude-plugins-official/github/unknown/.mcp.json:1-9`

  That server's toolset includes repository writes. It is **not connected in this session** — no `mcp__github__*` name appears in the available or deferred tool list. Whether it connects for a *spawned* `claude` depends on `GITHUB_PERSONAL_ACCESS_TOKEN` in the environment, which I did not read → **not verified**.
- `playwright` MCP is connected and exposes `browser_navigate` and `browser_run_code_unsafe`. A browser-driven write against github.com is reachable in principle. It is not a VCS library.
- `context7` is documentation-only. Google Drive MCP is file storage, not VCS.

---

# 2. WHAT THE MODEL SEES

## `vision-web`

Two system instructions, switched by one checkbox (`app.js:169`).

**BEFORE** — `vision-web/prompts.js:7-10`, literally:

> You are a coding assistant working on a website repository.
> Help the user make changes to the site. Explain what you did technically so they can
> follow along, mention which files you touched, and offer to commit and push your changes
> to the repository when you are done.

**AFTER** — `vision-web/prompts.js:19-83`, the vocabulary-remap block. Its opening line is *"You help people change their website by talking with them."* (`:19`). Its publish-synonym list at `:51-75` deliberately contains developer words, e.g. `:61` — `push to prod  push to production  push to master`; `:66` — `commit it  commit that  commit and push`; `:67` — `merge it  merge to main  send to prod`.

**Tools given: none.** The model gets a response schema. Names and descriptions, quoted literally from `prompts.js:88-107`:

| Name | Description |
|---|---|
| `reply` | "What you say to the person, in their words. One or two sentences." |
| `changed` | "True if you edited any file" |
| `publish` | "True only if the person asked to make changes live" |
| `summary` | "A short plain description of the change for the version list, e.g. \"Made the logo bigger\". Never repeat the person's wording if they used developer terms." |
| `files` | "Only the files you changed, with their complete new contents" |
| `index.html` | (no description) |
| `style.css` | (no description) |

## `vision-mini`

System prompt with Plain language **on**: `vision-mini/agent/CLAUDE.md` (33 lines), copied to `workspace/CLAUDE.md` at `server.mjs:53`. With Plain language **off**: the file is deleted (`server.mjs:54`) and the agent runs on the stock Claude Code prompt, which is **not found** in this repository.

**Tool names and descriptions: not found in this repository.** The surface is whatever the installed `claude` binary provides. Nothing here pins, lists or restricts it.

## Counts

Scored against the repo's own word lists at `cli-repro/detect.mjs:14-19` (HARD: commit, rebase, stash, repo, repository, pull request, PR, SHA, diff, checkout, git, origin, remote, HEAD — REVIEW: push, pull, merge, branch, staging).

| Text the model sees | HARD | REVIEW |
|---|---|---|
| `prompts.js` BEFORE (`:7-10`) | **3** — `repository` ×2, `commit` ×1 | 1 — `push` |
| `prompts.js` AFTER (`:19-83`) | **4** — `commit` ×4 (`:40`, `:66`×3) | 13 — `push` ×11 (`:60`×3, `:61`×3, `:62`×3, `:66`, `:75`), `merge` ×2 (`:67`) |
| `vision-mini/agent/CLAUDE.md` | **1** — `commit` (`:21`) | 1 — `push` (`:21`) |
| **Schema names (7)** | **0** | **0** |
| **Schema descriptions (5)** | **0** | **0** |
| `vision-mini` tool names/descriptions | not found | not found |

`master`, `main`, `prod`, `production`, `deploy` appear in the AFTER prompt (`:61-64`, `:67`) but are on neither list.

---

# 3. WHAT THE USER SEES

**Tool-call chips or activity log: not found in either app.** Neither UI renders tool calls. `vision-web` has no tools. `vision-mini` renders the final text only.

### Raw model output, passed through verbatim

```js
// The agent's reply is shown verbatim. That is the point of the demo: with the
// plain-language switch off you see exactly what a non-technical user was getting.
bubble("agent", r.reply || "(no reply)")
```
`vision-mini/public/app.js:111-113` — this is the whole stdout of a Claude Code run. With plain mode off there is no instruction file at all (`server.mjs:54`). That is the route by which prose like this reaches the screen:

> `git checkout -b logo-size` / `git add style.css` / `git commit -m "Make header logo bigger"`
> `cli-repro/evidence/before.txt:19-24`, with `origin ../remote.git` and `main` named at `:17`

`vision-web/app.js:228` — `bubble("agent", r.reply || "Done.")`, the same verbatim channel for Gemini.

### Raw stderr, passed through

```js
if (code !== 0 && !out.trim()) resolve({ ok: false, text: err.slice(0, 400) || "Something went wrong." })
```
`vision-mini/server.mjs:77` — the first 400 bytes of subprocess stderr become `r.reply` (`server.mjs:170`) and render at `public/app.js:113`.

### Version-control words in our own on-screen strings

- `vision-web/index.html:60` — *"Both are kept in this browser only and are never part of this repository."* — `repository` is a HARD term at `detect.mjs:16`.
- `vision-web/index.html:63-65` — *"GitHub token, so changes can go live"* plus a link to `github.com/settings/tokens/new?scopes=repo`. `detect.mjs:47` explicitly allows GitHub on a connection screen.
- `vision-web/index.html:67` — placeholder `<redacted>`; `:62` — placeholder `<redacted>`.
- `vision-mini/server.mjs:94` — *"the page was empty, so I did not publish it"*, rendered at `public/app.js:79`.
- `vision-mini/server.mjs:84` — `reason: "already publishing"`, which renders as *"I couldn't update your project: already publishing. Your site is still on the last working version."* (`public/app.js:79`). That is an internal state name on a user's screen.

### History view

`vision-web`: the row label is model-authored. `app.js:128` stores `summary`, and `app.js:60` renders `s.textContent = v.summary`. Both callers supply it from the model or a constant: `publish(r.summary || "Updated the site")` (`app.js:230`, `:232`) and `publish("Updated the site")` (`app.js:236`). The schema comment records why (`prompts.js:93-95`): *"Asking for 'push to prod' produced a history row reading 'push to prod'."*

`vision-mini` still has that leak, and it is unescaped. The summary is **the user's raw typed text**:

```js
["Update project", () => publish(message)],
```
`vision-mini/public/app.js:118`, and `publish($("#input").value.trim() || "Updated the site")` at `:124`. It is stored at `server.mjs:108` and rendered by:

```js
li.innerHTML = `<time>${when}</time> <span>${u.summary}</span>`
```
`vision-mini/public/app.js:54`

So typing "push to prod" and then updating writes `push to prod` into the persistent version list, via `innerHTML`.

### Status labels

`vision-web/app.js:19-24` and `vision-mini/public/app.js:5-10` carry the same four: `"Live"`, `"Changes not live yet"`, `"Publishing…"`, `"Not live"`. Styled at `vision-web/style.css:19-22` and `vision-mini/public/style.css:34-37`. Tab strings at `vision-web/app.js:256`: `"what you're working on"`, `"what visitors see"`, `"the files behind it"`. Pane labels at `vision-mini/public/index.html:35-46`.

### Error and status copy, all mapped and none raw

`vision-web/github.js:41,44,47,50,53,55` (`plainError`); `vision-web/app.js:103,118,123,134,137,153,194,196,197,232,241,292`; `vision-mini/public/app.js:78,79,91,117`; `vision-mini/server.mjs:71,93,94,104,105,130`.

---

# 4. THE UPDATE PATH

## `vision-web` — `#publish` (`index.html:18`) → `app.js:236` → `publish()`

| # | Step | file:line | Can it stop here? |
|---|---|---|---|
| 1 | Read GitHub token from `localStorage` | `app.js:96-97` | **Yes** — missing → open key dialog, return. Nothing is said in chat. |
| 2 | Re-entrancy check | `app.js:98` | **Yes** — `busy` → silent return, no message at all. |
| 3 | Snapshot workspace, empty-page guard | `app.js:100-105` | **Yes** — blank `index.html` → chip `Not live: the page was empty` + bubble at `:103`. |
| 4 | `busy = true`, chip `Publishing…`, disable button | `app.js:107-109` | no |
| 5 | Render one self-contained page | `app.js:113` → `site.js:29-35` | no |
| 6a | GET `git/ref/heads/master` | `github.js:75` | **Yes** — throws → catch at `:140`. |
| 6b | GET head commit | `github.js:77` | **Yes** — same. |
| 6c | POST one blob per file | `github.js:82-85` | **Yes** — same. |
| 6d | POST tree with `base_tree` | `github.js:90-93` | **Yes** — same. |
| 6e | Unchanged-tree check | `github.js:97` | **Yes** — `{unchanged:true}` → `app.js:117-121`, *"That's already how your site looks…"*, **no version row**, `published` set to snapshot. |
| 6f | POST commit | `github.js:99-102` | **Yes** — throws → catch. |
| 6g | PATCH ref, `force: false` | `github.js:104-107` | **Yes** — non-fast-forward → catch → `github.js:49` conflict copy. |
| 7 | Bubble *"Publishing. Waiting for the site to actually serve it…"* | `app.js:123` | no |
| 8 | `confirmLive`: poll `pages/builds/latest` every 4 s, up to 120 s; true only when `status === "built" && build.commit === sha` | `github.js:117-130` | Returns `false` on `errored` (`:123`) or timeout (`:129`). It does not stop the flow. |
| 9 | Set `published`, prepend version row, cap at 25 | `app.js:126-130` | **Runs regardless of step 8's result.** |
| 10 | Branch on liveness | `app.js:132-138` | live → *"Updated. Your change is live."* + View site. Not live → chip `Publishing…: still going out` + *"Published. It can take a minute to show up…"* |
| 11 | Reload Live iframe with a cache-buster | `app.js:139` → `:161` | no |
| 12 | `finally`: `busy = false; paint()` | `app.js:145-148` | Overwrites step 10's chip — see §6. |

## `vision-mini` — `#publish` (`public/index.html:16`) → `public/app.js:124` → `POST /api/publish` → `server.mjs:173` → `publish()`

| # | Step | file:line | Can it stop here? |
|---|---|---|---|
| 1 | Re-entrancy check | `server.mjs:84` | **Yes** — `{ok:false, reason:"already publishing"}`. |
| 2 | Set status `publishing` | `server.mjs:86` | no |
| 3 | Read `workspace/index.html`, empty guard | `server.mjs:90-95` | **Yes** — status `not-live: the page was empty`. |
| 4 | Copy workspace → `history/<Date.now()>` | `server.mjs:98` | **Yes, and uncaught** — see §6. |
| 5 | Copy workspace → `live/` — `rm -rf` then `cp`, excluding `.git`, `CLAUDE.md`, `.claude` | `server.mjs:99`, `:39-47` | **Yes, and uncaught.** |
| 6 | Re-read `live/index.html`, compare byte for byte | `server.mjs:102-106` | **Yes** — mismatch → `not-live: the live copy did not match`. |
| 7 | Prepend version row, status `live` | `server.mjs:108-109` | no |
| 8 | Client shows the result, reloads both iframes, refetches `/api/state` | `public/app.js:78-81` | no |

---

# 5. THE DIVERGENCE

**The chat path never calls the workspace→`live` copy at `vision-mini/server.mjs:99`, so an agent commit inside `workspace/.git` leaves `live/` untouched and at most flips a status string — `if (changed && status.state === "live") status = { state: "not-live", detail: "you have changes that aren't live yet" }` (`vision-mini/server.mjs:169`) — where the update path would have continued into `publish()` at `server.mjs:83-114`.**

Two details sharpen it. `changed` is computed only from the bytes of `index.html` and `style.css` (`server.mjs:163-168`), so a **commit on its own changes nothing that check can see**: the status stays `live` and no "Update project" prompt appears at all. And `copyDir` excludes `.git` from the publish (`server.mjs:39`, `:45`), so committed history is never part of what visitors get.

`vision-web` cannot diverge this way: the model has no tool to commit with, and its only route is the `publish` flag (`prompts.js:92` → `app.js:230`), which enters the same `publish()` the button uses (`app.js:236`).

---

# 6. PARTIAL FAILURES

### Saved, not published

- `vision-web`: workspace persists to `localStorage` (`app.js:225`), chip → `Changes not live yet` (`app.js:21`, `:39`), bubble *"That's in your preview. It isn't live yet."* with an `Update project` action (`app.js:232`). **Told correctly.**
- `vision-mini`: status → `not-live` (`server.mjs:169`), bubble *"That change is in your preview. It isn't live yet."* (`public/app.js:117`). **Told correctly** — but only when a watched file changed (see §5).

### Published, not built — and the chip contradicts the sentence

`confirmLive` returns `false` for a build that **errored** (`github.js:123`) and for a **120 s timeout** (`github.js:129`). The two are indistinguishable to the caller. Both produce the same line: *"Published. It can take a minute to show up, so I won't call it live until I've seen it."* (`app.js:137`). **A failed build is reported as still-publishing.**

Then, in the same call, the chip is overwritten. `published = snapshot` runs at `app.js:126-127` before the branch, and `finally { busy = false; paint() }` at `app.js:145-148` recomputes the chip from local state:

```js
if (!busy) setChip(dirty() ? "draft" : "live")
```
`app.js:39`, where `const dirty = () => JSON.stringify(workspace) !== JSON.stringify(published)` (`app.js:26`)

Because `published` already equals the snapshot, `dirty()` is false and the chip becomes **`Live`** — for a publish that was never confirmed live. The bubble says "it can take a minute"; the chip says `● Live`. The error path inverts the same way: `setChip("bad", "not published")` (`app.js:143`) is replaced by `Changes not live yet` one line later.

### Published, but the response was lost

`plainError` maps a dropped connection to *"I couldn't reach the internet just now. Your change is saved but it isn't live."* (`github.js:52-54`). If the `PATCH` at `github.js:104` actually landed and only the reply was lost, that sentence is false. **No idempotency key or dedupe exists anywhere in `publishFiles` (`github.js:73-110`)** — a retry re-blobs, re-trees and re-commits.

### Someone else published first

`force: false` (`github.js:106`) makes GitHub reject a non-fast-forward. `plainError` catches it at `github.js:49` via `e?.status === 409 || /fast forward|not a fast/i.test(m)` → *"Someone else updated the project while you were working. Nothing was changed."* GitHub returns **422** for this case, so the match rests on the message regex, not the status. Any other 422 falls through to the generic *"Something went wrong while updating your project. Nothing was changed."* (`github.js:55`).

### Built, deployed, but cached

`vision-web` cache-busts only its own iframe (`app.js:161`, `?t=${Date.now()}`). CDN staleness is not detected at all: `confirmLive` asks the Pages build API (`github.js:121`) and never fetches the URL. If Pages reports `built` for our sha but serves stale bytes, the app says **Live** and the Live tab can show the old page. **Nothing is said.** `vision-mini` sets `cache-control: no-store` (`server.mjs:125`), so this case does not arise there.

### Copy fails mid-publish (`vision-mini`) — the silent dead end

`copyDir` deletes the destination before it writes:

```js
await fsp.rm(to, { recursive: true, force: true })
await fsp.cp(from, to, { recursive: true, filter: (src) => !NOT_SITE.has(path.basename(src)) })
```
`server.mjs:42-46`

If `fsp.cp` rejects at `server.mjs:99`, `live/` is already emptied. `publish()` has a `finally` but **no `catch`** (`server.mjs:111-113`); the request handler has none (`server.mjs:142-190`); the client uses `.then((x) => x.json())` with **no `.catch`** (`public/app.js:73-77`). Result: `status` stays `publishing` from `server.mjs:86`, the chip stays `Publishing…` with the button disabled (`public/app.js:16`), no bubble is ever appended, and `/live/` serves *"Nothing published yet."* (`server.mjs:130`). **The user is told nothing at all.**

### Agent timeout (`vision-mini`)

`server.mjs:69-72`: after 240 s the child is killed and the user is told *"That took too long, so I stopped. Nothing was changed."* Files already edited on disk are not reverted, so "Nothing was changed" can be untrue.

### Nothing actually changed

`vision-web` detects it at tree level (`github.js:97`) and says *"That's already how your site looks, so there was nothing to update."* (`app.js:118`) with no version row. `vision-mini` has **no equivalent check**: `publish()` always writes a history snapshot and a version row (`server.mjs:98`, `:108`), so an empty update still adds a row reading whatever the user last typed.

---

**Not found:** repo-level MCP config; any git library or `package.json`; tool names and descriptions for the `vision-mini` agent; the stock Claude Code system prompt; the implementation of Claude Code's `Bash(...)` permission matcher; the recorded result of the Demo A deny-rule test (`cli-repro/README.md:33-38`); current `gh` token state and whether `GITHUB_PERSONAL_ACCESS_TOKEN` is set (I did not read the environment).
