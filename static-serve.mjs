// Dev convenience only: ES modules need http, not file://. The app itself is
// frontend-only and this server does nothing but hand over static files.
import http from "node:http"; import fs from "node:fs/promises"; import path from "node:path"
const DIR = path.join(process.cwd(), "vision-web")
const MIME = { ".html":"text/html", ".css":"text/css", ".js":"text/javascript", ".svg":"image/svg+xml" }
http.createServer(async (req,res)=>{
  const rel = decodeURIComponent(new URL(req.url,"http://x").pathname)
  const f = path.join(DIR, rel === "/" ? "index.html" : rel)
  if (!f.startsWith(DIR)) { res.writeHead(403).end(); return }
  try { const b = await fs.readFile(f)
    res.writeHead(200,{ "content-type": MIME[path.extname(f)] ?? "application/octet-stream", "cache-control":"no-store" }); res.end(b)
  } catch { res.writeHead(404).end("not found") }
}).listen(4100, ()=>console.log("http://localhost:4100"))
