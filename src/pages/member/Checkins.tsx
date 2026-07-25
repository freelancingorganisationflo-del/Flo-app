import { useState, type FormEvent } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useMyCheckins, useSubmitCheckin } from "@/hooks/useCheckins";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label, Textarea } from "@/components/ui/FormField";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageSpinner } from "@/components/ui/Spinner";

export function Checkins() {
  const { profile } = useAuth();
  const { data: checkins = [], isLoading } = useMyCheckins(profile?.id);
  const submit = useSubmitCheckin();

  const nextWeek = (checkins[0]?.week_number ?? 0) + 1;
  const [weekNumber, setWeekNumber] = useState(nextWeek);
  const [whatLearned, setWhatLearned] = useState("");
  const [whatCompleted, setWhatCompleted] = useState("");
  const [problems, setProblems] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setError(null);
    try {
      await submit.mutateAsync({
        member_id: profile.id,
        week_number: weekNumber,
        what_learned: whatLearned,
        what_completed: whatCompleted,
        problems_faced: problems,
      });
      setWhatLearned("");
      setWhatCompleted("");
      setProblems("");
      setWeekNumber(weekNumber + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit check-in");
    }
  }

  if (isLoading) return <PageSpinner />;

  return (
    <div>
      <SectionHeader title="Weekly Check-in" sub="Quick recap — what you learned, what you finished, what got in the way." />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_1.2fr]">
        <Card>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Week number</Label>
              <Input type="number" min={1} value={weekNumber} onChange={(e) => setWeekNumber(Number(e.target.value))} required />
            </div>
            <div>
              <Label>What did you learn this week?</Label>
              <Textarea rows={3} value={whatLearned} onChange={(e) => setWhatLearned(e.target.value)} required />
            </div>
            <div>
              <Label>What did you complete?</Label>
              <Textarea rows={3} value={whatCompleted} onChange={(e) => setWhatCompleted(e.target.value)} required />
            </div>
            <div>
              <Label>Any problems you faced?</Label>
              <Textarea rows={3} value={problems} onChange={(e) => setProblems(e.target.value)} />
            </div>
            {error && <div className="text-[12px] text-red">{error}</div>}
            <Button type="submit" disabled={submit.isPending} className="w-full">
              {submit.isPending ? "Submitting…" : "Submit check-in"}
            </Button>
          </form>
        </Card>

        <div>
          <div className="mb-3 text-[12px] font-bold uppercase tracking-wide text-grey">Past check-ins</div>
          {checkins.length === 0 ? (
            <EmptyState icon="📝" title="No check-ins yet" description="Your first one will show up here." />
          ) : (
            <div className="space-y-3">
              {checkins.map((c) => (
                <Card key={c.id}>
                  <div className="mb-2 flex items-center justify-between">
                    <div className="text-[13px] font-bold text-navy">Week {c.week_number}</div>
                    <div className="text-[11px] text-grey">{new Date(c.submitted_at).toLocaleDateString()}</div>
                  </div>
                  <div className="space-y-1.5 text-[12px] text-grey">
                    <div><span className="font-semibold text-navy">Learned: </span>{c.what_learned}</div>
                    <div><span className="font-semibold text-navy">Completed: </span>{c.what_completed}</div>
                    {c.problems_faced && <div><span className="font-semibold text-navy">Problems: </span>{c.problems_faced}</div>}
                  </div>
                  {c.admin_feedback && (
                    <div className="mt-2 rounded-lg bg-light px-3 py-2 text-[12px] text-navy">
                      <span className="font-semibold">Admin: </span>{c.admin_feedback}
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
