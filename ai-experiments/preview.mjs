// Builds a simple web page that shows a comic strip the way the app will:
// the plain picture with narration text and speech bubbles laid over it.
// The page and the pictures must sit in the same folder.

import fs from "fs";

// Makes text safe to put inside a web page
const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export function writePreview({ reporterName, stories, strip, style, stamp }) {
  const panels = strip.panels
    .map((p, i) => {
      const file = "full-" + style + "-" + stamp + "-" + (i + 1) + ".png";
      // Narration: plain black text that sits right in the panel, no box
      const caption = p.caption
        ? '<div class="cap ' + (i % 2 ? "r" : "l") + '">' + esc(p.caption) + "</div>"
        : "";
      const bubbles = (p.dialogue || [])
        .map((line, k) => '<div class="bubble ' + (k % 2 ? "right" : "left") + '">' + esc(line) + "</div>")
        .join("");
      return (
        '<figure class="panel">' +
        '<img src="' + file + '" alt="Comic panel ' + (i + 1) + '" onerror="this.style.display=\'none\'">' +
        '<div class="text">' + caption + bubbles + "</div>" +
        '<span class="num">' + (i + 1) + "</span>" +
        "</figure>"
      );
    })
    .join("\n");

  const articles = stories
    .map(
      (s) =>
        "<article>" +
        '<span class="section">' + esc(s.section) + "</span>" +
        "<h3>" + esc(s.headline) + "</h3>" +
        "<p>" + esc(s.article) + "</p>" +
        "</article>"
    )
    .join("\n");

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Weekly Funnies preview</title>
<style>
  :root { --paper: #f6efe0; --ink: #1c1916; }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--paper); color: var(--ink); font-family: system-ui, sans-serif; }
  header { text-align: center; padding: 28px 16px 14px; border-bottom: 4px double var(--ink); margin: 0 auto; max-width: 880px; }
  .kicker { margin: 0; font-size: 12px; letter-spacing: 0.2em; text-transform: uppercase; opacity: 0.6; }
  h1 { margin: 4px 0; font-family: Georgia, "Times New Roman", serif; font-size: clamp(28px, 6vw, 52px); letter-spacing: 0.04em; }
  .sub { margin: 0; font-size: 14px; opacity: 0.7; }
  main { max-width: 880px; margin: 0 auto; padding: 20px 16px 48px; }
  h2 { font-family: Georgia, serif; font-size: 26px; margin: 8px 0 14px; }
  .note { font-size: 13px; opacity: 0.65; margin: 0 0 14px; }
  .strip { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; padding: 4px; background: var(--ink); max-width: 680px; margin: 0 auto; }
  .panel { position: relative; margin: 0; aspect-ratio: 4 / 3; overflow: hidden; background: #ddd5c3; }
  .panel img { width: 100%; height: 100%; object-fit: cover; display: block; }

  /* Narration and speech flow together from the top of the panel */
  .text { position: absolute; top: 8px; left: 8px; right: 8px; display: flex; flex-direction: column; gap: 6px; pointer-events: none;
          font-family: "Arial Narrow", Arial, "Helvetica Neue", sans-serif; text-transform: uppercase; color: #000; }
  .cap { max-width: 52%; font-size: clamp(9px, 1.8vw, 12px); font-weight: 600; letter-spacing: 0.02em; line-height: 1.25;
         text-shadow: -1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff, 1px 1px 0 #fff, 0 0 4px #fff, 0 0 7px #fff; }
  .cap.l { align-self: flex-start; text-align: left; }
  .cap.r { align-self: flex-end; text-align: right; }
  .bubble { max-width: 62%; background: #fff; border: 2px solid #000; border-radius: 14px; padding: 4px 8px; font-size: clamp(10px, 2vw, 13px); font-weight: 700; line-height: 1.25; }
  .bubble.left { align-self: flex-start; }
  .bubble.right { align-self: flex-end; }
  .num { position: absolute; bottom: 0; right: 0; background: #000; color: #fff; font-size: 11px; padding: 2px 7px; }

  .stories { margin-top: 28px; border-top: 4px double var(--ink); padding-top: 8px; display: grid; gap: 16px; }
  article h3 { margin: 4px 0; font-family: Georgia, serif; font-size: 22px; }
  article p { margin: 0; line-height: 1.5; }
  .section { font-size: 11px; letter-spacing: 0.15em; text-transform: uppercase; font-weight: 700; opacity: 0.6; }
</style>
</head>
<body>
<header>
  <p class="kicker">Preview</p>
  <h1>THE WEEKLY FUNNIES</h1>
  <p class="sub">By ${esc(reporterName)} · ${esc(style)} style</p>
</header>
<main>
  <h2>${esc(strip.title)}</h2>
  <p class="note">Panels are cropped to 4:3 and the text is laid over the pictures, the way the app will do it.</p>
  <div class="strip">
${panels}
  </div>
  <section class="stories">
${articles}
  </section>
</main>
</body>
</html>`;

  const out = "preview-" + stamp + ".html";
  fs.writeFileSync(out, html);
  return out;
}
