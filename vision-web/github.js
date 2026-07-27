// Publishing, straight from the browser to GitHub.
//
// The Contents API writes one file per commit, so publishing two changed files would be
// two commits and could half-apply: exactly the "saved but not live" failure this whole
// exercise is about. So this uses the Git Data API to build a tree and land every file
// in ONE commit. Either all of it publishes or none of it does.
//
// Liveness is tier (a) from the written answer: ask the host. github.io sends no CORS
// headers so the browser cannot fetch the page to check it, but api.github.com does, and
// the Pages build API tells us whether OUR commit is the one that built. A build that
// reports "built" for a different sha is not our change and must not be called live.

export const REPO = { owner: "Rejhinald", name: "repro", branch: "master", dir: "docs" }
export const SITE_URL = `https://${REPO.owner.toLowerCase()}.github.io/${REPO.name}/`

const API = "https://api.github.com"

async function gh(token, path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...options.headers,
    },
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(body.message || `HTTP ${res.status}`)
    err.status = res.status
    throw err
  }
  return body
}

// Raw API errors name things the reader has no access to, so they stop here.
export function plainError(e) {
  const m = String(e?.message || "")
  if (e?.status === 401 || /bad credentials/i.test(m)) {
    return { text: "That access token wasn't accepted. Add it again and I'll try once more.", clearToken: true }
  }
  if (e?.status === 403 && /rate limit/i.test(m)) {
    return { text: "Too many requests just now. Wait a minute and try again." }
  }
  if (e?.status === 403 || e?.status === 404) {
    return { text: "I don't have permission to update this project. Someone needs to reconnect the account." }
  }
  if (e?.status === 409 || /fast forward|not a fast/i.test(m)) {
    return { text: "Someone else updated the project while you were working. Nothing was changed." }
  }
  if (/Failed to fetch|NetworkError/i.test(m)) {
    return { text: "I couldn't reach the internet just now. Your change is saved but it isn't live." }
  }
  return { text: "Something went wrong while updating your project. Nothing was changed." }
}

/** What is currently published. Lets the Live pane show reality, not a local guess. */
export async function fetchPublished(token, names) {
  const out = {}
  for (const name of names) {
    try {
      const f = await gh(token, `/repos/${REPO.owner}/${REPO.name}/contents/${REPO.dir}/${name}?ref=${REPO.branch}`)
      out[name] = new TextDecoder().decode(Uint8Array.from(atob(f.content.replace(/\n/g, "")), (c) => c.charCodeAt(0)))
    } catch {
      out[name] = ""
    }
  }
  return out
}

/** One commit, every file, or nothing. Returns the new sha. */
export async function publishFiles(token, files, message) {
  const base = `/repos/${REPO.owner}/${REPO.name}`
  const ref = await gh(token, `${base}/git/ref/heads/${REPO.branch}`)
  const headSha = ref.object.sha
  const headCommit = await gh(token, `${base}/git/commits/${headSha}`)

  const tree = []
  for (const [name, content] of Object.entries(files)) {
    if (typeof content !== "string") continue
    const blob = await gh(token, `${base}/git/blobs`, {
      method: "POST",
      body: JSON.stringify({ content, encoding: "utf-8" }),
    })
    tree.push({ path: `${REPO.dir}/${name}`, mode: "100644", type: "blob", sha: blob.sha })
  }
  if (!tree.length) throw new Error("nothing to publish")

  const newTree = await gh(token, `${base}/git/trees`, {
    method: "POST",
    body: JSON.stringify({ base_tree: headCommit.tree.sha, tree }),
  })

  // Nothing actually changed. Publishing an empty change would add a version row for a
  // change that does not exist, so say so instead.
  if (newTree.sha === headCommit.tree.sha) return { unchanged: true }

  const commit = await gh(token, `${base}/git/commits`, {
    method: "POST",
    body: JSON.stringify({ message: message || "Update the site", tree: newTree.sha, parents: [headSha] }),
  })

  await gh(token, `${base}/git/refs/heads/${REPO.branch}`, {
    method: "PATCH",
    body: JSON.stringify({ sha: commit.sha, force: false }),
  })

  return { sha: commit.sha }
}

/**
 * Wait for the host to say OUR commit is the one serving. Bounded, and it returns
 * false rather than throwing, because "I could not confirm" is a real answer the
 * interface has to be able to show.
 */
export async function confirmLive(token, sha, { timeoutMs = 120000, everyMs = 4000 } = {}) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const build = await gh(token, `/repos/${REPO.owner}/${REPO.name}/pages/builds/latest`)
      if (build.status === "built" && build.commit === sha) return true
      if (build.status === "errored") return false
    } catch {
      // Pages may not have produced a build yet. Keep waiting, then be honest.
    }
    await new Promise((r) => setTimeout(r, everyMs))
  }
  return false
}
