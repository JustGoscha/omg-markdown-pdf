# omg-markdown-pdf

Lightweight Markdown → A4 PDF converter.  Handles the GitHub-flavored niceties — tables, task lists, footnotes, emoji, code highlighting, Mermaid, KaTeX math — and **bundles linked `*.md` files into a single PDF** with internal hyperlinks.

- **No Chromium download.** Uses `puppeteer-core` + your existing Chrome / Chromium / Playwright cache.
- **Small dep tree.** `markdown-it`, `highlight.js`, `mermaid`, `katex`, `puppeteer-core`, `commander`.
- **Bun first**, Node ≥ 20 also works.

## Install

```bash
bun install
```

## CLI

```bash
bun src/cli.js examples/sample.md -o examples/sample.pdf
# or once linked globally:
md2pdf examples/sample.md -o examples/sample.pdf
```

Options:

| flag | default | what |
| --- | --- | --- |
| `-o, --output <file>` | `<input>.pdf` | output PDF path |
| `--format <A4\|Letter>` | `A4` | page size |
| `--margin <size>` | `20mm` | page margin (any CSS length) |
| `--theme <light\|dark>` | `light` | syntax + markdown theme |
| `--header <html>` | — | puppeteer header template |
| `--footer <html>` | — | puppeteer footer template; pass `auto` for page numbers |
| `--toc <auto\|on\|off>` | `auto` | TOC on by default when bundling >1 file |
| `--no-mermaid` | — | skip mermaid rendering |
| `--no-math` | — | skip KaTeX math |
| `--no-follow` | — | don't follow `[text](foo.md)` links |
| `--root <dir>` | unrestricted | opt-in scope: only follow links inside this dir |
| `--max-depth <n>` | ∞ | cap link recursion depth |
| `--open <where>` | `viewer` (TTY) / `off` (non-TTY) | open after write: `viewer` (Preview / xdg-open / Explorer), `browser` (reuses the detected Chrome), or `off` |
| `-q, --quiet` | — | suppress info logs |

### Linked-markdown bundling

Given `sample.md` containing `[details](./linked.md)` and `linked.md` containing `[more](./deeper/notes.md)`, running `md2pdf sample.md` produces one PDF with:

1. A table of contents listing all three files
2. Each file as its own section with a page break
3. Every `.md` link rewritten to an internal anchor (they click through inside the PDF)

Links are resolved relative to the linking file and followed wherever they point — `../sibling/other.md`, `./same-dir.md`, or absolute paths all work without restriction.  Pass `--root <dir>` to scope the walk to a subtree if you want to prevent crossing out of it.  External URLs, `mailto:`, and non-`.md` links pass through untouched.  Cycles are safe — each file is included at most once.

## Library

```js
import { writeFileSync } from "node:fs";
import { convert } from "omg-markdown-pdf";

const pdf = await convert("./docs/index.md", {
  format: "A4",
  margin: "20mm",
  theme: "light",
  footer: "auto",       // page numbers
});
writeFileSync("out.pdf", pdf);
```

## Browser detection

Looked up in this order:

1. `PUPPETEER_EXECUTABLE_PATH` env var
2. Playwright's cached Chromium (`~/Library/Caches/ms-playwright/chromium-*`)
3. System install — Chrome / Canary / Chromium / Edge / Brave in standard OS locations

If none is found, the CLI aborts with a clear error.

## Language coverage (syntax highlighting)

Uses the full `highlight.js` bundle — ~190 languages including JS/TS, Python, Go, Rust, Java, C/C++/C#, Ruby, PHP, Bash, PowerShell, SQL, HTML, CSS, JSON, YAML, TOML, XML, Markdown, Dockerfile, Makefile, Haskell, Elixir, Clojure, Kotlin, Scala, Swift, Lua, R, MATLAB, and many more.  Language aliases (`js`→`javascript`, `yml`→`yaml`, `sh`→`bash`) resolve automatically; unknown-language blocks fall back to `highlightAuto`.

## How it works

```
  entry.md  →  collector (BFS over *.md links, scoped to --root)
              ↓
           markdown-it + plugins + highlight.js  →  HTML fragment
              ↓
  template (GitHub CSS + mermaid.min.js + katex auto-render, all inlined)
              ↓
  puppeteer-core → system Chrome → page.pdf({ format: "A4", ... })
```

The template exposes a `window.__renderReady` promise that resolves once images, mermaid diagrams, and math have all rendered; puppeteer awaits it before snapshotting, so you never get a half-drawn diagram in the PDF.

## Verified end-to-end

Running `bun src/cli.js examples/sample.md -o /tmp/sample.pdf` produces a 6-page A4 PDF containing all three bundled files, with a TOC and working internal cross-links, mermaid SVGs, KaTeX math, and syntax-highlighted code — see `examples/`.
