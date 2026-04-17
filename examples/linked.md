# Linked page

This file demonstrates the **link-walker bundling** feature.  When `sample.md` links to this file, `md2pdf` automatically pulls it into the same PDF as its own section, rewrites the link to an internal anchor, and adds both files to the TOC.

See also: [deeper page](./deeper/notes.md) — the walker follows links transitively.

## Why bundle?

Writing docs as a small tree of linked markdown files is ergonomic; distributing them as a single PDF is ergonomic too.  `md2pdf` tries to make that round-trip painless.

```ts
// TypeScript also highlights
type Doc = { path: string; anchor: string };
const docs: Doc[] = [{ path: "sample.md", anchor: "sample-md" }];
```

- **Scope**: only files under `--root` are followed
- **Cycle-safe**: visited set dedupes via realpath
- **Non-.md links** pass through untouched
