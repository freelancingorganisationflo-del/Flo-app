// Tiny dependency-free syntax highlighter.
//
// It scans source text once and returns typed tokens. The renderer maps token
// types to colours, so no HTML is injected and there is nothing unsafe to
// sanitize. It is intentionally approximate: it highlights the common shapes
// (comments, strings, numbers, keywords, functions, HTML tags) well enough for
// reading code, without pulling in a heavy highlight.js/prism dependency.

export type TokenType =
  | "plain"
  | "comment"
  | "string"
  | "number"
  | "keyword"
  | "function"
  | "tag"
  | "attr"
  | "punct";

export interface Token {
  text: string;
  type: TokenType;
}

interface LangSpec {
  line: string[];
  block: [string, string][];
  keywords: Set<string>;
  html?: boolean;
  propOnColon?: boolean;
}

const JS_KEYWORDS = `const let var function return if else for while do switch case break continue new
class extends super this import export from default async await try catch finally throw typeof
instanceof in of delete void yield static get set null undefined true false interface type enum
implements public private protected readonly declare namespace abstract satisfies keyof infer
never unknown any string number boolean object symbol bigint`.split(/\s+/);
const PY_KEYWORDS = `def class return if elif else for while import from as try except finally raise
with lambda pass break continue global nonlocal yield assert del in is not and or None True False
async await match case print self`.split(/\s+/);
const SH_KEYWORDS = `if then else elif fi for do done while case esac function in return exit export
local echo cd source alias sudo set readonly unset shift trap`.split(/\s+/);
const SQL_KEYWORDS = `select from where insert into values update set delete create table drop alter
add join inner left right outer on group by order having limit offset distinct as and or not null is
in like between union all count sum avg min max primary key foreign references index view database
begin commit rollback`.split(/\s+/);
const GO_KEYWORDS = `package import func var const type struct interface map chan go defer return
if else for range switch case break continue select default nil true false make new len cap append
copy delete panic recover string int int64 float64 bool byte rune error`.split(/\s+/);
const RUST_KEYWORDS = `fn let mut const struct enum impl trait use mod pub return if else match for
while loop in as where self Self crate super true false Some None Ok Err ref move async await dyn
box usize String Vec Option Result`.split(/\s+/);
const JAVA_KEYWORDS = `public private protected class interface extends implements static final void
int long double boolean char String if else for while return new import package this super try catch
finally throw throws abstract synchronized volatile transient native enum`.split(/\s+/);
const C_KEYWORDS = `include define int long char float double void if else for while return struct
typedef enum union static const unsigned signed sizeof switch case break continue class public
private protected template namespace using new delete try catch bool true false nullptr`.split(/\s+/);
const RUBY_KEYWORDS = `def end if elsif else unless while until for do then begin rescue ensure return
class module yield self nil true false and or not require attr_accessor puts`.split(/\s+/);
const PHP_KEYWORDS = `function return if else elseif foreach for while do switch case break continue
class extends implements public private protected static new echo print require include namespace use
try catch finally throw as null true false`.split(/\s+/);
const YAML_KEYWORDS = `true false null yes no on off`.split(/\s+/);

function makeSpec(keywords: string[], extra: Partial<LangSpec> = {}): LangSpec {
  return {
    line: extra.line ?? ["//"],
    block: extra.block ?? [["/*", "*/"]],
    keywords: new Set(keywords),
    html: extra.html,
    propOnColon: extra.propOnColon,
  };
}

const SPECS: Record<string, LangSpec> = {
  js: makeSpec(JS_KEYWORDS),
  py: makeSpec(PY_KEYWORDS, { line: ["#"], block: [] }),
  sh: makeSpec(SH_KEYWORDS, { line: ["#"], block: [] }),
  sql: makeSpec(SQL_KEYWORDS, { line: ["--"], block: [] }),
  go: makeSpec(GO_KEYWORDS),
  rust: makeSpec(RUST_KEYWORDS),
  java: makeSpec(JAVA_KEYWORDS),
  c: makeSpec(C_KEYWORDS, { line: ["//"], block: [["/*", "*/"]] }),
  ruby: makeSpec(RUBY_KEYWORDS, { line: ["#"], block: [] }),
  php: makeSpec(PHP_KEYWORDS, { line: ["//", "#"], block: [["/*", "*/"]] }),
  yaml: makeSpec(YAML_KEYWORDS, { line: ["#"], block: [], propOnColon: true }),
  css: makeSpec([], { line: [], block: [["/*", "*/"]], propOnColon: true }),
  json: makeSpec([], { line: ["//"], block: [] }),
  html: makeSpec([], {
    line: [],
    block: [["<!--", "-->"]],
    html: true,
  }),
};

