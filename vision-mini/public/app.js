const $ = (s) => document.querySelector(s)
const log = $("#log"), chip = $("#chip"), versions = $("#versions")
const preview = $("#preview"), live = $("#live")

const CHIP = {
  live: ["chip-live", "Live"],
  "not-live": ["chip-draft", "Changes not live yet"],
  publishing: ["chip-publishing", "Publishing…"],
  bad: ["chip-bad", "Not live"],
}

function setStatus(s) {
  const [cls, label] = CHIP[s.state] ?? CHIP.live
  chip.className = `chip ${cls}`
  chip.textContent = s.detail && s.state !== "not-live" ? `${label}: ${s.detail}` : label
  $("#publish").disabled = s.state === "publishing"
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
      b.className = "btn"
      b.textContent = label
      b.onclick = () => { row.remove(); fn() }
      row.appendChild(b)
    }
    el.appendChild(row)
  }
  log.appendChild(el)
  log.scrollTop = log.scrollHeight
  return el
}

const reload = (f) => { f.contentWindow.location.reload() }

async function refresh() {
  const s = await fetch("/api/state").then((r) => r.json())
  setStatus(s.status)
  $("#plain").checked = s.plainMode
  versions.innerHTML = ""
  if (!s.updates.length) {
    versions.innerHTML = '<li class="empty">Nothing published yet.</li>'
    return
  }
  s.updates.forEach((u, i) => {
    const li = document.createElement("li")
    const when = new Date(Number(u.id)).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })
    li.innerHTML = `<time>${when}</time> <span>${u.summary}</span>`
    if (i === 0) {
      const now = document.createElement("span")
      now.className = "now"
      now.textContent = "live"
      li.appendChild(now)
    } else {
      const b = document.createElement("button")
      b.className = "btn"
      b.textContent = "Restore"
      b.onclick = () => restore(u.id)
      li.appendChild(b)
    }
    versions.appendChild(li)
  })
}

async function publish(summary) {
  setStatus({ state: "publishing" })
  const r = await fetch("/api/publish", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ summary }),
  }).then((x) => x.json())
  if (r.ok) bubble("agent", "Updated. Your change is live.")
  else bubble("agent", `I couldn't update your project: ${r.reason}. Your site is still on the last working version.`)
  reload(live); reload(preview)
  refresh()
}

async function restore(id) {
  bubble("sys", "Putting your project back…")
  const r = await fetch("/api/restore", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id }),
  }).then((x) => x.json())
  bubble("agent", r.ok ? "Done. Your project is back to that version and it's live." : `I couldn't put it back: ${r.reason}`)
  reload(live); reload(preview)
  refresh()
}

$("#form").onsubmit = async (e) => {
  e.preventDefault()
  const input = $("#input")
  const message = input.value.trim()
  if (!message) return
  input.value = ""
  bubble("user", message)
  const thinking = bubble("sys", "Working on it…")
  const r = await fetch("/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message }),
  }).then((x) => x.json())
  thinking.remove()

  // The agent's reply is shown verbatim. That is the point of the demo: with the
  // plain-language switch off you see exactly what a non-technical user was getting.
  bubble("agent", r.reply || "(no reply)")
  reload(preview)
  if (r.status) setStatus(r.status)
  if (r.changed) {
    bubble("sys", "That change is in your preview. It isn't live yet.", [
      ["Update project", () => publish(message)],
    ])
  }
  refresh()
}

$("#publish").onclick = () => publish($("#input").value.trim() || "Updated the site")

$("#plain").onchange = async (e) => {
  await fetch("/api/mode", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ plain: e.target.checked }),
  })
  bubble("sys", e.target.checked
    ? "Plain language on. This is the fix."
    : "Plain language off. This is how it behaved before.")
}

refresh()
