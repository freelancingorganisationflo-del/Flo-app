import { test } from "node:test";
import assert from "node:assert/strict";

import {
  parseChartSpec,
  parseInline,
  parseRich,
  parseStructuredBlocks,
  safeHref,
  safeImageSrc,
  type RichBlock,
} from "./parse.ts";

function types(blocks: RichBlock[]): string[] {
  return blocks.map((block) => block.type);
}

// 1. Normal question -> plain text
test("plain question becomes a text block", () => {
  const blocks = parseRich("The capital of Japan is Tokyo.");
  assert.deepEqual(types(blocks), ["text"]);
  assert.equal((blocks[0] as { text: string }).text, "The capital of Japan is Tokyo.");
});

// 2. Comparison -> table
test("comparison renders a table", () => {
  const md = [
    "| Feature | Python | SQL |",
    "| --- | --- | --- |",
    "| Main use | Programming | Database querying |",
    "| Learning | Moderate | Easy |",
  ].join("\n");
  const blocks = parseRich(md);
  assert.deepEqual(types(blocks), ["table"]);
  const table = blocks[0] as Extract<RichBlock, { type: "table" }>;
  assert.deepEqual(table.columns, ["Feature", "Python", "SQL"]);
  assert.equal(table.rows.length, 2);
  assert.equal(table.rows[0][2], "Database querying");
});

// 3. Large table
test("large table keeps every row", () => {
  const rows = Array.from({ length: 40 }, (_, i) => `| Item ${i} | ${i} |`);
  const md = ["| Name | Value |", "| --- | --- |", ...rows].join("\n");
  const table = parseRich(md)[0] as Extract<RichBlock, { type: "table" }>;
  assert.equal(table.type, "table");
  assert.equal(table.rows.length, 40);
});

// 4. Small table with alignment
test("table alignment is parsed", () => {
  const md = ["| L | C | R |", "| :--- | :---: | ---: |", "| a | b | c |"].join("\n");
  const table = parseRich(md)[0] as Extract<RichBlock, { type: "table" }>;
  assert.deepEqual(table.align, ["left", "center", "right"]);
});

// 5. Step-by-step tutorial -> numbered list
test("how-to becomes a numbered list", () => {
  const md = "1. Download Python\n2. Install it\n3. Verify installation\n4. Configure VS Code";
  const blocks = parseRich(md);
  assert.deepEqual(types(blocks), ["numbered_list"]);
  assert.equal((blocks[0] as Extract<RichBlock, { type: "numbered_list" }>).items.length, 4);
});

// 6. Code response
test("fenced code keeps language and body", () => {
  const md = 'Here you go:\n\n```python\nprint("Hello World")\n```';
  const blocks = parseRich(md);
  assert.deepEqual(types(blocks), ["text", "code"]);
  const code = blocks[1] as Extract<RichBlock, { type: "code" }>;
  assert.equal(code.lang, "python");
  assert.equal(code.code, 'print("Hello World")');
});

// 7. Pros/cons table
test("pros and cons table", () => {
  const md = ["| Advantages | Disadvantages |", "| --- | --- |", "| Fast | Costly |"].join("\n");
  const blocks = parseRich(md);
  assert.deepEqual(types(blocks), ["table"]);
});

// 8. Bullet list
test("bullet list", () => {
  const md = "Features\n\n- Feature 1\n- Feature 2\n- Feature 3";
  const blocks = parseRich(md);
  assert.deepEqual(types(blocks), ["text", "bullet_list"]);
  assert.equal((blocks[1] as Extract<RichBlock, { type: "bullet_list" }>).items.length, 3);
});

// 9. Web-search answer with sources
test("sources section becomes a source list", () => {
  const md = [
    "The answer is 42. [1]",
    "",
    "## Sources",
    "1. [Official docs](https://docs.example.com/page)",
    "2. [Gov site](https://gov.example.org/report)",
  ].join("\n");
  const blocks = parseRich(md);
  assert.deepEqual(types(blocks), ["text", "source_list"]);
  const sources = (blocks[1] as Extract<RichBlock, { type: "source_list" }>).items;
  assert.equal(sources.length, 2);
  assert.equal(sources[0].url, "https://docs.example.com/page");
});

