import { START, render } from "./site.js"
import { BEFORE, AFTER, SCHEMA } from "./prompts.js"

const MODEL = "gemini-3.1-pro-preview"
const $ = (s) => document.querySelector(s)
const K = { key: "vw:key", work: "vw:workspace", live: "vw:published", vers: "vw:versions", plain: "vw:plain" }

const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d } catch { return d } }
const save = (k, v) => localStorage.setItem(k, JSON.stringify(v))

let workspace = load(K.work, { ...START })
let published = load(K.live, { ...START })
let versions = load(K.vers, [])
let plain = load(K.plain, true)
let openFile = "index.html"
let busy = false

const CHIP = {
  live: ["chip-live", "Live"],
  draft: ["chip-draft", "Changes not live yet"],
  publishing: ["chip-publishing", "Publishing…"],
  bad: ["chip-bad", "Not live"],
}

const dirty = () => JSON.stringify(workspace) !== JSON.stringify(published)

function setChip(state, detail) {
  const [cls, label] = CHIP[state] ?? CHIP.live
  $("#chip").className = `chip ${cls}`
  $("#chip").textContent = detail ? `${label}: ${detail}` : label
}

function paint() {
  $("#preview").srcdoc = render(workspace)
  $("#live").srcdoc = render(published)
  setChip(dirty() ? "draft" : "live")
  $("#publish").disabled = busy || !dirty()

  $("#files").innerHTML = ""
  for (const name of Object.keys(workspace)) {
    const b = document.createElement("button")
    b.textContent = name
    b.className = name === openFile ? "is-on" : ""
    b.onclick = () => { openFile = name; paint() }
    $("#files").appendChild(b)
  }
  $("#code").value = workspace[openFile] ?? ""

  const ul = $("#versions")
  ul.innerHTML = ""
  if (!versions.length) { ul.innerHTML = '<li class="empty">Nothing published yet.</li>'; return }
  versions.forEach((v, i) => {
    const li = document.createElement("li")
    const t = document.createElement("time")
    t.textContent = new Date(v.id).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })
    const s = document.createElement("span")
    s.textContent = v.summary
    li.append(t, s)
    if (i === 0) {
      const n = document.createElement("span"); n.className = "now"; n.textContent = "live"; li.append(n)
    } else {
      const b = document.createElement("button"); b.className = "btn"; b.textContent = "Restore"
      b.onclick = () => restore(v.id); li.append(b)
    }
    ul.appendChild(li)
  })
}

function bubble(kind, text, actions) {
  const el = document.createElement("div")
  el.className = `msg msg-${kind}`
  el.textContent = text
  if (actions) {
    const row = document.createElement("div")
    row.className = "msg-actions"
    for (const [label, fn] of actions) {
      const b = document.createElement("button")
      b.className = "btn"; b.textContent = label
      b.onclick = () => { row.remove(); fn() }
      row.appendChild(b)
    }
    el.appendChild(row)
  }
  $("#log").appendChild(el)
  $("#log").scrollTop = $("#log").scrollHeight
  return el
}

// Publishing is a copy plus a check. The app says what is live, never the model,
// because the app is the only thing that knows.
function publish(summary) {
  setChip("publishing")
  const snapshot = JSON.parse(JSON.stringify(workspace))

  if (!(snapshot["index.html"] || "").trim()) {
    setChip("bad", "the page was empty")
    bubble("bad", "I didn't update your project: the page was empty, so your site is still on the last working version.")
    return
  }

  published = snapshot
  save(K.live, published)

  // Confirm rather than assume. Preview and live are rendered by the same function,
  // so if these differ something is wrong and we must not claim success.
  if (render(published) !== render(workspace)) {
    setChip("bad", "the live copy did not match")
    bubble("bad", "I didn't update your project: the live copy did not match what you approved.")
    return
  }

  versions.unshift({ id: Date.now(), summary: summary || "Updated the site", files: snapshot })
  versions = versions.slice(0, 25)
  save(K.vers, versions)
  paint()
  bubble("agent", "Updated. Your change is live.")
}

