import type { ReactNode } from "react";
import { parseInline, type InlineNode } from "@/lib/rich/parse";

function renderNodes(nodes: InlineNode[], keyBase: string): ReactNode[] {
  return nodes.map((node, index) => {
    const key = `${keyBase}-${index}`;
    switch (node.type) {
      case "text":
        return node.text;
      case "strong":
        return (
          <strong key={key} className="font-semibold text-ink">
            {renderNodes(node.children, key)}
          </strong>
        );
      case "em":
        return (
          <em key={key} className="italic">
            {renderNodes(node.children, key)}
          </em>
        );
      case "strike":
        return (
          <span key={key} className="line-through opacity-70">
            {renderNodes(node.children, key)}
          </span>
        );
      case "code":
        return (
          <code
            key={key}
            className="px-1.5 py-0.5 rounded-md bg-navy2/90 border border-line text-cyan text-[0.9em] font-code break-words"
          >
            {node.text}
          </code>
        );
      case "link":
        return (
          <a
            key={key}
            href={node.url}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="text-cyan underline decoration-cyan/40 underline-offset-2 hover:text-blue transition-colors break-words"
          >
            {node.text}
          </a>
        );
      case "image":
        if (!node.url) return node.alt;
        return (
          <img
            key={key}
            src={node.url}
            alt={node.alt}
            loading="lazy"
            className="inline-block max-h-40 max-w-full rounded-lg border border-line align-middle"
          />
        );
      default:
        return null;
    }
  });
}

export function Inline({ text }: { text: string }) {
  return <>{renderNodes(parseInline(text), "inline")}</>;
}
