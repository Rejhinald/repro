// Vocabulary detector.
//
// Two lists on purpose. A single list cannot work in a website builder: "push the
// button", "pull to refresh" and "merge the two columns" are ordinary product English,
// so failing the build on them would break the product to protect it.
//
//   node detect.mjs evidence/before.txt evidence/after.txt
//   node detect.mjs --self-test
//
// Exit code 1 if any HARD term is found, so it works as a CI gate.

import fs from "node:fs"

const HARD = [
  "commit", "rebase", "stash", "repo", "repository", "pull request",
  "PR", "SHA", "diff", "checkout", "git", "origin", "remote", "HEAD",
]

const REVIEW = ["push", "pull", "merge", "branch", "staging"]

// "GitHub" is legitimate on the account-connection screen, so it must not be caught by
// the bare "git" rule. Word boundaries alone do not do this: \bgit\b does not match
// inside "GitHub", but a careless \bgit matches its prefix. Checked in the self-test.
const rx = (term) => new RegExp(`\\b${term.replace(/ /g, "\\s+")}\\b`, "gi")

function scan(text) {
  const hard = {}
  const review = {}
  for (const t of HARD) {
    const m = text.match(rx(t))
    if (m) hard[t] = m.length
  }
  for (const t of REVIEW) {
    const m = text.match(rx(t))
    if (m) review[t] = m.length
  }
  const hardTotal = Object.values(hard).reduce((a, b) => a + b, 0)
  return { hard, review, hardTotal }
}

// Cases that MUST pass. If these fail the detector is wrong, not the product.
const CONTROLS = [
  "committed to quality",
  "merge the two columns",
  "push the button",
  "pull to refresh",
  "Connect GitHub to publish your site",
]

// Cases that MUST be caught, so a detector that mutes everything cannot pass.
const MUST_CATCH = [
  "git commit -m 'x'",
  "I'll push to origin",
  "run git checkout -b feature",
  "open a pull request",
]

if (process.argv.includes("--self-test")) {
  let bad = 0
  for (const c of CONTROLS) {
    const { hard, hardTotal } = scan(c)
    // "merge"/"push"/"pull" are REVIEW-only, so a hard hit here is a real failure.
    if (hardTotal > 0) {
      console.log(`FAIL control tripped hard ban: ${JSON.stringify(c)} -> ${JSON.stringify(hard)}`)
      bad++
    } else {
      console.log(`ok   control clean: ${JSON.stringify(c)}`)
    }
  }
  for (const c of MUST_CATCH) {
    const { hardTotal } = scan(c)
    if (hardTotal === 0) {
      console.log(`FAIL should have been caught: ${JSON.stringify(c)}`)
      bad++
    } else {
      console.log(`ok   caught: ${JSON.stringify(c)}`)
    }
  }
  console.log(bad === 0 ? "\nself-test PASSED" : `\nself-test FAILED (${bad})`)
  process.exit(bad === 0 ? 0 : 1)
}

let failed = false
for (const file of process.argv.slice(2)) {
  const text = fs.readFileSync(file, "utf8")
  const { hard, review, hardTotal } = scan(text)
  console.log(`\n${file}`)
  console.log(`  hard-ban hits : ${hardTotal} ${JSON.stringify(hard)}`)
  console.log(`  review-only   : ${JSON.stringify(review)}`)
  if (hardTotal > 0) failed = true
}
process.exit(failed ? 1 : 0)
