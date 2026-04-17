import { readFileSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";

const LINK_RE = /!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

function slugifyPath(relPath) {
  return relPath
    .replace(/^\.\//, "")
    .replace(/\.\.\//g, "up-")
    .replace(/[^\w.-]+/g, "-")
    .replace(/\.md$/i, "")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "doc";
}

function stripFragment(href) {
  const i = href.indexOf("#");
  return i === -1 ? { path: href, frag: "" } : { path: href.slice(0, i), frag: href.slice(i) };
}

function isExternal(href) {
  return /^([a-z]+:)?\/\//i.test(href) || href.startsWith("mailto:") || href.startsWith("tel:");
}

function safeRealpath(p) {
  try {
    return realpathSync(p);
  } catch {
    return null;
  }
}

function withinRoot(absPath, rootAbs) {
  const rel = relative(rootAbs, absPath);
  return !rel.startsWith("..") && !isAbsolute(rel);
}

/**
 * Walks *.md links reachable from entryPath (BFS). Returns
 *   { docs: [{ absPath, relPath, anchorId, content, dir }], anchorMap: Map<absPath, anchorId> }
 * anchorMap also includes real-path entries so renderer lookups cover symlinks.
 */
export function collect(entryPath, { root, maxDepth = Infinity, follow = true } = {}) {
  const entryAbs = safeRealpath(resolve(entryPath));
  if (!entryAbs) throw new Error(`Entry file not found: ${entryPath}`);

  const rootAbs = safeRealpath(resolve(root || dirname(entryAbs)));
  if (!rootAbs) throw new Error(`Root directory not found: ${root}`);

  const docs = [];
  const seen = new Set();
  const anchorMap = new Map();
  const queue = [{ abs: entryAbs, depth: 0 }];

  while (queue.length) {
    const { abs, depth } = queue.shift();
    if (seen.has(abs)) continue;
    seen.add(abs);

    let content;
    try {
      content = readFileSync(abs, "utf8");
    } catch (e) {
      console.warn(`! skipping unreadable file: ${abs} (${e.message})`);
      continue;
    }

    const relPath = relative(rootAbs, abs) || "index.md";
    const anchorId = dedupeAnchor(slugifyPath(relPath), anchorMap);
    anchorMap.set(abs, anchorId);
    docs.push({ absPath: abs, relPath, anchorId, content, dir: dirname(abs) });

    if (!follow || depth >= maxDepth) continue;

    for (const match of content.matchAll(LINK_RE)) {
      if (match[0].startsWith("!")) continue;
      const raw = match[1].trim();
      if (!raw || isExternal(raw)) continue;
      const { path: p } = stripFragment(raw);
      if (!p || !/\.md$/i.test(p)) continue;

      const target = safeRealpath(resolve(dirname(abs), p));
      if (!target) continue;
      if (!withinRoot(target, rootAbs)) continue;
      if (seen.has(target)) continue;

      queue.push({ abs: target, depth: depth + 1 });
    }
  }

  return { docs, anchorMap, rootAbs, entryAbs };
}

function dedupeAnchor(base, anchorMap) {
  const existing = new Set(anchorMap.values());
  if (!existing.has(base)) return base;
  let i = 2;
  while (existing.has(`${base}-${i}`)) i++;
  return `${base}-${i}`;
}
