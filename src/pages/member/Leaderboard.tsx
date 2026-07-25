import { useAuth } from "@/contexts/AuthContext";
import { useLeaderboard } from "@/hooks/useLeaderboard";
import { Card } from "@/components/ui/Card";
import { ScoreBadge } from "@/components/ui/ScoreBadge";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { PageSpinner } from "@/components/ui/Spinner";

const medalBg = ["bg-teal text-navy", "bg-[#C0C0C0] text-white", "bg-[#CD7F32] text-white"];

export function Leaderboard() {
  const { profile } = useAuth();
  const { data: rows = [], isLoading } = useLeaderboard(profile?.skill_id);

  if (isLoading) return <PageSpinner />;

  return (
    <div>
      <SectionHeader title="Leaderboard" sub="Ranked within your skill track by completed modules and approved assignments." />
      <Card>
        {rows.map((r, i) => (
          <div key={r.member_id} className="flex items-center gap-3 border-b border-border py-3 last:border-none">
            <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-extrabold ${medalBg[i] ?? "bg-light text-grey"}`}>
              {i + 1}
            </div>
            <div className="flex-1">
              <div className={`text-[13px] font-bold ${r.member_id === profile?.id ? "text-teal" : "text-navy"}`}>
                {r.full_name} {r.member_id === profile?.id && "(you)"}
              </div>
              <div className="text-[11px] text-grey">
                {r.completed_modules} modules · {r.approved_assignments} approved assignments
              </div>
            </div>
            <ScoreBadge score={r.score} />
          </div>
        ))}
      </Card>
    </div>
  );
}
