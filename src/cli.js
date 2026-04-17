#!/usr/bin/env bun
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve, basename, extname } from "node:path";
import { Command } from "commander";
import { convert } from "./index.js";

const program = new Command();

program
  .name("md2pdf")
  .description("Lightweight Markdown → A4 PDF with mermaid, math, and linked-md bundling")
  .argument("<input>", "input markdown file")
  .option("-o, --output <file>", "output PDF path (default: alongside input)")
  .option("--format <format>", "page format: A4 | Letter", "A4")
  .option("--margin <size>", "page margin (e.g. 20mm, 0.5in)", "20mm")
  .option("--theme <theme>", "light | dark", "light")
  .option("--header <html>", "HTML header template (puppeteer)")
  .option("--footer <html>", 'HTML footer template; "auto" adds page numbers')
  .option("--no-mermaid", "disable mermaid rendering")
  .option("--no-math", "disable KaTeX math rendering")
  .option("--no-toc", "disable auto-generated TOC when bundling")
  .option("--toc", "force TOC on")
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

    // commander: --no-X  → opts.x === false;  --toc  → opts.toc === true
    // When both are given, explicit wins.  If neither, leave undefined (auto).
    const tocFlag = opts.toc === false ? false : opts.toc === true ? true : undefined;

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

program.parseAsync().catch((err) => {
  console.error(`✗ ${err.message}`);
  process.exit(1);
});
