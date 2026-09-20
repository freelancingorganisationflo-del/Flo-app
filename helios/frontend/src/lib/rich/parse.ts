// Rich Response Engine — pure parsing layer.
//
// Turns an assistant reply (Markdown, plus optional ```chart / ```response
// extensions) into an internal structured block tree. No React or DOM here so
// the whole parser can be unit-tested with `node --test`.
//
// The renderer (components/rich/*) consumes `RichBlock[]`. Everything is
// tolerant of incomplete input because replies arrive token-by-token while
// streaming, and anything malformed must degrade to safe text instead of
// throwing.

export type Align = "left" | "center" | "right";

export type CalloutVariant =
  | "tip"
  | "note"
  | "warning"
  | "important"
  | "caution"
  | "result";

export interface ChartDataset {
  label?: string;
  values: number[];
  color?: string;
}

export interface ChartSpec {
  type: "bar" | "line" | "pie" | "scatter";
  title?: string;
  labels?: string[];
  datasets: ChartDataset[];
  xLabel?: string;
  yLabel?: string;
  unit?: string;
}

export interface SourceItem {
  title: string;
  url: string;
}

export type RichBlock =
  | { type: "heading"; text: string }
  | { type: "subheading"; text: string }
  | { type: "text"; text: string }
  | { type: "bullet_list"; items: string[] }
  | { type: "numbered_list"; items: string[] }
  | { type: "checklist"; items: { text: string; checked: boolean }[] }
  | { type: "table"; columns: string[]; rows: string[][]; align: Align[]; caption?: string }
  | { type: "code"; lang: string; code: string }
  | { type: "quote"; text: string }
  | { type: "callout"; variant: CalloutVariant; title?: string; text: string }
  | { type: "image"; url: string; alt: string }
  | { type: "link"; text: string; url: string }
  | { type: "source_list"; items: SourceItem[] }
  | { type: "chart"; spec: ChartSpec }
  | { type: "divider" };

// ---------------------------------------------------------------------------
// Inline parsing
// ---------------------------------------------------------------------------

export type InlineNode =
  | { type: "text"; text: string }
  | { type: "strong"; children: InlineNode[] }
  | { type: "em"; children: InlineNode[] }
  | { type: "strike"; children: InlineNode[] }
  | { type: "code"; text: string }
  | { type: "link"; text: string; url: string }
  | { type: "image"; alt: string; url: string };

