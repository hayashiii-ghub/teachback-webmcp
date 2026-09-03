import { chromium } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

type RenderTarget = {
  id: string;
  source: string;
  output: string;
  width: number;
  height: number;
  quality?: number;
};

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const targets: RenderTarget[] = [
  {
    id: "favicon",
    source: "public/favicon.svg",
    output: "public/apple-touch-icon.png",
    width: 180,
    height: 180,
  },
  {
    id: "og",
    source: "public/og.svg",
    output: "public/og.png",
    width: 1200,
    height: 630,
  },
  {
    id: "devpost",
    source: "public/devpost-thumbnail.svg",
    output: "public/devpost-thumbnail.png",
    width: 1200,
    height: 800,
  },
  {
    id: "youtube-v2",
    source: "docs/submission-v2/youtube-thumbnail.svg",
    output: "docs/submission-v2/youtube-thumbnail.jpg",
    width: 1920,
    height: 1080,
    quality: 94,
  },
];

const requestedTarget = process.argv[2];
const selectedTargets = requestedTarget
  ? targets.filter((target) => target.id === requestedTarget)
  : targets;

if (requestedTarget && selectedTargets.length === 0) {
  throw new Error(`Unknown render target: ${requestedTarget}`);
}

const browser = await chromium.launch({ headless: true });

try {
  for (const target of selectedTargets) {
    const page = await browser.newPage({
      viewport: { width: target.width, height: target.height },
      deviceScaleFactor: 1,
    });
    const svg = await readFile(resolve(projectRoot, target.source), "utf8");

    await page.setContent(
      `<style>html,body{margin:0;width:100%;height:100%;overflow:hidden}svg{display:block;width:100%;height:100%}</style>${svg}`,
    );
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: resolve(projectRoot, target.output),
      omitBackground: true,
      quality: target.quality,
    });
    await page.close();
  }
} finally {
  await browser.close();
}
