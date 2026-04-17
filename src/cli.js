#!/usr/bin/env bun
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve, basename, extname } from "node:path";
import { Command } from "commander";
import { convert } from "./index.js";
import { scanMarkdownFiles } from "./scanner.js";
import { pickOne } from "./picker.js";

const program = new Command();

const EXAMPLES = `
Examples:
  md2pdf notes.md                       # writes notes.pdf next to the input
  md2pdf README.md -o docs/readme.pdf   # custom output path
  md2pdf docs/index.md --toc on         # force TOC even for a single file
  md2pdf paper.md --footer auto         # page numbers in the footer
  md2pdf spec.md --no-follow            # don't bundle linked *.md files
  md2pdf book.md --theme dark           # dark syntax + markdown theme

Linked-markdown bundling (on by default):
  Any [text](./other.md) link under --root (default: input's dir) is included
  as its own section, with the link rewritten to an internal PDF anchor.
  Walks transitively; cycles are safe; external/mailto/non-.md links pass through.

Supports: GFM tables, task lists, footnotes, emoji shortcodes, ~190 syntax-
highlighted languages via highlight.js, Mermaid diagrams, KaTeX math ($…$ / $$…$$),
and local images (PNG/JPG/SVG resolved relative to each source file).
`;

program
  .name("md2pdf")
  .description("Lightweight Markdown → A4 PDF with mermaid, math, and linked-md bundling")
  .addHelpText("after", EXAMPLES)
  .showHelpAfterError("(run 'md2pdf --help' for full usage)")
  .argument("<input>", "input markdown file")
  .option("-o, --output <file>", "output PDF path (default: alongside input)")
  .option("--format <format>", "page format: A4 | Letter", "A4")
  .option("--margin <size>", "page margin (e.g. 20mm, 0.5in)", "20mm")
  .option("--theme <theme>", "light | dark", "light")
  .option("--header <html>", "HTML header template (puppeteer)")
  .option("--footer <html>", 'HTML footer template; "auto" adds page numbers')
  .option("--no-mermaid", "disable mermaid rendering")
  .option("--no-math", "disable KaTeX math rendering")
  .option("--toc <mode>", "TOC mode: auto | on | off", "auto")
  .option("--no-follow", "do not follow links to other *.md files")
  .option("--root <dir>", "base dir allowed for link following (default: input's dir)")
  .option("--max-depth <n>", "cap link recursion depth", (v) => parseInt(v, 10))
  .option("-q, --quiet", "suppress info logs")
  .action(async (input, opts) => {
    const inputAbs = resolve(input);
    const outPath = resolve(
      opts.output || inputAbs.replace(/\.md$/i, ".pdf") ||
        `${basename(inputAbs, extname(inputAbs))}.pdf`,
    );

    if (!opts.quiet) console.error(`→ ${input} → ${outPath}`);
    const t0 = Date.now();

    const tocFlag =
      opts.toc === "on" ? true : opts.toc === "off" ? false : undefined;

    const pdf = await convert(inputAbs, {
      output: outPath,
      format: opts.format,
      margin: opts.margin,
      theme: opts.theme,
      header: opts.header,
      footer: opts.footer,
      enableMermaid: opts.mermaid !== false,
      enableMath: opts.math !== false,
      toc: tocFlag,
      follow: opts.follow !== false,
      root: opts.root,
      maxDepth: Number.isFinite(opts.maxDepth) ? opts.maxDepth : Infinity,
    });

    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, pdf);

    if (!opts.quiet) {
      const kb = (pdf.length / 1024).toFixed(1);
      console.error(`✓ wrote ${outPath} (${kb} KB) in ${Date.now() - t0}ms`);
    }
  });

// No args → scan cwd (3 levels deep) and show an interactive picker.
// Falls back to help if nothing found or stdin isn't a TTY.
if (process.argv.length <= 2) {
  const cwd = process.cwd();
  const files = scanMarkdownFiles(cwd, { maxDepth: 3 });

  if (!files.length || !process.stdin.isTTY) {
    if (!files.length && process.stdin.isTTY) {
      console.error("No .md files found within 3 levels of", cwd);
      console.error("");
    }
    program.outputHelp();
    process.exit(0);
  }

  console.error(`Found ${files.length} markdown file${files.length === 1 ? "" : "s"} under ${cwd}`);
  const picked = await pickOne(files, { prompt: "Convert which file?" });
  if (!picked) {
    console.error("Cancelled.");
    process.exit(130);
  }
  process.argv.push(picked);
}

program.parseAsync().catch((err) => {
  console.error(`✗ ${err.message}`);
  process.exit(1);
});
