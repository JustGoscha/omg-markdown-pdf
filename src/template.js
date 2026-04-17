import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MODULE_ROOT = join(__dirname, "..");

function readAsset(rel) {
  return readFileSync(join(MODULE_ROOT, rel), "utf8");
}

function readVendor(rel) {
  return readFileSync(join(MODULE_ROOT, "node_modules", rel), "utf8");
}

/**
 * Build the full HTML document. `bodyHtml` already contains the rendered
 * markdown (optionally with TOC and per-doc wrappers from index.js).
 *
 * opts:
 *   theme        "light" | "dark"   (default "light")
 *   format       "A4" | "Letter"    (used only for the @page rule in CSS)
 *   margin       e.g. "20mm"
 *   enableMermaid  bool
 *   enableMath     bool
 */
export function buildHtml(bodyHtml, opts = {}) {
  const {
    theme = "light",
    format = "A4",
    margin = "20mm",
    enableMermaid = true,
    enableMath = true,
    title = "Document",
  } = opts;

  const githubCss = readAsset("src/assets/github-markdown.css");
  const hljsCss = readVendor(
    theme === "dark"
      ? "highlight.js/styles/github-dark.min.css"
      : "highlight.js/styles/github.min.css",
  );
  const katexCss = enableMath ? readVendor("katex/dist/katex.min.css") : "";
  const katexJs = enableMath ? readVendor("katex/dist/katex.min.js") : "";
  const katexAutoJs = enableMath ? readVendor("katex/dist/contrib/auto-render.min.js") : "";
  const mermaidJs = enableMermaid ? readVendor("mermaid/dist/mermaid.min.js") : "";

  const pageCss = `@page { size: ${format}; margin: ${margin}; }`;

  const readyScript = `
    window.__renderReady = (async () => {
      const imgs = Array.from(document.images);
      await Promise.all(imgs.map(img => img.complete
        ? Promise.resolve()
        : new Promise(res => { img.addEventListener("load", res); img.addEventListener("error", res); })
      ));
      ${enableMermaid ? `
      try {
        if (window.mermaid) {
          window.mermaid.initialize({ startOnLoad: false, theme: "${theme === "dark" ? "dark" : "default"}", securityLevel: "loose" });
          await window.mermaid.run({ querySelector: "pre.mermaid" });
        }
      } catch (e) { console.warn("mermaid render failed:", e); }
      ` : ""}
      ${enableMath ? `
      try {
        if (window.renderMathInElement) {
          window.renderMathInElement(document.body, {
            delimiters: [
              { left: "$$", right: "$$", display: true },
              { left: "$", right: "$", display: false },
              { left: "\\\\(", right: "\\\\)", display: false },
              { left: "\\\\[", right: "\\\\]", display: true },
            ],
            throwOnError: false,
          });
        }
      } catch (e) { console.warn("katex render failed:", e); }
      ` : ""}
      // small tick so layout settles before puppeteer snapshots
      await new Promise(r => setTimeout(r, 50));
      return true;
    })();
  `;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>
${pageCss}
body { margin: 0; background: #fff; }
.markdown-body { padding: 0; max-width: none; }
${githubCss}
${hljsCss}
${katexCss}
</style>
${enableMath ? `<script>${katexJs}</script><script>${katexAutoJs}</script>` : ""}
${enableMermaid ? `<script>${mermaidJs}</script>` : ""}
</head>
<body>
<article class="markdown-body">
${bodyHtml}
</article>
<script>${readyScript}</script>
</body>
</html>`;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