// 10. Vision answer -> bullets + table
test("vision style answer with bullets and table", () => {
  const md = [
    "What I can see",
    "",
    "- A receipt",
    "- Two items",
    "",
    "| Field | Value |",
    "| --- | --- |",
    "| Total | 12.50 |",
  ].join("\n");
  const blocks = parseRich(md);
  assert.deepEqual(types(blocks), ["text", "bullet_list", "table"]);
});

// 11. Chart block
test("chart fenced block parses a spec", () => {
  const md = [
    "Monthly sales",
    "",
    "```chart",
    '{"type":"bar","title":"Sales","labels":["Jan","Feb","Mar"],"datasets":[{"label":"Units","values":[100,120,150]}]}',
    "```",
  ].join("\n");
  const blocks = parseRich(md);
  assert.deepEqual(types(blocks), ["text", "chart"]);
  const chart = blocks[1] as Extract<RichBlock, { type: "chart" }>;
  assert.equal(chart.spec.type, "bar");
  assert.deepEqual(chart.spec.datasets[0].values, [100, 120, 150]);
});

// 11b. Chart fallback to text/table when malformed
test("malformed chart falls back to a code block", () => {
  const md = "```chart\nnot json at all\n```";
  const blocks = parseRich(md);
  assert.deepEqual(types(blocks), ["code"]);
});

// 13/20. Long mixed response
test("mixed text, table and code parse in order", () => {
  const md = [
    "Intro paragraph.",
    "",
    "| A | B |",
    "| --- | --- |",
    "| 1 | 2 |",
    "",
    "```js",
    "const x = 1;",
    "```",
    "",
    "## Closing",
    "Done.",
  ].join("\n");
  assert.deepEqual(types(parseRich(md)), ["text", "table", "code", "heading", "text"]);
});

// 14. Streaming / incomplete input must not throw
test("incomplete code fence does not throw", () => {
  const blocks = parseRich("```python\nprint('partial");
  assert.deepEqual(types(blocks), ["code"]);
});

test("incomplete table row is tolerated", () => {
  const blocks = parseRich("| A | B |\n| --- | --- |\n| 1 |");
  const table = blocks[0] as Extract<RichBlock, { type: "table" }>;
  assert.equal(table.rows[0].length, 2);
  assert.equal(table.rows[0][1], "");
});

// 15. Malformed markdown
test("malformed markdown does not throw", () => {
  const weird = "|||\n|--|\n###\n> \n`unclosed\n1.\n- \n***";
  assert.doesNotThrow(() => parseRich(weird));
});

// 16. Malicious HTML/script is kept as inert text, unsafe links dropped
test("raw html and scripts stay inert text", () => {
  const md = '<script>alert(1)</script> and <img src=x onerror=alert(1)>';
  const blocks = parseRich(md);
  assert.deepEqual(types(blocks), ["text"]);
  assert.match((blocks[0] as { text: string }).text, /<script>/);
});

test("javascript and data links are rejected", () => {
  assert.equal(safeHref("javascript:alert(1)"), null);
  assert.equal(safeHref("data:text/html,<script>"), null);
  assert.equal(safeHref("https://ok.example.com"), "https://ok.example.com");
  assert.equal(safeImageSrc("javascript:alert(1)"), null);
  assert.equal(safeImageSrc("data:image/svg+xml;base64,PHN2Zz4="), null);
  assert.equal(safeImageSrc("data:image/png;base64,iVBORw0KGgo="), "data:image/png;base64,iVBORw0KGgo=");

  const nodes = parseInline("[click](javascript:alert(1))");
  assert.deepEqual(nodes, [{ type: "text", text: "click" }]);
});

// 17. Very wide table keeps all columns
test("wide table keeps every column", () => {
  const header = Array.from({ length: 15 }, (_, i) => `Col${i}`).join(" | ");
  const divider = Array.from({ length: 15 }, () => "---").join(" | ");
  const row = Array.from({ length: 15 }, (_, i) => `v${i}`).join(" | ");
  const table = parseRich(`| ${header} |\n| ${divider} |\n| ${row} |`)[0] as Extract<
    RichBlock,
    { type: "table" }
  >;
  assert.equal(table.columns.length, 15);
  assert.equal(table.rows[0].length, 15);
});