const ALIASES: Record<string, string> = {
  javascript: "js",
  jsx: "js",
  mjs: "js",
  cjs: "js",
  node: "js",
  typescript: "js",
  ts: "js",
  tsx: "js",
  python: "py",
  python3: "py",
  py: "py",
  bash: "sh",
  shell: "sh",
  zsh: "sh",
  console: "sh",
  postgres: "sql",
  postgresql: "sql",
  mysql: "sql",
  sqlite: "sql",
  golang: "go",
  rs: "rust",
  "c++": "c",
  cpp: "c",
  cc: "c",
  h: "c",
  hpp: "c",
  rb: "ruby",
  yml: "yaml",
  scss: "css",
  less: "css",
  vue: "html",
  xml: "html",
  svg: "html",
  htm: "html",
};

function specFor(lang: string): LangSpec | null {
  const key = (lang || "").trim().toLowerCase().replace(/^\./, "");
  const mapped = ALIASES[key] ?? key;
  return SPECS[mapped] ?? null;
}

const IDENT_START = /[A-Za-z_$]/;
const IDENT_PART = /[\w$]/;
const DIGIT = /[0-9]/;

function mergeTokens(tokens: Token[]): Token[] {
  const out: Token[] = [];
  for (const token of tokens) {
    if (!token.text) continue;
    const last = out[out.length - 1];
    if (last && last.type === token.type) last.text += token.text;
    else out.push({ ...token });
  }
  return out;
}

function scanHtmlTag(code: string, start: number): [Token[], number] {
  // Find the closing '>' while respecting quoted attribute values.
  let i = start + 1;
  let quote = "";
  while (i < code.length) {
    const ch = code[i];
    if (quote) {
      if (ch === quote) quote = "";
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === ">") {
      i += 1;
      break;
    }
    i += 1;
  }
  const end = i;
  const tokens: Token[] = [];
  let p = start;

  // Leading "<", "</", "<!" or "<?".
  while (p < end && ["<", "/", "!", "?"].includes(code[p])) {
    tokens.push({ text: code[p], type: "punct" });
    p += 1;
  }

  let first = true;
  while (p < end) {
    const ch = code[p];
    if (/\s/.test(ch)) {
      let j = p + 1;
      while (j < end && /\s/.test(code[j])) j += 1;
      tokens.push({ text: code.slice(p, j), type: "plain" });
      p = j;
      continue;
    }
    if (ch === '"' || ch === "'") {
      let j = p + 1;
      while (j < end) {
        if (code[j] === "\\") {
          j += 2;
          continue;
        }
        if (code[j] === ch) {
          j += 1;
          break;
        }
        j += 1;
      }
      tokens.push({ text: code.slice(p, j), type: "string" });
      p = j;
      continue;
    }
    if (IDENT_START.test(ch)) {
      let j = p + 1;
      while (j < end && IDENT_PART.test(code[j])) j += 1;
      tokens.push({ text: code.slice(p, j), type: first ? "tag" : "attr" });
      first = false;
      p = j;
      continue;
    }
    tokens.push({ text: ch, type: "punct" });
    p += 1;
  }
  return [tokens, end];
}

