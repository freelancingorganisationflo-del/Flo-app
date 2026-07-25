import { Link } from "react-router-dom";
import { useMembers } from "@/hooks/useMembers";
import { useSkills } from "@/hooks/useSkills";
import { useAllSubmissions } from "@/hooks/useSubmissions";
import { Card } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { Badge } from "@/components/ui/Badge";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { PageSpinner } from "@/components/ui/Spinner";

export function AdminDashboard() {
  const { data: members = [], isLoading: membersLoading } = useMembers();
  const { data: skills = [] } = useSkills();
  const { data: submissions = [], isLoading: subsLoading } = useAllSubmissions("pending");

  if (membersLoading || subsLoading) return <PageSpinner />;

  const active = members.filter((m) => m.status === "active").length;
  const atRisk = members.filter((m) => m.status === "at_risk").length;

  return (
    <div>
      <SectionHeader title="Admin Dashboard" sub="FLO at a glance." />

      <div className="mb-6 flex flex-wrap gap-4">
        <StatCard label="Total members" value={members.length} sub={`${skills.length} skill tracks`} />
        <StatCard label="Active" value={active} tone="teal" />
        <StatCard label="At risk" value={atRisk} tone="orange" />
        <StatCard label="Pending reviews" value={submissions.length} sub="Assignments awaiting review" tone="navy" />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <div className="text-[12px] font-bold uppercase tracking-wide text-orange">⚠ Review queue</div>
            <Link to="/admin/submissions" className="text-[12px] font-semibold text-teal">View all →</Link>
          </div>
          {submissions.length === 0 ? (
            <div className="text-[13px] text-grey">Nothing pending — nice.</div>
          ) : (
            submissions.slice(0, 5).map((s: any) => (
              <div key={s.id} className="flex items-center justify-between border-b border-border py-2 text-[13px] last:border-none">
                <div>
                  <div className="font-semibold text-navy">{s.profiles?.full_name}</div>
                  <div className="text-[11px] text-grey">{s.assignments?.title}</div>
                </div>
                <Badge label="Pending" tone="orange" />
              </div>
            ))
          )}
        </Card>

        <Card>
          <div className="mb-3 text-[12px] font-bold uppercase tracking-wide text-teal">Skill capacity</div>
          {skills.map((s) => {
            const count = members.filter((m) => m.skill_id === s.id).length;
            return (
              <div key={s.id} className="flex items-center justify-between border-b border-border py-2 text-[13px] last:border-none">
                <div className="text-navy">{s.icon} {s.label}</div>
                <Badge label={`${count}/${s.member_capacity}`} tone={count >= s.member_capacity ? "grey" : "teal"} />
              </div>
            );
          })}
        </Card>
      </div>
    </div>
  );
}
