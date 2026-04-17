import { existsSync, readdirSync, statSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join } from "node:path";
import puppeteer from "puppeteer-core";

const MAC_CHROME_PATHS = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
];

const LINUX_CHROME_PATHS = [
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/snap/bin/chromium",
];

const WIN_CHROME_PATHS = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];

function playwrightChromium() {
  const cache = join(homedir(), "Library/Caches/ms-playwright");
  if (!existsSync(cache)) return null;
  const dirs = readdirSync(cache)
    .filter((d) => d.startsWith("chromium-"))
    .sort()
    .reverse();
  for (const d of dirs) {
    const candidates = [
      join(cache, d, "chrome-mac/Chromium.app/Contents/MacOS/Chromium"),
      join(cache, d, "chrome-linux/chrome"),
      join(cache, d, "chrome-win/chrome.exe"),
    ];
    for (const c of candidates) if (existsSync(c) && isExec(c)) return c;
  }
  return null;
}

function isExec(p) {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

export function findChrome() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    const p = process.env.PUPPETEER_EXECUTABLE_PATH;
    if (existsSync(p)) return p;
    throw new Error(`PUPPETEER_EXECUTABLE_PATH set but not found: ${p}`);
  }

  const pw = playwrightChromium();
  if (pw) return pw;

  const paths =
    platform() === "darwin"
      ? MAC_CHROME_PATHS
      : platform() === "win32"
        ? WIN_CHROME_PATHS
        : LINUX_CHROME_PATHS;

  for (const p of paths) if (existsSync(p)) return p;

  throw new Error(
    "No Chrome/Chromium found. Install Google Chrome, or set PUPPETEER_EXECUTABLE_PATH.",
  );
}

export async function launch() {
  const executablePath = findChrome();
  return puppeteer.launch({
    executablePath,
    headless: true,
    args: platform() === "linux" ? ["--no-sandbox", "--disable-setuid-sandbox"] : [],
  });
}
