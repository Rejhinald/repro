// Runs a prompt file through Claude Code the way that actually works on Windows:
// spawn with shell:true (claude is a .cmd shim) and feed the prompt on STDIN.
// Passing it as an argv element gets re-split on spaces by the shell.
//   node run-prompt.mjs p1.txt <cwd> <outfile>
import { spawn } from "node:child_process"
import fs from "node:fs"

const [promptFile, cwd = process.cwd(), out = "prompt-out.txt"] = process.argv.slice(2)
const prompt = fs.readFileSync(promptFile, "utf8")

const child = spawn("claude", ["--print", "--permission-mode", "acceptEdits"], { cwd, shell: true })
let buf = "", err = ""
const t0 = Date.now()

child.stdin.write(prompt)
child.stdin.end()
child.stdout.on("data", (d) => (buf += d))
child.stderr.on("data", (d) => (err += d))
child.on("close", (code) => {
  fs.writeFileSync(out, buf || err)
  console.log(`exit=${code} secs=${Math.round((Date.now() - t0) / 1000)} chars=${buf.length}`)
  if (!buf.trim()) console.log("STDERR:", err.slice(0, 400))
})
