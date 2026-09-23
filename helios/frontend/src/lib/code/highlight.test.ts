import { test } from "node:test";
import assert from "node:assert/strict";

import { buildPreviewDocument, previewKind, tokenize } from "./highlight.ts";

function textOf(code: string, lang: string, type: string): string[] {
  return tokenize(code, lang)
    .filter((t) => t.type === type)
    .map((t) => t.text);
}

// The scanner must never drop, duplicate or reorder characters.
test("tokenizing round-trips the exact source", () => {
  const samples: [string, string][] = [
    ["const x = 1;\n// note\nfunction f(a) { return `a=${a}`; }", "js"],
    ["def f(x):\n    # comment\n    return x + 1", "python"],
    ["select id, name from users where active = true;", "sql"],
    ['<div class="box" data-id="7">hi & bye</div>', "html"],
    ["body { color: #fff; margin: 0 auto; }", "css"],
    ["echo $HOME && ls -la # list", "bash"],
    ["fn main() { let x: u32 = 42; }", "rust"],
  ];
  for (const [code, lang] of samples) {
    const joined = tokenize(code, lang)
      .map((t) => t.text)
      .join("");
    assert.equal(joined, code, `round-trip failed for ${lang}`);
  }
});

test("javascript keywords and function calls", () => {
  assert.deepEqual(textOf("const add = 1;", "js", "keyword"), ["const"]);
  const tokens = tokenize("sum(1, 2)", "js");
  assert.deepEqual(
    tokens.filter((t) => t.type === "function").map((t) => t.text),
    ["sum"]
  );
  assert.deepEqual(
    tokens.filter((t) => t.type === "number").map((t) => t.text),
    ["1", "2"]
  );
});

test("comments and strings are detected per language", () => {
  const js = tokenize('// hi\nlet s = "a";', "js");
  assert.equal(js.find((t) => t.type === "comment")?.text, "// hi");
  assert.equal(js.find((t) => t.type === "string")?.text, '"a"');

  const py = tokenize("# hi\ns = 'a'", "python");
  assert.equal(py.find((t) => t.type === "comment")?.text, "# hi");
  assert.equal(py.find((t) => t.type === "string")?.text, "'a'");

  const sql = tokenize("-- hi\nselect 1", "sql");
  assert.equal(sql.find((t) => t.type === "comment")?.text, "-- hi");
});

test("html tags, attributes and values", () => {
  const tokens = tokenize('<a href="/x" class="y">go</a>', "html");
  assert.deepEqual(textOf('<a href="/x">go</a>', "html", "tag"), ["a", "a"]);
  assert.deepEqual(
    tokens.filter((t) => t.type === "attr").map((t) => t.text),
    ["href", "class"]
  );
  assert.deepEqual(
    tokens.filter((t) => t.type === "string").map((t) => t.text),
    ['"/x"', '"y"']
  );
});

test("css property names after a colon are attributes", () => {
  const props = textOf("color: red;", "css", "attr");
  assert.deepEqual(props, ["color"]);
});

test("empty input and unknown language are safe", () => {
  assert.deepEqual(tokenize("", "js"), []);
  const plain = tokenize("hello world", "brainfuck");
  assert.equal(plain.map((t) => t.text).join(""), "hello world");
  assert.ok(plain.every((t) => t.type === "plain"));
});

test("preview kinds and documents", () => {
  assert.equal(previewKind("html"), "html");
  assert.equal(previewKind("jsx"), "js");
  assert.equal(previewKind("scss"), "css");
  assert.equal(previewKind("python"), null);

  assert.equal(buildPreviewDocument("python", "print(1)"), null);
  assert.equal(buildPreviewDocument("html", "<h1>hi</h1>"), "<h1>hi</h1>");
  assert.ok(buildPreviewDocument("css", "body{}")?.includes("<style>body{}"));
  assert.ok(buildPreviewDocument("js", "1+1")?.includes("<script>"));
});
