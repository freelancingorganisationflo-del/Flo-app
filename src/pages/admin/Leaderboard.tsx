import { useState } from "react";
import { useSkills } from "@/hooks/useSkills";
import { useLeaderboard } from "@/hooks/useLeaderboard";
import { Card } from "@/components/ui/Card";
import { ScoreBadge } from "@/components/ui/ScoreBadge";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageSpinner } from "@/components/ui/Spinner";

const medalBg = ["bg-teal text-navy", "bg-[#C0C0C0] text-white", "bg-[#CD7F32] text-white"];

export function AdminLeaderboard() {
  const { data: skills = [], isLoading: skillsLoading } = useSkills();
  const [skillId, setSkillId] = useState<string | null>(null);
  const activeSkillId = skillId ?? skills[0]?.id ?? null;
  const { data: rows = [], isLoading } = useLeaderboard(activeSkillId);

  if (skillsLoading) return <PageSpinner />;

  return (
    <div>
      <SectionHeader title="Leaderboard" sub="Every skill's ranking, side by side." />

      <div className="mb-4 flex flex-wrap gap-2">
        {skills.map((s) => (
          <button
            key={s.id}
            onClick={() => setSkillId(s.id)}
            className={`rounded-full px-3.5 py-1.5 text-[12px] font-semibold transition-colors ${
              activeSkillId === s.id ? "bg-navy text-teal" : "bg-light text-grey hover:text-navy"
            }`}
          >
            {s.icon} {s.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <PageSpinner />
      ) : rows.length === 0 ? (
        <EmptyState icon="🏆" title="No members ranked yet in this skill" />
      ) : (
        <Card>
          {rows.map((r, i) => (
            <div key={r.member_id} className="flex items-center gap-3 border-b border-border py-3 last:border-none">
              <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-extrabold ${medalBg[i] ?? "bg-light text-grey"}`}>
                {i + 1}
              </div>
              <div className="flex-1">
                <div className="text-[13px] font-bold text-navy">{r.full_name}</div>
                <div className="text-[11px] text-grey">
                  {r.completed_modules} modules · {r.approved_assignments} approved assignments
                </div>
              </div>
              <ScoreBadge score={r.score} />
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
