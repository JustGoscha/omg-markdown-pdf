import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import ignore from "ignore";

const HARD_SKIP = new Set(["node_modules", ".git"]);

/**
 * Scan `rootDir` for *.md files up to `maxDepth` directory levels deep.
 * Skips:
 *   - any path component starting with "."  (hidden files/dirs)
 *   - the hard-skip list (node_modules, .git) even if not dot-prefixed
 *   - anything matched by the nearest .gitignore at `rootDir`
 *
 * Depth: rootDir itself is depth 0, its direct children are depth 1, …
 * so maxDepth=3 means files at rootDir/a/b/c.md are included, deeper aren't.
 *
 * Returns relative POSIX-style paths, sorted.
 */
export function scanMarkdownFiles(rootDir, { maxDepth = 3 } = {}) {
  const ig = loadGitignore(rootDir);
  const out = [];
  walk(rootDir, rootDir, 0, maxDepth, ig, out);
  out.sort((a, b) => a.localeCompare(b));
  return out;
}

function loadGitignore(rootDir) {
  const ig = ignore();
  const gitignorePath = join(rootDir, ".gitignore");
  if (existsSync(gitignorePath)) {
    try {
      ig.add(readFileSync(gitignorePath, "utf8"));
    } catch {
      /* ignore */
    }
  }
  return ig;
}

function toPosix(p) {
  return sep === "/" ? p : p.split(sep).join("/");
}

function walk(rootDir, dir, depth, maxDepth, ig, out) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const e of entries) {
    if (e.name.startsWith(".")) continue;
    if (HARD_SKIP.has(e.name)) continue;

    const full = join(dir, e.name);
    const rel = toPosix(relative(rootDir, full));
    // `ignore` expects directory paths with a trailing slash for dir-only rules.
    const candidate = e.isDirectory() ? `${rel}/` : rel;
    if (ig.ignores(candidate)) continue;

    if (e.isDirectory()) {
      if (depth + 1 > maxDepth) continue;
      walk(rootDir, full, depth + 1, maxDepth, ig, out);
    } else if (e.isFile() && /\.md$/i.test(e.name)) {
      out.push(rel);
    }
  }
}
