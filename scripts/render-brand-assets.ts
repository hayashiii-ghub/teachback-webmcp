import { chromium } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

type RenderTarget = {
  source: string;
  output: string;
  width: number;
  height: number;
};

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const targets: RenderTarget[] = [
  {
    source: "public/favicon.svg",
    output: "public/apple-touch-icon.png",
    width: 180,
    height: 180,
  },
  {
    source: "public/og.svg",
    output: "public/og.png",
    width: 1200,
    height: 630,
  },
  {
    source: "public/devpost-thumbnail.svg",
    output: "public/devpost-thumbnail.png",
    width: 1200,
    height: 800,
  },
];

const browser = await chromium.launch({ headless: true });

try {
  for (const target of targets) {
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
    });
    await page.close();
  }
} finally {
  await browser.close();
}