// Order matters: images before links, code first, bold before italic.
// Link/image targets allow one level of balanced parentheses so URLs such as
// `https://en.wikipedia.org/wiki/Foo_(bar)` survive intact.
const INLINE_PATTERN =
  /(`[^`]+`|!\[[^\]]*\]\((?:[^()\s]|\([^()\s]*\))*\)|\[[^\]]+\]\((?:[^()\s]|\([^()\s]*\))*\)|\*\*[^*]+\*\*|__[^_]+__|~~[^~]+~~|\*[^*\n]+\*|_[^_\n]+_)/g;

// parseInline recurses (for nested strong/em/strike), so every call needs its
// own RegExp instance — a shared `lastIndex` would be clobbered by nested
// calls and make the outer loop re-scan forever.
function inlineRegex(): RegExp {
  return new RegExp(INLINE_PATTERN.source, INLINE_PATTERN.flags);
}

export function safeHref(url: string): string | null {
  const value = (url || "").trim();
  if (!value) return null;
  if (/^(https?:|mailto:)/i.test(value)) return value;
  if (/^\/[^/]/.test(value)) return value;
  return null;
}

const IMAGE_DATA = /^data:image\/(png|jpe?g|gif|webp|bmp);base64,[a-z0-9+/=\s]+$/i;

export function safeImageSrc(url: string): string | null {
  const value = (url || "").trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  if (IMAGE_DATA.test(value)) return value;
  return null;
}

export function parseInline(text: string): InlineNode[] {
  const source = text ?? "";
  const nodes: InlineNode[] = [];
  const regex = inlineRegex();
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(source)) !== null) {
    if (match.index > last) {
      nodes.push({ type: "text", text: source.slice(last, match.index) });
    }
    const token = match[0];
    nodes.push(parseInlineToken(token));
    last = match.index + token.length;
    if (match.index === regex.lastIndex) regex.lastIndex++;
  }
  if (last < source.length) {
    nodes.push({ type: "text", text: source.slice(last) });
  }
  return nodes;
}

function parseInlineToken(token: string): InlineNode {
  if (token.startsWith("`") && token.endsWith("`") && token.length > 2) {
    return { type: "code", text: token.slice(1, -1) };
  }
  if (token.startsWith("![")) {
    const link = /^!\[([^\]]*)\]\(((?:[^()\s]|\([^()\s]*\))*)\)$/.exec(token);
    if (link) {
      return { type: "image", alt: link[1], url: safeImageSrc(link[2]) ?? "" };
    }
    return { type: "text", text: token };
  }
  if (token.startsWith("[")) {
    const link = /^\[([^\]]+)\]\(((?:[^()\s]|\([^()\s]*\))*)\)$/.exec(token);
    if (link) {
      const href = safeHref(link[2]);
      return href
        ? { type: "link", text: link[1], url: href }
        : { type: "text", text: link[1] };
    }
    return { type: "text", text: token };
  }
  if ((token.startsWith("**") && token.endsWith("**")) || (token.startsWith("__") && token.endsWith("__"))) {
    return { type: "strong", children: parseInline(token.slice(2, -2)) };
  }
  if (token.startsWith("~~") && token.endsWith("~~")) {
    return { type: "strike", children: parseInline(token.slice(2, -2)) };
  }
  if (token.length > 2) {
    return { type: "em", children: parseInline(token.slice(1, -1)) };
  }
  return { type: "text", text: token };
}

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

function splitRow(line: string): string[] {
  let row = line.trim();
  if (row.startsWith("|")) row = row.slice(1);
  if (row.endsWith("|")) row = row.slice(0, -1);
  const cells: string[] = [];
  let current = "";
  for (let i = 0; i < row.length; i++) {
    const ch = row[i];
    if (ch === "\\" && row[i + 1] === "|") {
      current += "|";
      i++;
      continue;
    }
    if (ch === "|") {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  cells.push(current.trim());
  return cells;
}

function isDelimiterRow(line: string): boolean {
  const cells = splitRow(line);
  if (cells.length < 1) return false;
  return cells.every((cell) => /^:?-{1,}:?$/.test(cell.trim()));
}

function parseAlign(line: string): Align[] {
  return splitRow(line).map((cell) => {
    const value = cell.trim();
    const left = value.startsWith(":");
    const right = value.endsWith(":");
    if (left && right) return "center";
    if (right) return "right";
    return "left";
  });
}

function isTableStart(lines: string[], index: number): boolean {
  const header = lines[index];
  const next = lines[index + 1];
  if (!header || !next) return false;
  if (!header.includes("|")) return false;
  return isDelimiterRow(next) && splitRow(header).length >= 1;
}

function parseTable(lines: string[], start: number): { block: RichBlock; next: number } | null {
  const columns = splitRow(lines[start]);
  const align = parseAlign(lines[start + 1]);
  const rows: string[][] = [];
  let i = start + 2;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "" || !line.includes("|") || isDelimiterRow(line)) break;
    const cells = splitRow(line);
    const padded = columns.map((_, index) => cells[index] ?? "");
    rows.push(padded);
    i++;
  }
  if (columns.length === 0) return null;
  const normalizedAlign = columns.map((_, index) => align[index] ?? "left");
  return {
    block: { type: "table", columns, rows, align: normalizedAlign },
    next: i,
  };
}

// ---------------------------------------------------------------------------
// Charts
// ---------------------------------------------------------------------------

const TYPE_ALIASES: Record<string, ChartSpec["type"]> = {
  bar: "bar",
  column: "bar",
  histogram: "bar",
  line: "line",
  area: "line",
  spline: "line",
  pie: "pie",
  doughnut: "pie",
  donut: "pie",
  scatter: "scatter",
  bubble: "scatter",
  point: "scatter",
};

function normalizeType(value: unknown): ChartSpec["type"] | null {
  if (value == null) return "bar";
  return TYPE_ALIASES[String(value).toLowerCase()] ?? null;
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const cleaned = value.replace(/[$,%\s]/g, "");
    if (cleaned === "") return null;
    const parsed = Number(cleaned);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function datasetValues(entry: Record<string, unknown>): number[] {
  const source = entry.values ?? entry.data ?? entry.points ?? entry.y;
  if (!Array.isArray(source)) return [];
  const values: number[] = [];
  for (const item of source) {
    if (item && typeof item === "object") {
      const point = item as Record<string, unknown>;
      const value = toNumber(point.y ?? point.value ?? point.v);
      if (value !== null) values.push(value);
      continue;
    }
    const value = toNumber(item);
    if (value !== null) values.push(value);
  }
  return values;
}

function extractDatasets(node: unknown): ChartDataset[] {
  if (!Array.isArray(node)) return [];
  return node
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const entry = item as Record<string, unknown>;
      const values = datasetValues(entry);
      if (values.length === 0) return null;
      const dataset: ChartDataset = { values };
      if (entry.label != null) dataset.label = String(entry.label);
      const color = entry.color ?? entry.backgroundColor ?? entry.borderColor;
      if (typeof color === "string" && /^#[0-9a-f]{3,8}$/i.test(color)) dataset.color = color;
      return dataset;
    })
    .filter((dataset): dataset is ChartDataset => dataset !== null);
}

function chartTitle(raw: Record<string, unknown>): string | undefined {
  if (typeof raw.title === "string") return raw.title;
  if (isRecord(raw.title) && typeof raw.title.text === "string") return raw.title.text;
  const options = raw.options;
  if (isRecord(options) && isRecord(options.plugins) && isRecord(options.plugins.title)) {
    const text = options.plugins.title.text;
    if (typeof text === "string") return text;
  }
  return undefined;
}

function normalizeChart(input: unknown): ChartSpec | null {
  if (!isRecord(input)) return null;
  const raw = input;

  // Chart.js wraps everything under a `data` object.
  const dataNode = isRecord(raw.data) ? raw.data : null;

  const type = normalizeType(raw.type ?? dataNode?.type);
  if (!type) return null;

  const rawLabels = raw.labels ?? dataNode?.labels;
  const labels = Array.isArray(rawLabels)
    ? rawLabels.map((label) => String(label))
    : undefined;

  let datasets = extractDatasets(raw.datasets ?? dataNode?.datasets ?? raw.series);

  // Also accept a simple array of primitives or [{ label, value }] points.
  const dataArray = Array.isArray(raw.data)
    ? raw.data
    : Array.isArray(raw.values)
      ? raw.values
      : null;
  if (datasets.length === 0 && dataArray) {
    const values: number[] = [];
    const dataLabels: string[] = [];
    for (const item of dataArray) {
      if (isRecord(item)) {
        const value = toNumber(item.value ?? item.y ?? item.count);
        if (value === null) continue;
        values.push(value);
        const label = item.label ?? item.name;
        dataLabels.push(label != null ? String(label) : String(dataLabels.length + 1));
      } else {
        const value = toNumber(item);
        if (value === null) continue;
        values.push(value);
        dataLabels.push(String(dataLabels.length + 1));
      }
    }
    if (values.length > 0) {
      datasets = [{ values }];
      if (!labels) return buildChart(type, raw, dataLabels, datasets);
    }
  }

  if (datasets.length === 0) return null;
  return buildChart(type, raw, labels, datasets);
}

function buildChart(
  type: ChartSpec["type"],
  raw: Record<string, unknown>,
  labels: string[] | undefined,
  datasets: ChartDataset[]
): ChartSpec {
  const spec: ChartSpec = { type, datasets };
  if (labels) spec.labels = labels;
  const title = chartTitle(raw) ?? dataNodeTitle(raw);
  if (title) spec.title = title;
  if (raw.xLabel != null) spec.xLabel = String(raw.xLabel);
  if (raw.yLabel != null) spec.yLabel = String(raw.yLabel);
  if (raw.unit != null) spec.unit = String(raw.unit);
  return spec;
}

function dataNodeTitle(raw: Record<string, unknown>): string | undefined {
  return isRecord(raw.data) ? chartTitle(raw.data) : undefined;
}

export function parseChartSpec(source: string): ChartSpec | null {
  const text = (source || "").trim();
  if (!text) return null;

  try {
    return normalizeChart(JSON.parse(text));
  } catch {
    // fall through to the simple "label value" format
  }

  const labels: string[] = [];
  const values: number[] = [];
  for (const line of text.split("\n")) {
    const match = /^\s*(.+?)\s*[|:,\t]\s*\$?(-?[\d.,]+)\s*%?\s*$/.exec(line);
    if (!match) continue;
    const value = toNumber(match[2]);
    if (value === null) continue;
    labels.push(match[1].trim());
    values.push(value);
  }
  if (values.length === 0) return null;
  return { type: "bar", labels, datasets: [{ values }] };
}

// ---------------------------------------------------------------------------
// Structured ```response blocks
// ---------------------------------------------------------------------------

