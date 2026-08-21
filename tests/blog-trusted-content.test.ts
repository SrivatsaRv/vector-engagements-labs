import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { marked, type Tokens } from "marked";

import { renderBlogMarkdown } from "../lib/blog-markdown";

function render(markdown: string) {
  return renderToStaticMarkup(
    createElement("section", null, renderBlogMarkdown(marked.lexer(markdown) as Tokens.Generic[])),
  );
}

test("blog markdown renders adversarial markup as inert text and rejects executable link protocols", () => {
  const html = render([
    "<img src=x onerror=alert('owned')>",
    "",
    "[script](javascript:alert('owned')) [data](data:text/html,owned) [safe](https://example.com/reference)",
    "",
    "| input | value |",
    "| --- | --- |",
    "| <svg onload=alert('owned')> | [nested](javascript:alert('owned')) |",
  ].join("\n"));

  assert.doesNotMatch(html, /<img\b|<svg\b|<[^>]*\s(?:onerror|onload)=/i);
  assert.doesNotMatch(html, /href="(?:javascript|data):/i);
  assert.match(html, /&lt;img src=x onerror=alert/);
  assert.match(html, /&lt;svg onload=alert/);
  assert.match(html, /<a href="https:\/\/example\.com\/reference">safe<\/a>/);
  assert.match(html, />script<\/span>/);
  assert.match(html, />data<\/span>/);
});

test("blog markdown permits explicitly supported relative and mail links without raw HTML", () => {
  const html = render("[local](/math) [mail](mailto:research@reachdefence.com) **evidence** `digest`");

  assert.match(html, /<a href="\/math">local<\/a>/);
  assert.match(html, /<a href="mailto:research@reachdefence\.com">mail<\/a>/);
  assert.match(html, /<strong>evidence<\/strong>/);
  assert.match(html, /<code>digest<\/code>/);
  assert.doesNotMatch(html, /dangerouslySetInnerHTML/);
});

test("Mermaid content uses Mermaid strict mode instead of permissive HTML labels", async () => {
  const source = await readFile(new URL("../components/MermaidDiagram.tsx", import.meta.url), "utf8");

  assert.match(source, /securityLevel:\s*['"]strict['"]/);
  assert.doesNotMatch(source, /securityLevel:\s*['"]loose['"]/);
});
