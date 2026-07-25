import { useState } from "react";
import { useMembers, useAssignMemberSkill, useUpdateMemberStatus } from "@/hooks/useMembers";
import { useSkills } from "@/hooks/useSkills";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageSpinner } from "@/components/ui/Spinner";
import type { MemberStatus } from "@/lib/types/database.types";

const statusTone: Record<MemberStatus, "teal" | "orange" | "grey"> = {
  active: "teal",
  at_risk: "orange",
  inactive: "grey",
};

export function AdminMembers() {
  const { data: members = [], isLoading } = useMembers();
  const { data: skills = [] } = useSkills();
  const assignSkill = useAssignMemberSkill();
  const updateStatus = useUpdateMemberStatus();
  const [filter, setFilter] = useState<string>("all");

  if (isLoading) return <PageSpinner />;

  const filtered = filter === "all" ? members : filter === "unassigned" ? members.filter((m) => !m.skill_id) : members.filter((m) => m.skill_id === filter);

  return (
    <div>
      <SectionHeader title="Members" sub={`${members.length} members across ${skills.length} skill tracks.`} />

      <div className="mb-4 flex flex-wrap gap-2">
        {[{ id: "all", label: "All" }, { id: "unassigned", label: "Unassigned" }, ...skills.map((s) => ({ id: s.id, label: `${s.icon} ${s.label}` }))].map(
          (f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`rounded-full px-3.5 py-1.5 text-[12px] font-semibold transition-colors ${
                filter === f.id ? "bg-teal text-navy" : "bg-light text-grey hover:text-navy"
              }`}
            >
              {f.label}
            </button>
          )
        )}
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon="👥" title="No members here" />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {filtered.map((m) => {
            const skillFull = skills.find((s) => s.id === m.skill_id);
            const capacityReached = (skillId: string) => {
              const s = skills.find((sk) => sk.id === skillId);
              if (!s) return false;
              const count = members.filter((mm) => mm.skill_id === skillId).length;
              return count >= s.member_capacity && m.skill_id !== skillId;
            };

            return (
              <Card key={m.id}>
                <div className="mb-2 flex items-start justify-between">
                  <div>
                    <div className="text-[14px] font-bold text-navy">{m.full_name}</div>
                    <div className="text-[11px] text-grey">{skillFull ? `${skillFull.icon} ${skillFull.label}` : "No skill assigned"}</div>
                  </div>
                  <Badge label={m.status.replace("_", " ")} tone={statusTone[m.status]} />
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <select
                    value={m.skill_id ?? ""}
                    onChange={(e) => assignSkill.mutate({ memberId: m.id, skillId: e.target.value })}
                    className="rounded-lg border border-border bg-white px-2.5 py-1.5 text-[12px] text-navy"
                  >
                    <option value="" disabled>
                      Assign skill…
                    </option>
                    {skills.map((s) => (
                      <option key={s.id} value={s.id} disabled={capacityReached(s.id)}>
                        {s.icon} {s.label} {capacityReached(s.id) ? "(full)" : ""}
                      </option>
                    ))}
                  </select>

                  <select
                    value={m.status}
                    onChange={(e) => updateStatus.mutate({ memberId: m.id, status: e.target.value as MemberStatus })}
                    className="rounded-lg border border-border bg-white px-2.5 py-1.5 text-[12px] text-navy"
                  >
                    <option value="active">Active</option>
                    <option value="at_risk">At risk</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