const KNOWN_BLOCK_TYPES = new Set<RichBlock["type"]>([
  "heading",
  "subheading",
  "text",
  "bullet_list",
  "numbered_list",
  "checklist",
  "table",
  "code",
  "quote",
  "callout",
  "image",
  "link",
  "source_list",
  "chart",
  "divider",
]);

export function parseStructuredBlocks(source: string): RichBlock[] | null {
  let payload: unknown;
  try {
    payload = JSON.parse(source);
  } catch {
    return null;
  }
  if (!payload || typeof payload !== "object") return null;
  const raw = payload as Record<string, unknown>;
  const blocks = Array.isArray(raw.blocks) ? raw.blocks : Array.isArray(payload) ? (payload as unknown[]) : null;
  if (!blocks) return null;

  const parsed: RichBlock[] = [];
  for (const item of blocks) {
    const block = normalizeBlock(item);
    if (block) parsed.push(block);
  }
  return parsed.length > 0 ? parsed : null;
}

function normalizeBlock(item: unknown): RichBlock | null {
  if (!item || typeof item !== "object") return null;
  const raw = item as Record<string, unknown>;
  const type = String(raw.type ?? "");
  if (!KNOWN_BLOCK_TYPES.has(type as RichBlock["type"])) return null;

  const str = (value: unknown, fallback = ""): string =>
    value == null ? fallback : String(value);

  switch (type) {
    case "heading":
      return { type: "heading", text: str(raw.text) };
    case "subheading":
      return { type: "subheading", text: str(raw.text) };
    case "text":
      return { type: "text", text: str(raw.text) };
    case "quote":
      return { type: "quote", text: str(raw.text) };
    case "divider":
      return { type: "divider" };
    case "bullet_list":
    case "numbered_list": {
      const items = (Array.isArray(raw.items) ? raw.items : []).map((value) => str(value));
      return items.length ? { type, items } : null;
    }
    case "checklist": {
      const items = (Array.isArray(raw.items) ? raw.items : [])
        .map((value) => {
          if (value && typeof value === "object") {
            const entry = value as Record<string, unknown>;
            return { text: str(entry.text), checked: Boolean(entry.checked) };
          }
          return { text: str(value), checked: false };
        })
        .filter((entry) => entry.text !== "");
      return items.length ? { type: "checklist", items } : null;
    }
    case "table": {
      const columns = (Array.isArray(raw.columns) ? raw.columns : []).map((value) => str(value));
      const rows = (Array.isArray(raw.rows) ? raw.rows : [])
        .filter((row): row is unknown[] => Array.isArray(row))
        .map((row) => row.map((cell) => str(cell)));
      if (columns.length === 0) return null;
      const align = (Array.isArray(raw.align) ? raw.align : [])
        .map((value) => String(value))
        .map((value): Align => (value === "center" || value === "right" ? value : "left"));
      return {
        type: "table",
        columns,
        rows,
        align: columns.map((_, index) => align[index] ?? "left"),
      };
    }
    case "code":
      return { type: "code", lang: str(raw.lang), code: str(raw.code) };
    case "callout": {
      const variant = String(raw.variant ?? "note").toLowerCase();
      const allowed: CalloutVariant[] = ["tip", "note", "warning", "important", "caution", "result"];
      const safeVariant = (allowed.includes(variant as CalloutVariant) ? variant : "note") as CalloutVariant;
      const block: RichBlock = { type: "callout", variant: safeVariant, text: str(raw.text) };
      if (raw.title != null) block.title = str(raw.title);
      return block;
    }
    case "image": {
      const src = safeImageSrc(str(raw.url));
      return src ? { type: "image", url: src, alt: str(raw.alt) } : null;
    }
    case "link": {
      const href = safeHref(str(raw.url));
      return href ? { type: "link", text: str(raw.text) || href, url: href } : null;
    }
    case "source_list": {
      const items = (Array.isArray(raw.items) ? raw.items : [])
        .map((value) => {
          if (!value || typeof value !== "object") return null;
          const entry = value as Record<string, unknown>;
          const href = safeHref(str(entry.url));
          return href ? { title: str(entry.title) || href, url: href } : null;
        })
        .filter((value): value is SourceItem => value !== null);
      return items.length ? { type: "source_list", items } : null;
    }
    case "chart": {
      const spec = normalizeChart(raw.spec ?? raw.chart ?? raw);
      return spec ? { type: "chart", spec } : null;
    }
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Sources post-processing
// ---------------------------------------------------------------------------

const SOURCES_HEADING = /^(sources?|references?|citations?|sources?\s*(&|and)\s*references?)$/i;
const LINK_RE = /\[([^\]]+)\]\(([^)\s]+)\)/;
const BARE_URL_RE = /(https?:\/\/[^\s)]+)/;

