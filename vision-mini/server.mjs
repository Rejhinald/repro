// Minimal Vision: prompt a site, see it in preview, publish it live.
//
// Two directories are the whole idea:
//   workspace/  what you are editing. The preview serves this.
//   live/       what the public sees. Publishing copies workspace -> live.
//
// Publishing is a directory swap, so live is byte-identical to the preview you
// approved. That is the "1:1" property, and it is why this demo can honestly say
// "live" without a deploy pipeline: there is nothing between the two but a copy.
//
// The agent is Claude Code running headless with cwd=workspace, which is the same
// shape as "cloud code running in a box on their repo".

import http from "node:http"
import fs from "node:fs"
import fsp from "node:fs/promises"
import path from "node:path"
import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"

const ROOT = path.dirname(fileURLToPath(import.meta.url))
const WORKSPACE = path.join(ROOT, "workspace")
const LIVE = path.join(ROOT, "live")
const HISTORY = path.join(ROOT, "history")
const AGENT_PROMPT = path.join(ROOT, "agent", "CLAUDE.md")
const PORT = Number(process.env.PORT ?? 4000)

// plainMode true  = the fix is applied (agent gets the vocabulary block)
// plainMode false = the "before" (agent talks however it likes)
let plainMode = true
let status = { state: "live", detail: "" }
let updates = []
let publishing = false

const MIME = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".json": "application/json" }

// The published site is the site only. The agent's instructions and the repo
// plumbing are ours, not the visitor's, and must never appear on the live site.
const NOT_SITE = new Set([".git", "CLAUDE.md", ".claude"])

async function copyDir(from, to) {
  await fsp.rm(to, { recursive: true, force: true })
  await fsp.cp(from, to, {
    recursive: true,
    filter: (src) => !NOT_SITE.has(path.basename(src)),
  })
}

// Sync the agent instructions into the workspace. This is the entire "fix" in this
// demo: which system prompt the agent gets. Nothing else differs between modes.
async function syncAgentPrompt() {
  const target = path.join(WORKSPACE, "CLAUDE.md")
  if (plainMode) await fsp.copyFile(AGENT_PROMPT, target)
  else await fsp.rm(target, { force: true })
}

function runAgent(message) {
  return new Promise((resolve) => {
    // The prompt goes in on stdin, not argv. `claude` is a .cmd shim on Windows so it
    // needs shell:true, and with shell:true an args array is re-joined and re-split on
    // spaces, which delivered only the first word of every message.
    const child = spawn("claude", ["--print", "--permission-mode", "acceptEdits"], {
      cwd: WORKSPACE,
      shell: true,
    })
    child.stdin.write(message)
    child.stdin.end()
    let out = "", err = ""
    const timer = setTimeout(() => {
      child.kill()
      resolve({ ok: false, text: "That took too long, so I stopped. Nothing was changed." })
    }, 240000)
    child.stdout.on("data", (d) => (out += d))
    child.stderr.on("data", (d) => (err += d))
    child.on("close", (code) => {
      clearTimeout(timer)
      if (code !== 0 && !out.trim()) resolve({ ok: false, text: err.slice(0, 400) || "Something went wrong." })
      else resolve({ ok: true, text: out.trim() })
    })
  })
}

async function publish(summary) {
  if (publishing) return { ok: false, reason: "already publishing" }
  publishing = true
  status = { state: "publishing", detail: "" }
  try {
    // Refuse to publish something that cannot render. This is the cheap local stand-in
    // for "the build failed, so I did not publish it" and it is what keeps live working.
    const index = path.join(WORKSPACE, "index.html")
    const html = await fsp.readFile(index, "utf8").catch(() => null)
    if (!html || !html.trim()) {
      status = { state: "not-live", detail: "the page was empty" }
      return { ok: false, reason: "the page was empty, so I did not publish it" }
    }

    const id = String(Date.now())
    await copyDir(WORKSPACE, path.join(HISTORY, id))
    await copyDir(WORKSPACE, LIVE)

    // Confirm rather than assume: live must actually serve what we just published.
    const served = await fsp.readFile(path.join(LIVE, "index.html"), "utf8")
    if (served !== html) {
      status = { state: "not-live", detail: "the live copy did not match" }
      return { ok: false, reason: "the live copy did not match what you approved" }
    }

    updates.unshift({ id, summary: summary || "Updated the site", at: new Date().toISOString() })
    status = { state: "live", detail: "" }
    return { ok: true, id }
  } finally {
    publishing = false
  }
}

