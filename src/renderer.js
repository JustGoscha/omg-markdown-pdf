import { existsSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import MarkdownIt from "markdown-it";
import anchor from "markdown-it-anchor";
import footnote from "markdown-it-footnote";
import { full as emoji } from "markdown-it-emoji";
import taskLists from "markdown-it-task-lists";
import hljs from "highlight.js";

function highlight(code, lang) {
  if (lang && hljs.getLanguage(lang)) {
    try {
      return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
    } catch {
      /* fall through */
    }
  }
  return hljs.highlightAuto(code).value;
}

export function createRenderer({ anchorMap, rootAbs }) {
  const md = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: true,
    breaks: false,
    highlight: () => "", // handled in custom fence rule to keep mermaid blocks raw
  });

  md.use(anchor, { permalink: false, slugify: (s) => slugify(s) });
  md.use(footnote);
  md.use(emoji);
  md.use(taskLists, { enabled: true, label: true });

  const defaultFence = md.renderer.rules.fence;
  md.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const info = (token.info || "").trim().toLowerCase();
    if (info === "mermaid") {
      return `<pre class="mermaid">${escapeHtml(token.content)}</pre>\n`;
    }
    const lang = info.split(/\s+/)[0];
    const highlighted = highlight(token.content, lang);
    const cls = lang ? ` class="hljs language-${escapeAttr(lang)}"` : ' class="hljs"';
    return `<pre><code${cls}>${highlighted}</code></pre>\n`;
  };

  const defaultImage = md.renderer.rules.image;
  md.renderer.rules.image = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const srcIdx = token.attrIndex("src");
    if (srcIdx >= 0) {
      const src = token.attrs[srcIdx][1];
      token.attrs[srcIdx][1] = resolveAsset(src, env.sourceDir);
    }
    return defaultImage
      ? defaultImage(tokens, idx, options, env, self)
      : self.renderToken(tokens, idx, options);
  };

  const defaultLinkOpen =
    md.renderer.rules.link_open ||
    ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));
  md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const hrefIdx = token.attrIndex("href");
    if (hrefIdx >= 0) {
      const href = token.attrs[hrefIdx][1];
      const rewritten = rewriteHref(href, env.sourceDir, anchorMap);
      if (rewritten !== null) {
        token.attrs[hrefIdx][1] = rewritten;
      } else if (/^([a-z]+:)?\/\//i.test(href)) {
        token.attrSet("target", "_blank");
        token.attrSet("rel", "noopener");
      }
    }
    return defaultLinkOpen(tokens, idx, options, env, self);
  };

  return {
    render(content, { sourceDir } = {}) {
      return md.render(content, { sourceDir });
    },
  };
}

function resolveAsset(src, sourceDir) {
  if (!src) return src;
  if (/^([a-z]+:)?\/\//i.test(src) || src.startsWith("data:") || src.startsWith("file:")) return src;
  const abs = isAbsolute(src) ? src : resolve(sourceDir || process.cwd(), src);
  if (!existsSync(abs)) {
    console.warn(`! image not found: ${src} (resolved to ${abs})`);
    return src;
  }
  return pathToFileURL(abs).href;
}

function rewriteHref(href, sourceDir, anchorMap) {
  if (!href) return null;
  if (href.startsWith("#")) return null;
  if (/^([a-z]+:)?\/\//i.test(href) || href.startsWith("mailto:") || href.startsWith("tel:")) {
    return null;
  }
  const [rawPath, frag = ""] = href.split("#");
  if (!/\.md$/i.test(rawPath)) return null;
  const abs = isAbsolute(rawPath) ? rawPath : resolve(sourceDir || process.cwd(), rawPath);
  let real = abs;
  try {
    real = realpathSync(abs);
  } catch {
    /* non-existent target: fall back to plain abs */
  }
  const anchorId = anchorMap.get(real) || anchorMap.get(abs);
  if (!anchorId) return null;
  return `#${anchorId}${frag ? "-" + slugify(frag.slice(1)) : ""}`;
}

function slugify(s) {
  return String(s)
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(s) {
  return String(s).replace(/"/g, "&quot;");
}