function linkFromText(text: string): SourceItem | null {
  const md = LINK_RE.exec(text);
  if (md) {
    const href = safeHref(md[2]);
    if (href) return { title: md[1].trim() || href, url: href };
  }
  const bare = BARE_URL_RE.exec(text);
  if (bare) {
    const href = safeHref(bare[1]);
    if (href) {
      const title = text.replace(bare[1], "").replace(/[()[\]-]+/g, " ").replace(/\s+/g, " ").trim();
      return { title: title || href, url: href };
    }
  }
  return null;
}

function collectSources(blocks: RichBlock[]): RichBlock[] {
  const result: RichBlock[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (block.type === "heading" && SOURCES_HEADING.test(block.text.trim())) {
      const next = blocks[i + 1];
      if (next && (next.type === "numbered_list" || next.type === "bullet_list")) {
        const items = next.items
          .map((item) => linkFromText(item))
          .filter((value): value is SourceItem => value !== null);
        if (items.length > 0) {
          result.push({ type: "source_list", items });
          i++;
          continue;
        }
      }
    }
    result.push(block);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Main parser
// ---------------------------------------------------------------------------

const GH_ALERT = /^\[!(TIP|NOTE|WARNING|IMPORTANT|CAUTION|RESULT|DANGER|INFO|SUCCESS)\]\s*(.*)$/i;
const CALLOUT_VARIANTS: Record<string, CalloutVariant> = {
  tip: "tip",
  note: "note",
  warning: "warning",
  important: "important",
  caution: "caution",
  result: "result",
  danger: "caution",
  info: "note",
  success: "result",
};

const CHECKLIST_RE = /^\s*[-*+]\s+\[([ xX])\]\s+(.*)$/;
const BULLET_RE = /^\s*[-*+]\s+(.*)$/;
const NUMBERED_RE = /^\s*\d+[.)]\s+(.*)$/;
const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const DIVIDER_RE = /^\s*([-*_])(?:\s*\1){2,}\s*$/;

function startsBlock(lines: string[], index: number): boolean {
  const line = lines[index];
  if (line.trim() === "") return true;
  if (/^\s*(```|~~~)/.test(line)) return true;
  if (HEADING_RE.test(line)) return true;
  if (DIVIDER_RE.test(line) && !line.includes("|")) return true;
  if (/^\s*>/.test(line)) return true;
  if (CHECKLIST_RE.test(line) || BULLET_RE.test(line) || NUMBERED_RE.test(line)) return true;
  if (isTableStart(lines, index)) return true;
  return false;
}

function collectList(
  lines: string[],
  start: number,
  matches: (line: string) => RegExpExecArray | null
): { items: string[]; next: number } {
  const items: string[] = [];
  let i = start;
  let current = "";
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "") break;
    const match = matches(line);
    if (match) {
      if (current) items.push(current);
      current = match[1];
      i++;
      continue;
    }
    if (/^\s{2,}\S/.test(line) && !startsBlock(lines, i)) {
      current += " " + line.trim();
      i++;
      continue;
    }
    break;
  }
  if (current) items.push(current);
  return { items, next: i };
}

export function parseRich(markdown: string): RichBlock[] {
  try {
    return parseRichUnsafe(markdown ?? "");
  } catch {
    return [];
  }
}

function parseRichUnsafe(markdown: string): RichBlock[] {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const blocks: RichBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    const fence = /^\s*(```|~~~)\s*([\w+-]*)\s*$/.exec(line);
    if (fence) {
      const marker = fence[1];
      const lang = (fence[2] || "").toLowerCase();
      const codeLines: string[] = [];
      i++;
      const closing = new RegExp("^\\s*" + marker + "\\s*$");
      while (i < lines.length && !closing.test(lines[i])) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // consume closing fence (or EOF)
      const code = codeLines.join("\n");
      if (lang === "chart") {
        const spec = parseChartSpec(code);
        blocks.push(spec ? { type: "chart", spec } : { type: "code", lang, code });
        continue;
      }
      if (lang === "response") {
        const structured = parseStructuredBlocks(code);
        if (structured) {
          blocks.push(...structured);
          continue;
        }
        blocks.push({ type: "code", lang, code });
        continue;
      }
      blocks.push({ type: "code", lang, code });
      continue;
    }

    if (line.trim() === "") {
      i++;
      continue;
    }

    const heading = HEADING_RE.exec(line);
    if (heading) {
      const text = heading[2].trim();
      const level = heading[1].length;
      blocks.push(level <= 2 ? { type: "heading", text } : { type: "subheading", text });
      i++;
      continue;
    }

    if (DIVIDER_RE.test(line) && !line.includes("|")) {
      blocks.push({ type: "divider" });
      i++;
      continue;
    }

    if (isTableStart(lines, i)) {
      const table = parseTable(lines, i);
      if (table) {
        blocks.push(table.block);
        i = table.next;
        continue;
      }
    }

    if (/^\s*>/.test(line)) {
      const quoteLines: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) {
        quoteLines.push(lines[i].replace(/^\s*>\s?/, ""));
        i++;
      }
      const first = quoteLines[0] ?? "";
      const alert = GH_ALERT.exec(first);
      if (alert) {
        const variant = CALLOUT_VARIANTS[alert[1].toLowerCase()] ?? "note";
        const rest = [alert[2], ...quoteLines.slice(1)].join("\n").trim();
        blocks.push({ type: "callout", variant, text: rest });
      } else {
        blocks.push({ type: "quote", text: quoteLines.join("\n").trim() });
      }
      continue;
    }

    if (CHECKLIST_RE.test(line)) {
      const items: { text: string; checked: boolean }[] = [];
      while (i < lines.length) {
        const match = CHECKLIST_RE.exec(lines[i]);
        if (!match) break;
        items.push({ text: match[2], checked: match[1].toLowerCase() === "x" });
        i++;
      }
      blocks.push({ type: "checklist", items });
      continue;
    }

    if (BULLET_RE.test(line) && !CHECKLIST_RE.test(line)) {
      const list = collectList(lines, i, (value) => CHECKLIST_RE.test(value) ? null : BULLET_RE.exec(value));
      blocks.push({ type: "bullet_list", items: list.items });
      i = list.next;
      continue;
    }

    if (NUMBERED_RE.test(line)) {
      const list = collectList(lines, i, (value) => NUMBERED_RE.exec(value));
      blocks.push({ type: "numbered_list", items: list.items });
      i = list.next;
      continue;
    }

    const paragraph: string[] = [line];
    i++;
    while (i < lines.length && !startsBlock(lines, i)) {
      paragraph.push(lines[i]);
      i++;
    }
    blocks.push({ type: "text", text: paragraph.join(" ").trim() });
  }

  return collectSources(blocks);
}