async function serveFrom(dir, urlPath, res) {
  let rel = decodeURIComponent(urlPath) || "/"
  if (rel.endsWith("/")) rel += "index.html"
  const file = path.join(dir, rel)
  if (!file.startsWith(dir)) { res.writeHead(403).end("no"); return }
  try {
    const body = await fsp.readFile(file)
    res.writeHead(200, {
      "content-type": MIME[path.extname(file)] ?? "application/octet-stream",
      "cache-control": "no-store",
    })
    res.end(body)
  } catch {
    res.writeHead(404, { "content-type": "text/html" })
    res.end("<p style='font:16px system-ui;padding:2rem;color:#666'>Nothing published yet.</p>")
  }
}

function readBody(req) {
  return new Promise((resolve) => {
    let b = ""
    req.on("data", (d) => (b += d))
    req.on("end", () => { try { resolve(JSON.parse(b || "{}")) } catch { resolve({}) } })
  })
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x")
  const p = url.pathname
  const json = (o, code = 200) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(o)) }

  if (p.startsWith("/preview")) return serveFrom(WORKSPACE, p.slice(8), res)
  if (p.startsWith("/live")) return serveFrom(LIVE, p.slice(5), res)

  if (p === "/api/state") return json({ status, updates, plainMode, publishing })

  if (p === "/api/mode" && req.method === "POST") {
    const { plain } = await readBody(req)
    plainMode = !!plain
    await syncAgentPrompt()
    return json({ plainMode })
  }

  if (p === "/api/chat" && req.method === "POST") {
    const { message } = await readBody(req)
    if (!message) return json({ error: "empty" }, 400)
    await syncAgentPrompt()
    const before = await fsp.readFile(path.join(WORKSPACE, "index.html"), "utf8").catch(() => "")
    const beforeCss = await fsp.readFile(path.join(WORKSPACE, "style.css"), "utf8").catch(() => "")
    const r = await runAgent(message)
    const after = await fsp.readFile(path.join(WORKSPACE, "index.html"), "utf8").catch(() => "")
    const afterCss = await fsp.readFile(path.join(WORKSPACE, "style.css"), "utf8").catch(() => "")
    const changed = before !== after || beforeCss !== afterCss
    if (changed && status.state === "live") status = { state: "not-live", detail: "you have changes that aren't live yet" }
    return json({ reply: r.text, changed, status })
  }

  if (p === "/api/publish" && req.method === "POST") {
    const { summary } = await readBody(req)
    const r = await publish(summary)
    return json({ ...r, status, updates })
  }

  if (p === "/api/restore" && req.method === "POST") {
    const { id } = await readBody(req)
    const snap = path.join(HISTORY, String(id))
    if (!fs.existsSync(snap)) return json({ ok: false, reason: "that version is gone" }, 404)
    await copyDir(snap, WORKSPACE)
    await syncAgentPrompt()
    const r = await publish("Put the project back")
    return json({ ...r, status, updates })
  }

  return serveFrom(path.join(ROOT, "public"), p === "/" ? "/index.html" : p, res)
})

await fsp.mkdir(HISTORY, { recursive: true })
if (!fs.existsSync(path.join(LIVE, "index.html"))) await copyDir(WORKSPACE, LIVE)
await syncAgentPrompt()

server.listen(PORT, () => {
  console.log(`\n  editor   http://localhost:${PORT}`)
  console.log(`  preview  http://localhost:${PORT}/preview/`)
  console.log(`  live     http://localhost:${PORT}/live/\n`)
})