function restore(id) {
  const v = versions.find((x) => x.id === id)
  if (!v) return bubble("bad", "That version is no longer available.")
  workspace = JSON.parse(JSON.stringify(v.files))
  save(K.work, workspace)
  paint()
  publish("Put the project back")
}

async function ask(message) {
  const key = localStorage.getItem(K.key)
  if (!key) { $("#keyDialog").showModal(); return null }

  const body = {
    systemInstruction: { parts: [{ text: plain ? AFTER : BEFORE }] },
    contents: [{
      role: "user",
      parts: [{ text: `Current files:\n${JSON.stringify(workspace, null, 1)}\n\nUser says: "${message}"` }],
    }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: SCHEMA,
      // Thinking is drawn from the same budget as the answer, so a big budget can
      // truncate the JSON into something unparseable.
      thinkingConfig: { thinkingLevel: "low" },
    },
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
    { method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": key }, body: JSON.stringify(body) },
  )
  const j = await res.json().catch(() => ({}))
  if (j.error) {
    const m = String(j.error.message || "")
    // Translate at the boundary. A raw provider error is exactly the kind of string
    // that leaks jargon to someone who cannot act on it.
    if (/API key|API_KEY|UNAUTHENTICATED|PERMISSION/i.test(m)) {
      localStorage.removeItem(K.key)
      return { error: "That key wasn't accepted. Add it again and I'll try once more." }
    }
    if (/quota|RESOURCE_EXHAUSTED|rate/i.test(m)) return { error: "Too many requests just now. Wait a moment and try again." }
    return { error: "Something went wrong on my side. Nothing was changed." }
  }
  const text = j.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") ?? ""
  try { return JSON.parse(text) } catch { return { error: "I couldn't read that reply properly. Nothing was changed." } }
}

$("#form").onsubmit = async (e) => {
  e.preventDefault()
  if (busy) return
  const input = $("#input")
  const message = input.value.trim()
  if (!message) return
  input.value = ""
  bubble("user", message)

  busy = true; $("#send").disabled = true; $("#publish").disabled = true
  const thinking = bubble("sys", "Working on it…")
  let r
  try { r = await ask(message) } finally {
    thinking.remove(); busy = false; $("#send").disabled = false
  }
  if (!r) return paint()
  if (r.error) { bubble("bad", r.error); return paint() }

  if (r.changed && r.files) {
    for (const [name, content] of Object.entries(r.files)) {
      if (typeof content === "string" && content.trim()) workspace[name] = content
    }
    save(K.work, workspace)
  }
  paint()
  bubble("agent", r.reply || "Done.")

  if (r.publish) publish(r.summary || "Updated the site")
  else if (r.changed) {
    bubble("sys", "That's in your preview. It isn't live yet.", [["Update project", () => publish(r.summary || "Updated the site")]])
  }
}

$("#publish").onclick = () => publish("Updated the site")

$("#plain").onchange = (e) => {
  plain = e.target.checked
  save(K.plain, plain)
  bubble("sys", plain ? "Plain language on. This is the fix." : "Plain language off. This is how it behaved before.")
}

$("#code").oninput = (e) => {
  workspace[openFile] = e.target.value
  save(K.work, workspace)
  $("#preview").srcdoc = render(workspace)
  setChip(dirty() ? "draft" : "live")
  $("#publish").disabled = !dirty()
}

document.querySelectorAll(".tab").forEach((t) => {
  t.onclick = () => {
    document.querySelectorAll(".tab").forEach((x) => x.classList.toggle("is-on", x === t))
    document.querySelectorAll(".pane").forEach((p) => p.classList.toggle("is-on", p.dataset.pane === t.dataset.pane))
    $("#tabNote").textContent = { preview: "what you're working on", live: "what visitors see", editor: "the files behind it" }[t.dataset.pane]
  }
})

$("#keySave").onclick = () => {
  const v = $("#keyInput").value.trim()
  if (v) localStorage.setItem(K.key, v)
  $("#keyInput").value = ""
}

$("#plain").checked = plain
paint()
bubble("agent", "Tell me what you'd like to change and I'll show you here before anything goes live.")
if (!localStorage.getItem(K.key)) $("#keyDialog").showModal()
