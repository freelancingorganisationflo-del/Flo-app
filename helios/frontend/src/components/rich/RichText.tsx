import { useMemo, useState } from "react";
import { parseRich, type CalloutVariant, type RichBlock } from "@/lib/rich/parse";
import { Icon } from "@/components/Icon";
import { Inline } from "@/components/rich/Inline";
import { Chart } from "@/components/rich/Chart";

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

const CALLOUTS: Record<
  CalloutVariant,
  { icon: string; label: string; box: string; accent: string }
> = {
  tip: { icon: "sparkles", label: "Tip", box: "border-mint/40 bg-mint/10", accent: "text-mint" },
  note: { icon: "info", label: "Note", box: "border-cyan/40 bg-cyan/10", accent: "text-cyan" },
  warning: { icon: "info", label: "Warning", box: "border-amber/40 bg-amber/10", accent: "text-amber" },
  important: {
    icon: "info",
    label: "Important",
    box: "border-violet/40 bg-violet/10",
    accent: "text-violet",
  },
  caution: { icon: "shield", label: "Caution", box: "border-red/40 bg-red/10", accent: "text-red" },
  result: { icon: "check", label: "Result", box: "border-mint/40 bg-mint/10", accent: "text-mint" },
};

const ALIGN_CLASS: Record<string, string> = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
};

function BlockView({ block }: { block: RichBlock }) {
  switch (block.type) {
    case "heading":
      return (
        <h3 className="font-display font-bold text-[15px] text-ink border-l-2 border-cyan/60 pl-2.5 -ml-0.5">
          <Inline text={block.text} />
        </h3>
      );
    case "subheading":
      return (
        <h4 className="font-semibold text-[13.5px] text-ink/90">
          <Inline text={block.text} />
        </h4>
      );
    case "text":
      return (
        <p className="whitespace-pre-wrap break-words">
          <Inline text={block.text} />
        </p>
      );
    case "bullet_list":
      return (
        <ul className="space-y-1">
          {block.items.map((item, index) => (
            <li key={index} className="flex gap-2.5">
              <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-cyan/70" />
              <span className="min-w-0 break-words">
                <Inline text={item} />
              </span>
            </li>
          ))}
        </ul>
      );
    case "numbered_list":
      return (
        <ol className="space-y-1">
          {block.items.map((item, index) => (
            <li key={index} className="flex gap-2.5">
              <span className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-cyan/15 text-[11px] font-semibold text-cyan">
                {index + 1}
              </span>
              <span className="min-w-0 break-words pt-px">
                <Inline text={item} />
              </span>
            </li>
          ))}
        </ol>
      );
    case "checklist":
      return (
        <ul className="space-y-1">
          {block.items.map((item, index) => (
            <li key={index} className="flex gap-2.5">
              <span
                className={`mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                  item.checked ? "border-mint bg-mint/20 text-mint" : "border-line text-transparent"
                }`}
              >
                <Icon name="check" className="h-3 w-3" />
              </span>
              <span
                className={`min-w-0 break-words ${item.checked ? "text-grey line-through" : ""}`}
              >
                <Inline text={item.text} />
              </span>
            </li>
          ))}
        </ul>
      );
    case "table":
      return (
        <div className="my-2 -mx-1 overflow-x-auto scrollbar-slim rounded-xl border border-line">
          <table className="w-full min-w-[420px] border-collapse text-[12.5px]">
            <thead>
              <tr className="bg-white/[0.04]">
                {block.columns.map((column, index) => (
                  <th
                    key={index}
                    className={`px-3 py-2 font-semibold text-ink border-b border-line whitespace-nowrap ${
                      ALIGN_CLASS[block.align[index] ?? "left"]
                    }`}
                  >
                    <Inline text={column} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60">
              {block.rows.map((row, rowIndex) => (
                <tr key={rowIndex} className="hover:bg-white/[0.02] transition-colors">
                  {block.columns.map((_, cellIndex) => (
                    <td
                      key={cellIndex}
                      className={`px-3 py-2 align-top text-ink/90 break-words ${
                        ALIGN_CLASS[block.align[cellIndex] ?? "left"]
                      }`}
                    >
                      <Inline text={row[cellIndex] ?? ""} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "code":
      if (block.lang === "chart" || block.lang === "response") {
        return (
          <div className="my-2 flex items-center gap-2 rounded-xl border border-line bg-navy2/60 px-3 py-2.5 text-[12px] text-faint">
            <Icon name="analytics" className="h-4 w-4 text-cyan" />
            {block.lang === "chart" ? "Preparing chart…" : "Preparing formatted response…"}
          </div>
        );
      }
      return <CodeBlock lang={block.lang} code={block.code} />;
    case "quote":
      return (
        <blockquote className="border-l-2 border-violet/60 pl-3 text-grey italic">
          <Inline text={block.text} />
        </blockquote>
      );
    case "callout": {
      const config = CALLOUTS[block.variant] ?? CALLOUTS.note;
      return (
        <div className={`my-2 rounded-xl border px-3 py-2.5 ${config.box}`}>
          <p className={`mb-1 flex items-center gap-1.5 text-[11px] font-semibold ${config.accent}`}>
            <Icon name={config.icon} className="h-3.5 w-3.5" />
            {block.title ?? config.label}
          </p>
          <p className="text-[12.5px] text-ink/90 whitespace-pre-wrap break-words">
            <Inline text={block.text} />
          </p>
        </div>
      );
    }
    case "image":
      return (
        <img
          src={block.url}
          alt={block.alt}
          loading="lazy"
          className="my-2 max-h-72 w-auto max-w-full rounded-xl border border-line"
        />
      );
    case "link":
      return (
        <a
          href={block.url}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="flex items-center gap-1.5 text-cyan hover:text-blue transition-colors break-words"
        >
          <Icon name="link" className="h-3.5 w-3.5 shrink-0" />
          {block.text}
        </a>
      );
    case "source_list":
      return (
        <div className="my-2 space-y-1.5">
          {block.items.map((source, index) => {
            let domain = source.url;
            try {
              domain = new URL(source.url).hostname.replace(/^www\./, "");
            } catch {
              // keep raw url as label
            }
            return (
              <a
                key={`${source.url}-${index}`}
                href={source.url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="group flex items-start gap-2.5 rounded-xl border border-line bg-white/[0.02] px-3 py-2 hover:border-cyan/40 transition-colors"
              >
                <span className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-cyan/15 text-[11px] font-semibold text-cyan">
                  {index + 1}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[12.5px] font-medium text-ink group-hover:text-cyan transition-colors">
                    {source.title}
                  </span>
                  <span className="block truncate text-[11px] text-faint">{domain}</span>
                </span>
              </a>
            );
          })}
        </div>
      );
    case "chart":
      return <Chart spec={block.spec} />;
    case "divider":
      return <hr className="my-3 border-line/70" />;
    default:
      return null;
  }
}

export function RichText({
  text,
  showSources = true,
}: {
  text: string;
  showSources?: boolean;
}) {
  const blocks = useMemo(() => parseRich(text), [text]);
  const visible = useMemo(
    () => (showSources ? blocks : blocks.filter((block) => block.type !== "source_list")),
    [blocks, showSources]
  );

  return (
    <div className="space-y-2.5 text-sm leading-relaxed text-ink/90 break-words">
      {visible.map((block, index) => (
        <BlockView key={index} block={block} />
      ))}
    </div>
  );
}
