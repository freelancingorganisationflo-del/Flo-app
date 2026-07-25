import { useState } from "react";
import { useAllSubmissions, useReviewSubmission } from "@/hooks/useSubmissions";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/FormField";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageSpinner } from "@/components/ui/Spinner";
import type { SubmissionStatus } from "@/lib/types/database.types";

const tabs: { id: SubmissionStatus | "all"; label: string }[] = [
  { id: "pending", label: "Pending" },
  { id: "approved", label: "Approved" },
  { id: "needs_improvement", label: "Needs improvement" },
  { id: "rejected", label: "Rejected" },
];

const tone: Record<SubmissionStatus, "orange" | "green" | "red"> = {
  pending: "orange",
  approved: "green",
  needs_improvement: "orange",
  rejected: "red",
};

export function AdminSubmissions() {
  const { profile } = useAuth();
  const [tab, setTab] = useState<SubmissionStatus>("pending");
  const { data: submissions = [], isLoading } = useAllSubmissions(tab);
  const review = useReviewSubmission();
  const [feedbackDraft, setFeedbackDraft] = useState<Record<string, string>>({});

  function handleReview(id: string, status: SubmissionStatus) {
    if (!profile) return;
    review.mutate({ id, status, feedback: feedbackDraft[id] ?? "", reviewed_by: profile.id });
  }

  return (
    <div>
      <SectionHeader title="Assignment Submissions" sub="Review, approve, or send back with feedback." />

      <div className="mb-5 flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as SubmissionStatus)}
            className={`rounded-full px-3.5 py-1.5 text-[12px] font-semibold transition-colors ${
              tab === t.id ? "bg-navy text-teal" : "bg-light text-grey hover:text-navy"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <PageSpinner />
      ) : submissions.length === 0 ? (
        <EmptyState icon="✅" title="Nothing here" />
      ) : (
        <div className="space-y-3">
          {submissions.map((s: any) => (
            <Card key={s.id}>
              <div className="mb-2 flex items-start justify-between">
                <div>
                  <div className="text-[14px] font-bold text-navy">{s.profiles?.full_name}</div>
                  <div className="text-[12px] text-grey">{s.assignments?.title}</div>
                </div>
                <Badge label={s.status.replace("_", " ")} tone={tone[s.status as SubmissionStatus]} />
              </div>

              <a href={s.file_url} target="_blank" rel="noreferrer" className="mb-3 inline-block text-[13px] font-semibold text-teal underline">
                View submission ↗
              </a>

              {s.status === "pending" || s.status === "needs_improvement" ? (
                <div className="space-y-2">
                  <Textarea
                    rows={2}
                    placeholder="Feedback (shown to the member)…"
                    value={feedbackDraft[s.id] ?? s.feedback ?? ""}
                    onChange={(e) => setFeedbackDraft((d) => ({ ...d, [s.id]: e.target.value }))}
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={() => handleReview(s.id, "approved")} disabled={review.isPending}>
                      Approve
                    </Button>
                    <Button variant="secondary" onClick={() => handleReview(s.id, "needs_improvement")} disabled={review.isPending}>
                      Needs improvement
                    </Button>
                    <Button variant="danger" onClick={() => handleReview(s.id, "rejected")} disabled={review.isPending}>
                      Reject
                    </Button>
                  </div>
                </div>
              ) : (
                s.feedback && (
                  <div className="rounded-lg bg-light px-3 py-2 text-[12px] text-navy">
                    <span className="font-semibold">Feedback given: </span>{s.feedback}
                  </div>
                )
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
