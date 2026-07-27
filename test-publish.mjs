// Verifies the exact code path the browser uses: one atomic commit via the Git Data
// API, then wait for the host to confirm OUR commit is the one serving.
//   GH_TOKEN=$(gh auth token) node test-publish.mjs
import { publishFiles, confirmLive, fetchPublished, SITE_URL } from "./vision-web/github.js"
import { START, render } from "./vision-web/site.js"

const token = process.env.GH_TOKEN
if (!token) { console.error("set GH_TOKEN"); process.exit(1) }

const stamp = new Date().toISOString().slice(11, 19)
const files = { ...START }
files["index.html"] = files["index.html"].replace(
  "Gentle dentistry on the coast",
  `Gentle dentistry on the coast (published ${stamp})`,
)
const payload = { "index.html": render(files) }

console.log("publishing…")
const r = await publishFiles(token, payload, `Test publish ${stamp}`)
if (r.unchanged) { console.log("nothing changed"); process.exit(0) }
console.log("commit:", r.sha)

console.log("waiting for the host to confirm…")
const t0 = Date.now()
const live = await confirmLive(token, r.sha, { timeoutMs: 180000, everyMs: 4000 })
console.log(`confirmLive -> ${live}  (${Math.round((Date.now() - t0) / 1000)}s)`)

// Independent check: fetch the page over the public internet and compare byte for byte.
const res = await fetch(`${SITE_URL}?t=${Date.now()}`, { cache: "no-store" })
const served = await res.text()
console.log("public fetch:", res.status)
console.log("served === published:", served.trim() === payload["index.html"].trim())
console.log("headline live:", (served.match(/<h1>([^<]*)/) || [])[1])

const back = await fetchPublished(token, ["index.html"])
console.log("readback matches:", back["index.html"].trim() === payload["index.html"].trim())
