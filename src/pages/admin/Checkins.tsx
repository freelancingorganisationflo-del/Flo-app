import { useState } from "react";
import { useAllCheckins, useReviewCheckin } from "@/hooks/useCheckins";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/FormField";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageSpinner } from "@/components/ui/Spinner";

export function AdminCheckins() {
  const { data: checkins = [], isLoading } = useAllCheckins();
  const review = useReviewCheckin();
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  if (isLoading) return <PageSpinner />;

  return (
    <div>
      <SectionHeader title="Weekly Check-ins" sub="What the team learned, completed, and got stuck on." />

      {checkins.length === 0 ? (
        <EmptyState icon="📝" title="No check-ins yet" />
      ) : (
        <div className="space-y-3">
          {checkins.map((c: any) => (
            <Card key={c.id}>
              <div className="mb-2 flex items-center justify-between">
                <div className="text-[14px] font-bold text-navy">{c.profiles?.full_name}</div>
                <div className="text-[11px] text-grey">Week {c.week_number}</div>
              </div>
              <div className="space-y-1 text-[13px] text-grey">
                <div><span className="font-semibold text-navy">Learned: </span>{c.what_learned}</div>
                <div><span className="font-semibold text-navy">Completed: </span>{c.what_completed}</div>
                {c.problems_faced && <div><span className="font-semibold text-navy">Problems: </span>{c.problems_faced}</div>}
              </div>
              <div className="mt-3 flex gap-2">
                <Textarea
                  rows={1}
                  placeholder="Reply with feedback…"
                  value={drafts[c.id] ?? c.admin_feedback ?? ""}
                  onChange={(e) => setDrafts((d) => ({ ...d, [c.id]: e.target.value }))}
                />
                <Button onClick={() => review.mutate({ id: c.id, admin_feedback: drafts[c.id] ?? "" })} disabled={review.isPending}>
                  Send
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
