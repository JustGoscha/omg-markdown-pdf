import { collect } from "./collector.js";
import { createRenderer } from "./renderer.js";
import { buildHtml } from "./template.js";
import { launch } from "./browser.js";

/**
 * Convert a markdown file (and transitively linked *.md files, if follow=true)
 * to a PDF buffer.
 *
 * @param {string} entryPath  Path to the entry .md file
 * @param {object} options
 *   root         (string)   base dir for link-following; defaults to entry dir
 *   follow       (bool)     walk linked *.md files (default true)
 *   maxDepth     (number)   cap recursion depth (default Infinity)
 *   toc          (bool)     include TOC (default: auto — on when bundling >1 file)
 *   format       (string)   "A4" | "Letter" (default "A4")
 *   margin       (string)   e.g. "20mm" (default "20mm")
 *   theme        (string)   "light" | "dark" (default "light")
 *   header       (string)   HTML header template (puppeteer displayHeaderFooter)
 *   footer       (string)   HTML footer template; pass "auto" for page numbers
 *   enableMermaid (bool)    default true
 *   enableMath    (bool)    default true
 *   title         (string)  PDF metadata title (default: entry filename)
 *
 * @returns {Promise<Buffer>}  PDF bytes
 */
export async function convert(entryPath, options = {}) {
  const {
    root,
    follow = true,
    maxDepth = Infinity,
    toc,
    format = "A4",
    margin = "20mm",
    theme = "light",
    header = "",
    footer = "",
    enableMermaid = true,
    enableMath = true,
    title,
    quiet = false,
  } = options;

  const { docs, anchorMap } = collect(entryPath, { root, follow, maxDepth, quiet });
  const renderer = createRenderer({ anchorMap });

  const showToc = toc ?? docs.length > 1;
  const bodyHtml = buildBody(docs, renderer, { showToc });

  const html = buildHtml(bodyHtml, {
    theme,
    format,
    margin,
    enableMermaid,
    enableMath,
    title: title || docs[0]?.relPath || "Document",
  });

  const browser = await launch();
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0", timeout: 60000 });
    await page.evaluate(() => window.__renderReady);

    const pdfOpts = {
      format,
      printBackground: true,
      margin: marginToSides(margin),
      preferCSSPageSize: true,
    };
    if (header || footer) {
      pdfOpts.displayHeaderFooter = true;
      pdfOpts.headerTemplate = header || "<div></div>";
      pdfOpts.footerTemplate =
        footer === "auto"
          ? `<div style="font-size:9px;width:100%;text-align:center;color:#888;">
               <span class="pageNumber"></span> / <span class="totalPages"></span>
             </div>`
          : footer || "<div></div>";
    }
    return await page.pdf(pdfOpts);
  } finally {
    await browser.close();
  }
}

function buildBody(docs, renderer, { showToc }) {
  const parts = [];

  if (showToc && docs.length) {
    const titleCounts = new Map();
    for (const d of docs) {
      const t = d.title || d.relPath;
      titleCounts.set(t, (titleCounts.get(t) || 0) + 1);
    }
    parts.push('<nav class="md2pdf-toc"><h2>Contents</h2><ol>');
    for (const d of docs) {
      const t = d.title || d.relPath;
      const label = titleCounts.get(t) > 1 ? `${t} (${d.relPath})` : t;
      parts.push(`<li><a href="#${d.anchorId}">${escapeHtml(label)}</a></li>`);
    }
    parts.push("</ol></nav>");
  }

  for (const d of docs) {
    const rendered = renderer.render(d.content, { sourceDir: d.dir });
    parts.push(
      `<section class="md2pdf-doc" id="${d.anchorId}">` +
        (docs.length > 1
          ? `<div class="md2pdf-doc-header">${escapeHtml(d.relPath)}</div>`
          : "") +
        rendered +
        `</section>`,
    );
  }

  return parts.join("\n");
}

function marginToSides(m) {
  if (typeof m === "object" && m !== null) return m;
  return { top: m, right: m, bottom: m, left: m };
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
