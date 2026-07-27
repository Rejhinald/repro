// The starting website. Plain files, so what the model edits is what you see.
export const LOGO = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 40" width="120" height="40"><rect width="120" height="40" rx="6" fill="#1f6feb"/><text x="60" y="25" font-family="sans-serif" font-size="13" fill="#fff" text-anchor="middle">Bright Coast</text></svg>`

export const START = {
  "index.html": `<!doctype html>
<meta charset="utf-8">
<title>Bright Coast Dental</title>
<link rel="stylesheet" href="style.css">
<header>
  <img class="logo" src="logo.svg" alt="Bright Coast Dental">
  <nav><a href="#services">Services</a> <a href="#pricing">Pricing</a></nav>
</header>
<main>
  <h1>Gentle dentistry on the coast</h1>
  <p>Accepting new patients this month.</p>
  <section id="pricing"><h2>Pricing</h2><p>Cleanings from $89.</p></section>
</main>`,
  "style.css": `:root { --brand: #1f6feb; }
body { font-family: system-ui, sans-serif; margin: 0 auto; max-width: 60rem; padding: 2rem; }
header { display: flex; align-items: center; justify-content: space-between; }
.logo { width: 120px; height: auto; }
h1 { color: var(--brand); }`,
}

// An iframe with srcdoc has no origin to resolve style.css or logo.svg against, so the
// site is assembled into one self-contained document. This is also what makes the 1:1
// claim checkable: preview and live are rendered by the identical function, so the only
// way they can differ is if the files differ.
export function render(files) {
  const css = files["style.css"] ?? ""
  const svg = `data:image/svg+xml;utf8,${encodeURIComponent(LOGO)}`
  return (files["index.html"] ?? "")
    .replace(/<link rel="stylesheet"[^>]*>/, `<style>${css}</style>`)
    .replace(/src="logo\.svg"/g, `src="${svg}"`)
}
