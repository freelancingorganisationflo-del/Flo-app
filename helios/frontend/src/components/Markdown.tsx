import { RichText } from "@/components/rich/RichText";

export function Markdown({ text, showSources = true }: { text: string; showSources?: boolean }) {
  return <RichText text={text} showSources={showSources} />;
}
