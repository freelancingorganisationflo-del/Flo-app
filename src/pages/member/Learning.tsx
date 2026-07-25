import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useSkills } from "@/hooks/useSkills";
import { useModules } from "@/hooks/useModules";
import { useMyProgress } from "@/hooks/useProgress";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageSpinner } from "@/components/ui/Spinner";

export function Learning() {
  const { profile } = useAuth();
  const { data: skills = [] } = useSkills();
  const { data: modules = [], isLoading } = useModules(profile?.skill_id);
  const { data: progress = [] } = useMyProgress(profile?.id);

  const skill = skills.find((s) => s.id === profile?.skill_id);
  const progressByModule = new Map(progress.map((p) => [p.module_id, p.status]));

  if (!profile?.skill_id) {
    return (
      <div>
        <SectionHeader title="Learning" sub="Your roadmap will appear once you're assigned a skill." />
        <EmptyState icon="⏳" title="No skill assigned yet" />
      </div>
    );
  }

  if (isLoading) return <PageSpinner />;

  return (
    <div>
      <SectionHeader
        title="Learning Roadmap"
        sub={`${skill?.icon ?? ""} ${skill?.label ?? ""} — work through each module in order.`}
      />

      {modules.length === 0 ? (
        <EmptyState icon="📚" title="Curriculum coming soon" description="Your admin hasn't published modules for this skill yet." />
      ) : (
        <div className="relative space-y-3 pl-6">
          <div className="absolute bottom-2 left-[11px] top-2 w-px bg-border" />
          {modules.map((m) => {
            const status = progressByModule.get(m.id) ?? "locked";
            const isLocked = status === "locked";
            const dotClass =
              status === "completed" ? "bg-teal border-teal" : status === "unlocked" ? "bg-white border-teal" : "bg-light border-border";

            const content = (
              <div
                className={`flex items-center justify-between rounded-card border p-4 transition-all ${
                  isLocked ? "border-border bg-light opacity-60" : "border-border bg-white hover:-translate-y-0.5 hover:shadow-md"
                }`}
              >
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wide text-grey">Module {m.order_index}</div>
                  <div className="mt-0.5 text-[15px] font-bold text-navy">{m.title}</div>
                  {m.description && <div className="mt-0.5 text-[12px] text-grey">{m.description}</div>}
                </div>
                <div className="text-[11px] font-bold text-grey">
                  {status === "completed" ? <span className="text-teal">✓ Done</span> : status === "unlocked" ? "In progress →" : "🔒 Locked"}
                </div>
              </div>
            );

            return (
              <div key={m.id} className="relative">
                <div className={`absolute -left-6 top-5 h-3 w-3 rounded-full border-2 ${dotClass}`} />
                {isLocked ? content : <Link to={`/learning/${m.id}`}>{content}</Link>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
