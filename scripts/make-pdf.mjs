#!/usr/bin/env node
// Render the coordination-plan artifact to a print-ready PDF.
//
//   node scripts/make-pdf.js <input.html> [output.pdf]
//
// The artifact source is a fragment — the publisher wraps it in a document
// skeleton at publish time. For local rendering we add that skeleton ourselves,
// pin the light theme (a PDF has no viewer preference to follow), and layer on
// print rules so cards and table rows do not split across pages.

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const [input, output] = process.argv.slice(2);
if (!input) {
  console.error("usage: node scripts/make-pdf.js <input.html> [output.pdf]");
  process.exit(2);
}
const outPdf = path.resolve(output || input.replace(/\.html?$/i, "") + ".pdf");

const CHROME = [
  `${process.env.ProgramFiles}\\Google\\Chrome\\Application\\chrome.exe`,
  `${process.env["ProgramFiles(x86)"]}\\Microsoft\\Edge\\Application\\msedge.exe`,
  `${process.env.ProgramFiles}\\Microsoft\\Edge\\Application\\msedge.exe`,
].find((p) => fs.existsSync(p));
if (!CHROME) {
  console.error("No Chrome or Edge found to render with.");
  process.exit(1);
}

const fragment = fs.readFileSync(path.resolve(input), "utf8");

/**
 * Headless rendering races webfont loading, and a lost race is silent — the page
 * just falls back to the system stack. Fetch the Google Fonts CSS and inline every
 * face as a data: URI so the PDF is self-contained and the typography is certain.
 */
async function inlineGoogleFonts(html) {
  const hrefs = [...html.matchAll(/<link\b[^>]*href="(https:\/\/fonts\.googleapis\.com\/css2[^"]+)"/gi)].map(
    (m) => m[1].replace(/&amp;/g, "&")
  );
  if (!hrefs.length) return "";

  // Deliberately an old Chrome UA. Modern UAs get *variable* fonts, and Chrome's
  // PDF export does not apply the weight axis to them — headings silently fall back
  // to a system face, and italics come out as the variable default (ExtraLight).
  // Pre-66 Chrome predates variable-font serving, so Google returns one static
  // woff2 per weight, which the print pipeline embeds correctly.
  const UA =
    "Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/60.0.3112.113 Safari/537.36";

  let css = "";
  for (const href of hrefs) {
    const res = await fetch(href, { headers: { "User-Agent": UA } });
    if (!res.ok) throw new Error(`font css ${res.status} for ${href}`);
    css += await res.text();
  }

  const urls = [...new Set([...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)].map((m) => m[1]))];
  console.log(`inlining ${urls.length} font files ...`);
  const byUrl = new Map();
  await Promise.all(
    urls.map(async (u) => {
      const r = await fetch(u, { headers: { "User-Agent": UA } });
      const buf = Buffer.from(await r.arrayBuffer());
      const mime = u.endsWith(".woff2") ? "font/woff2" : u.endsWith(".woff") ? "font/woff" : "font/ttf";
      byUrl.set(u, `data:${mime};base64,${buf.toString("base64")}`);
    })
  );
  for (const [u, data] of byUrl) css = css.split(u).join(data);
  return css;
}

const fontCss = await inlineGoogleFonts(fragment);

const printCss = `
  @page { size: A4; margin: 13mm 12mm 15mm; }

  html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }

  @media print {
    body { font-size: 10.2pt; line-height: 1.5; }
    .shell { max-width: none; padding: 0; gap: 26px; }

    /* Keep a unit of meaning on one page wherever it fits. */
    .card, .role, .tally, .masthead, tr, pre { break-inside: avoid; }
    .sec-head, h2, h3 { break-after: avoid; }
    section { break-inside: auto; }

    /* The masthead earns a page of its own; sections start clean after it. */
    .masthead { break-after: page; }

    /* On screen the table scrolls sideways; on paper it has to fit. */
    .scroller { overflow-x: visible; }
    table { min-width: 0; font-size: 8.6pt; }
    th, td { padding: 6px 8px; }
    td.line { width: 22%; }

    pre { font-size: 8.4pt; padding: 10px 12px; white-space: pre-wrap; word-break: break-word; }
    code { font-size: 0.9em; }

    .masthead h1 { font-size: 30pt; }
    .sec-head h2 { font-size: 15pt; }
    h3 { font-size: 10.8pt; }
    .tally .n { font-size: 17pt; }

    p, ul { max-width: none; }
    a { text-decoration: none; }
  }
`;

const doc = `<!doctype html>
<html lang="en" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${fragment.match(/<title>[\s\S]*?<\/title>/i)?.[0] ?? "<title>UrbanCool</title>"}
<style>${fontCss}</style>
${[...fragment.matchAll(/<style>[\s\S]*?<\/style>/gi)].map((m) => m[0]).join("\n")}
<style>${printCss}</style>
</head>
<body>
${fragment
  .replace(/<title>[\s\S]*?<\/title>/i, "")
  .replace(/<link\b[^>]*>/gi, "")
  .replace(/<style>[\s\S]*?<\/style>/gi, "")}
</body>
</html>`;

const tmpHtml = path.join(path.dirname(outPdf), ".print-build.html");
fs.writeFileSync(tmpHtml, doc, "utf8");

console.log(`rendering with ${path.basename(CHROME)} ...`);
execFileSync(
  CHROME,
  [
    // Old headless snapshots the print output before webfonts are applied — the
    // fonts load (document.fonts confirms it) but the PDF still ships system
    // fallbacks. New headless runs the real print pipeline and honours them.
    // Without an isolated profile, Chrome hands the URL to the already-running
    // instance and silently drops every flag below — including --print-to-pdf.
    `--user-data-dir=${path.join(path.dirname(outPdf), ".chrome-profile")}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    // Old headless snapshots the print output before webfonts are applied — the
    // fonts load (document.fonts confirms it) but the PDF still ships system
    // fallbacks. New headless runs the real print pipeline and honours them.
    "--headless=new",
    "--disable-gpu",
    "--no-pdf-header-footer",
    "--run-all-compositor-stages-before-draw",
    "--virtual-time-budget=20000",
    `--print-to-pdf=${outPdf}`,
    `file:///${tmpHtml.replace(/\\/g, "/")}`,
  ],
  { stdio: "inherit" }
);

fs.unlinkSync(tmpHtml);
const kb = (fs.statSync(outPdf).size / 1024).toFixed(0);
console.log(`wrote ${outPdf} (${kb} KB)`);
