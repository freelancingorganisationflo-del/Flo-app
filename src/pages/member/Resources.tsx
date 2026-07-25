import { useResources } from "@/hooks/useResources";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageSpinner } from "@/components/ui/Spinner";
import type { ResourceCategory } from "@/lib/types/database.types";

const categoryLabels: Record<ResourceCategory, string> = {
  ai_tools: "AI Tools",
  templates: "Templates",
  fonts: "Fonts",
  icons: "Icons",
  prompt_library: "Prompt Library",
  websites: "Useful Websites",
};

export function Resources() {
  const { data: resources = [], isLoading } = useResources();

  if (isLoading) return <PageSpinner />;

  const byCategory = (Object.keys(categoryLabels) as ResourceCategory[]).map((cat) => ({
    cat,
    items: resources.filter((r) => r.category === cat),
  }));

  return (
    <div>
      <SectionHeader title="Resources" sub="Tools, templates, and references curated by the team." />

      {resources.length === 0 ? (
        <EmptyState icon="🧰" title="No resources yet" />
      ) : (
        <div className="space-y-6">
          {byCategory.map(({ cat, items }) =>
            items.length === 0 ? null : (
              <div key={cat}>
                <div className="mb-3 text-[12px] font-bold uppercase tracking-wide text-grey">{categoryLabels[cat]}</div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {items.map((r) => (
                    <Card key={r.id}>
                      <div className="text-[13px] font-bold text-navy">{r.title}</div>
                      {r.description && <div className="mt-1 text-[12px] text-grey">{r.description}</div>}
                      {r.url && (
                        <a href={r.url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-[12px] font-semibold text-teal underline">
                          Open ↗
                        </a>
                      )}
                    </Card>
                  ))}
                </div>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}