export function tokenize(code: string, lang: string): Token[] {
  const spec = specFor(lang);
  const tokens: Token[] = [];
  const push = (text: string, type: TokenType) => {
    if (text) tokens.push({ text, type });
  };

  let i = 0;
  while (i < code.length) {
    // Block comments (including HTML comments).
    let matchedBlock = false;
    if (spec) {
      for (const [open, close] of spec.block) {
        if (open && code.startsWith(open, i)) {
          const end = code.indexOf(close, i + open.length);
          const stop = end === -1 ? code.length : end + close.length;
          push(code.slice(i, stop), "comment");
          i = stop;
          matchedBlock = true;
          break;
        }
      }
    }
    if (matchedBlock) continue;

    // HTML/XML tags.
    if (spec?.html && code[i] === "<") {
      const [tagTokens, next] = scanHtmlTag(code, i);
      tokens.push(...tagTokens);
      i = next;
      continue;
    }

    // Whitespace.
    if (/\s/.test(code[i])) {
      let j = i + 1;
      while (j < code.length && /\s/.test(code[j])) j += 1;
      push(code.slice(i, j), "plain");
      i = j;
      continue;
    }

    // Line comments.
    let matchedLine = false;
    if (spec) {
      for (const prefix of spec.line) {
        if (prefix && code.startsWith(prefix, i)) {
          let j = i;
          while (j < code.length && code[j] !== "\n") j += 1;
          push(code.slice(i, j), "comment");
          i = j;
          matchedLine = true;
          break;
        }
      }
    }
    if (matchedLine) continue;

    // Strings.
    const ch = code[i];
    if (ch === '"' || ch === "'" || ch === "`") {
      let j = i + 1;
      while (j < code.length) {
        if (code[j] === "\\") {
          j += 2;
          continue;
        }
        if (code[j] === ch) {
          j += 1;
          break;
        }
        if (code[j] === "\n" && ch !== "`") break;
        j += 1;
      }
      push(code.slice(i, j), "string");
      i = j;
      continue;
    }

    // Numbers.
    if (DIGIT.test(ch)) {
      let j = i + 1;
      while (j < code.length && /[\w.]/.test(code[j])) j += 1;
      push(code.slice(i, j), "number");
      i = j;
      continue;
    }

    // Identifiers, keywords and function calls.
    if (IDENT_START.test(ch)) {
      let j = i + 1;
      while (j < code.length && IDENT_PART.test(code[j])) j += 1;
      const word = code.slice(i, j);
      let type: TokenType = "plain";
      if (spec?.keywords.has(word)) {
        type = "keyword";
      } else {
        let k = j;
        while (k < code.length && /[ \t]/.test(code[k])) k += 1;
        if (code[k] === "(") type = "function";
        else if (spec?.propOnColon && code[k] === ":") type = "attr";
        else {
          let p = i - 1;
          while (p >= 0 && /[ \t]/.test(code[p])) p -= 1;
          if (p >= 0 && code[p] === ".") type = "attr";
        }
      }
      push(word, type);
      i = j;
      continue;
    }

    // Punctuation and everything else.
    push(ch, "punct");
    i += 1;
  }

  return mergeTokens(tokens);
}

// Detects a language whose code can be previewed in a sandboxed iframe.
export function previewKind(lang: string): "html" | "css" | "js" | null {  const key = (lang || "").trim().toLowerCase().replace(/^\./, "");
  if (["html", "htm", "xml", "svg", "vue"].includes(key)) return "html";
  if (["css", "scss", "less"].includes(key)) return "css";
  if (["js", "javascript", "jsx", "mjs", "cjs", "ts", "typescript", "tsx"].includes(key)) return "js";
  return null;
}

const EXT_BY_LANG: Record<string, string> = {
  python: "py",
  py: "py",
  javascript: "js",
  js: "js",
  jsx: "jsx",
  typescript: "ts",
  ts: "ts",
  tsx: "tsx",
  html: "html",
  htm: "html",
  css: "css",
  scss: "scss",
  json: "json",
  yaml: "yml",
  yml: "yml",
  sql: "sql",
  bash: "sh",
  sh: "sh",
  shell: "sh",
  go: "go",
  rust: "rs",
  rs: "rs",
  java: "java",
  c: "c",
  cpp: "cpp",
  "c++": "cpp",
  ruby: "rb",
  rb: "rb",
  php: "php",
  markdown: "md",
  md: "md",
};

export function extForLang(lang: string): string {
  const key = (lang || "").trim().toLowerCase().replace(/^\./, "");
  return EXT_BY_LANG[key] ?? "txt";
}

export function buildPreviewDocument(lang: string, code: string): string | null {
  const kind = previewKind(lang);
  if (!kind) return null;
  if (kind === "html") return code;
  if (kind === "css") {
    return `<!doctype html><html><head><meta charset="utf-8"><style>${code}</style></head><body><p>Preview</p><button>Button</button><div class="box">Box</div></body></html>`;
  }
  return `<!doctype html><html><head><meta charset="utf-8"></head><body><div id="app"></div><pre id="out" style="font:13px monospace"></pre><script>
try { const r = ${code}; if (r !== undefined) document.getElementById("out").textContent = String(r); }
catch (e) { document.getElementById("out").textContent = "Error: " + e.message; }
</script></body></html>`;
}
