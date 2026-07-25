import { useState } from "react";
import { useCreateResource, useDeleteResource, useResources } from "@/hooks/useResources";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label, Textarea } from "@/components/ui/FormField";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageSpinner } from "@/components/ui/Spinner";
import type { ResourceCategory } from "@/lib/types/database.types";

const categories: { id: ResourceCategory; label: string }[] = [
  { id: "ai_tools", label: "AI Tools" },
  { id: "templates", label: "Templates" },
  { id: "fonts", label: "Fonts" },
  { id: "icons", label: "Icons" },
  { id: "prompt_library", label: "Prompt Library" },
  { id: "websites", label: "Useful Websites" },
];

export function AdminResources() {
  const { data: resources = [], isLoading } = useResources();
  const create = useCreateResource();
  const del = useDeleteResource();

  const [category, setCategory] = useState<ResourceCategory>("ai_tools");
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");

  async function handleAdd() {
    if (!title.trim()) return;
    await create.mutateAsync({ category, title, url, description });
    setTitle("");
    setUrl("");
    setDescription("");
  }

  return (
    <div>
      <SectionHeader title="Resources" sub="Manage the shared tool and template library." />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[340px_1fr]">
        <Card>
          <div className="mb-3 text-[12px] font-bold uppercase tracking-wide text-teal">Add resource</div>
          <div className="space-y-3">
            <div>
              <Label>Category</Label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as ResourceCategory)}
                className="w-full rounded-[10px] border border-border bg-white px-3.5 py-2.5 text-sm text-navy"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <Label>Title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div>
              <Label>URL</Label>
              <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <Button onClick={() => void handleAdd()} disabled={!title.trim() || create.isPending} className="w-full">
              {create.isPending ? "Adding…" : "Add resource"}
            </Button>
          </div>
        </Card>

        <div>
          {isLoading ? (
            <PageSpinner />
          ) : resources.length === 0 ? (
            <EmptyState icon="🧰" title="No resources yet" />
          ) : (
            <div className="space-y-4">
              {categories.map((c) => {
                const items = resources.filter((r) => r.category === c.id);
                if (items.length === 0) return null;
                return (
                  <div key={c.id}>
                    <div className="mb-2 text-[12px] font-bold uppercase tracking-wide text-grey">{c.label}</div>
                    <div className="space-y-2">
                      {items.map((r) => (
                        <Card key={r.id} className="flex items-center justify-between">
                          <div>
                            <div className="text-[13px] font-bold text-navy">{r.title}</div>
                            {r.description && <div className="text-[12px] text-grey">{r.description}</div>}
                          </div>
                          <button onClick={() => del.mutate(r.id)} className="text-[12px] font-semibold text-red">
                            Remove
                          </button>
                        </Card>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
