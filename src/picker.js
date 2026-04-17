import { emitKeypressEvents } from "node:readline";

/**
 * Minimal single-select TUI picker. No external deps.
 *
 *   const choice = await pickOne(["a.md", "b.md", ...], { prompt: "Pick one:" });
 *
 * Controls: ↑/↓ or k/j move, Enter selects, Esc/Ctrl-C aborts (returns null),
 *           type to substring-filter, Backspace edits the filter.
 *
 * Windowed for long lists — shows up to `pageSize` items at a time.
 */
export async function pickOne(items, { prompt = "Select:", pageSize = 15 } = {}) {
  if (!items.length) return null;
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    // Non-interactive: can't show a menu — bail.
    return null;
  }

  const stdin = process.stdin;
  const out = process.stdout;
  let filter = "";
  let cursor = 0;
  let lastHeight = 0;

  const filtered = () =>
    filter
      ? items.filter((s) => s.toLowerCase().includes(filter.toLowerCase()))
      : items;

  const render = (first = false) => {
    const list = filtered();
    if (cursor >= list.length) cursor = Math.max(0, list.length - 1);

    // Erase previous frame
    if (!first && lastHeight > 0) {
      out.write(`\x1b[${lastHeight}A`);
    }

    const lines = [];
    lines.push(
      `\x1b[1m${prompt}\x1b[0m  \x1b[2m${list.length}/${items.length} match${list.length === 1 ? "" : "es"}\x1b[0m`,
    );
    lines.push(`\x1b[2m  filter:\x1b[0m ${filter}\x1b[K`);

    const half = Math.floor(pageSize / 2);
    const start = Math.max(0, Math.min(list.length - pageSize, cursor - half));
    const end = Math.min(list.length, start + pageSize);

    for (let i = start; i < end; i++) {
      const selected = i === cursor;
      const marker = selected ? "\x1b[36m›\x1b[0m" : " ";
      const item = selected ? `\x1b[36m${list[i]}\x1b[0m` : list[i];
      lines.push(` ${marker} ${item}\x1b[K`);
    }

    if (list.length > pageSize) {
      lines.push(`\x1b[2m   … ${list.length - pageSize} more, type to filter\x1b[0m\x1b[K`);
    }
    lines.push(
      `\x1b[2m  ↑/↓ move · type to filter · Enter select · Esc cancel\x1b[0m\x1b[K`,
    );

    out.write(lines.join("\n") + "\n");
    lastHeight = lines.length;
  };

  return new Promise((resolve) => {
    emitKeypressEvents(stdin);
    if (stdin.setRawMode) stdin.setRawMode(true);
    stdin.resume();
    out.write("\x1b[?25l"); // hide cursor

    const cleanup = (result) => {
      out.write("\x1b[?25h"); // show cursor
      if (stdin.setRawMode) stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener("keypress", onKey);
      resolve(result);
    };

    const onKey = (chunk, key = {}) => {
      const list = filtered();

      if (key.ctrl && key.name === "c") return cleanup(null);
      if (key.name === "escape") return cleanup(null);

      if (key.name === "return" || key.name === "enter") {
        const picked = list[cursor];
        return cleanup(picked ?? null);
      }

      if (key.name === "up" || key.name === "k") {
        cursor = Math.max(0, cursor - 1);
      } else if (key.name === "down" || key.name === "j") {
        cursor = Math.min(list.length - 1, cursor + 1);
      } else if (key.name === "pageup") {
        cursor = Math.max(0, cursor - pageSize);
      } else if (key.name === "pagedown") {
        cursor = Math.min(list.length - 1, cursor + pageSize);
      } else if (key.name === "home") {
        cursor = 0;
      } else if (key.name === "end") {
        cursor = list.length - 1;
      } else if (key.name === "backspace") {
        filter = filter.slice(0, -1);
        cursor = 0;
      } else if (chunk && chunk.length === 1 && chunk >= " " && chunk <= "~") {
        filter += chunk;
        cursor = 0;
      }
      render();
    };

    stdin.on("keypress", onKey);
    render(true);
  });
}