// 18. Table cell containing code / 19. cell containing a URL
test("cells preserve inline code and link markdown", () => {
  const md = [
    "| Field | Value |",
    "| --- | --- |",
    "| command | `npm run build` |",
    "| docs | [Guide](https://example.com/guide) |",
  ].join("\n");
  const table = parseRich(md)[0] as Extract<RichBlock, { type: "table" }>;
  assert.equal(table.rows[0][1], "`npm run build`");
  const nodes = parseInline(table.rows[1][1]);
  assert.equal(nodes[0].type, "link");
  assert.equal((nodes[0] as Extract<typeof nodes[0], { type: "link" }>).url, "https://example.com/guide");
});

// 21. Checklist, callout, quote, divider
test("checklist, callout, quote and divider blocks", () => {
  assert.equal(parseRich("- [ ] todo\n- [x] done")[0].type, "checklist");
  const checklist = parseRich("- [ ] todo\n- [x] done")[0] as Extract<RichBlock, { type: "checklist" }>;
  assert.equal(checklist.items[1].checked, true);

  const callout = parseRich("> [!TIP]\n> Use a virtualenv.")[0] as Extract<
    RichBlock,
    { type: "callout" }
  >;
  assert.equal(callout.type, "callout");
  assert.equal(callout.variant, "tip");
  assert.match(callout.text, /virtualenv/);

  assert.equal(parseRich("> just a quote")[0].type, "quote");
  assert.equal(parseRich("---")[0].type, "divider");
});

// Inline formatting
test("inline parser handles bold, italic, code and links", () => {
  const nodes = parseInline("**bold** and *italic* and `code` and [x](https://x.dev)");
  const seen = nodes.map((node) => node.type);
  assert.ok(seen.includes("strong"));
  assert.ok(seen.includes("em"));
  assert.ok(seen.includes("code"));
  assert.ok(seen.includes("link"));
});

// Structured ```response block
test("structured response json becomes blocks", () => {
  const spec = JSON.stringify({
    type: "response",
    blocks: [
      { type: "heading", text: "Title" },
      { type: "table", columns: ["A", "B"], rows: [["1", "2"]] },
      { type: "text", text: "Both work." },
    ],
  });
  const blocks = parseRich("```response\n" + spec + "\n```");
  assert.deepEqual(types(blocks), ["heading", "table", "text"]);
});

test("invalid structured response falls back to code", () => {
  assert.equal(parseStructuredBlocks("{ not json"), null);
  assert.equal(parseRich("```response\n{bad}\n```")[0].type, "code");
});

test("chart spec accepts simple label/value text", () => {
  const spec = parseChartSpec("Jan | 100\nFeb | 120\nMar | 150");
  assert.ok(spec);
  assert.deepEqual(spec?.datasets[0].values, [100, 120, 150]);
});

test("chart.js style spec is normalized", () => {
  const spec = parseChartSpec(
    JSON.stringify({
      type: "doughnut",
      data: {
        labels: ["A", "B"],
        datasets: [{ label: "Split", data: [3, 7], backgroundColor: "rgba(1,2,3,0.5)" }],
      },
      options: { plugins: { title: { display: true, text: "Traffic" } } },
    })
  );
  assert.ok(spec);
  assert.equal(spec?.type, "pie");
  assert.deepEqual(spec?.labels, ["A", "B"]);
  assert.deepEqual(spec?.datasets[0].values, [3, 7]);
  assert.equal(spec?.title, "Traffic");
});

test("scatter points and primitive data arrays are accepted", () => {
  const points = parseChartSpec(
    JSON.stringify({ type: "scatter", datasets: [{ label: "P", data: [{ x: 1, y: 4 }, { x: 2, y: 9 }] }] })
  );
  assert.deepEqual(points?.datasets[0].values, [4, 9]);

  const primitives = parseChartSpec(JSON.stringify({ type: "bar", values: [5, "10", "$15"] }));
  assert.deepEqual(primitives?.datasets[0].values, [5, 10, 15]);
});

test("empty input returns no blocks", () => {
  assert.deepEqual(parseRich(""), []);
  assert.deepEqual(parseRich("   \n  \n"), []);
});
