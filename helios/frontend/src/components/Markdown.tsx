import { useState, type ReactNode } from "react";
import { Icon } from "@/components/Icon";

function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable; ignore
    }
  }

  return (
    <div className="my-2 rounded-xl overflow-hidden border border-line bg-navy2/80">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-line bg-white/[0.03]">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-faint">
          {lang || "code"}
        </span>
        <button
          onClick={copy}
          aria-label="Copy code"
          className="flex items-center gap-1.5 text-[11px] text-grey hover:text-cyan transition-colors"
        >
          <Icon name={copied ? "check" : "copy"} className="w-3.5 h-3.5" />
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="p-3 overflow-x-auto text-[13px] leading-relaxed font-code text-cyan/90">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function renderInline(text: string, keyBase: string): ReactNode[] {
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  const parts = text.split(re);
  return parts.map((part, i) => {
    const key = `${keyBase}-${i}`;
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <strong key={key} className="font-semibold text-ink">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return (
        <code
          key={key}
          className="px-1.5 py-0.5 rounded-md bg-navy2/90 border border-line text-cyan text-[0.9em] font-code"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
    if (link) {
      const href = link[2].startsWith("http") ? link[2] : `https://${link[2]}`;
      return (
        <a
          key={key}
          href={href}
          target="_blank"
          rel="noreferrer"
          className="text-cyan underline decoration-cyan/40 underline-offset-2 hover:text-blue transition-colors"
        >
          {link[1]}
        </a>
      );
    }
    return part;
  });
}

export function Markdown({ text }: { text: string }) {
  const lines = text.split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const codeMatch = /^```(\w*)\s*$/.exec(lines[i]);
    if (codeMatch) {
      const lang = codeMatch[1];
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        codeLines.push(lines[i]);
        i++;
      }
      i++;
      blocks.push(<CodeBlock key={key++} lang={lang} code={codeLines.join("\n")} />);
      continue;
    }
    if (lines[i].trim() === "") {
      i++;
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() !== "" && !/^```/.test(lines[i])) {
      para.push(lines[i]);
      i++;
    }
    blocks.push(
      <p key={key++} className="whitespace-pre-wrap break-words">
        {renderInline(para.join(" "), String(key))}
      </p>
    );
  }

  return <div className="space-y-2.5 text-sm leading-relaxed text-ink/90">{blocks}</div>;
}
