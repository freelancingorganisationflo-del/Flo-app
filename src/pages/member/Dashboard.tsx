import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useSkills } from "@/hooks/useSkills";
import { useModules } from "@/hooks/useModules";
import { useMyProgress } from "@/hooks/useProgress";
import { useMySubmissions } from "@/hooks/useSubmissions";
import { useNotifications } from "@/hooks/useNotifications";
import { useMyCheckins } from "@/hooks/useCheckins";
import { Card } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageSpinner } from "@/components/ui/Spinner";

export function Dashboard() {
  const { profile } = useAuth();
  const { data: skills = [] } = useSkills();
  const { data: modules = [], isLoading: modulesLoading } = useModules(profile?.skill_id);
  const { data: progress = [] } = useMyProgress(profile?.id);
  const { data: submissions = [] } = useMySubmissions(profile?.id);
  const { data: notifications = [] } = useNotifications(profile?.id);
  const { data: checkins = [] } = useMyCheckins(profile?.id);

  if (!profile) return <PageSpinner />;

  if (!profile.skill_id) {
    return (
      <div>
        <SectionHeader title={`Welcome, ${profile.full_name.split(" ")[0]}`} sub="Your learning dashboard." />
        <EmptyState
          icon="⏳"
          title="Waiting on your skill assignment"
          description="An admin will assign you to a skill track soon — you'll see your curriculum here as soon as that happens."
        />
      </div>
    );
  }

  if (modulesLoading) return <PageSpinner />;

  const currentSkill = skills.find((s) => s.id === profile.skill_id);
  const progressByModule = new Map(progress.map((p) => [p.module_id, p]));
  const completedCount = modules.filter((m) => progressByModule.get(m.id)?.status === "completed").length;
  const overallPct = modules.length > 0 ? Math.round((completedCount / modules.length) * 100) : 0;
  const currentModule =
    modules.find((m) => progressByModule.get(m.id)?.status === "unlocked") ??
    modules.find((m) => progressByModule.get(m.id)?.status === "completed");

  const currentSubmission = submissions.find((s) => {
    // most recent submission overall stands in as "pending assignment" status
    return s.status === "pending" || s.status === "needs_improvement";
  });

  const unreadCount = notifications.filter((n) => !n.read).length;
  const lastCheckinWeek = checkins[0]?.week_number ?? 0;

  return (
    <div>
      <SectionHeader
        title={`Welcome, ${profile.full_name.split(" ")[0]}`}
        sub={`${currentSkill?.icon ?? ""} ${currentSkill?.label ?? "Your track"} — here's where you stand.`}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:gap-4">
        <StatCard label="Overall progress" value={`${overallPct}%`} sub={`${completedCount}/${modules.length} modules`} />
        <StatCard
          label="Current module"
          value={currentModule ? currentModule.title : "—"}
          sub={currentModule ? `Module ${currentModule.order_index}` : "All caught up"}
          tone="navy"
        />
        <StatCard
          label="Pending assignment"
          value={currentSubmission ? "Action needed" : "None"}
          sub={currentSubmission ? currentSubmission.status.replace("_", " ") : "You're up to date"}
          tone={currentSubmission ? "orange" : "green"}
        />
        <StatCard label="Notifications" value={unreadCount} sub="Unread" tone="teal" />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card>
          <div className="mb-3 text-[12px] font-bold uppercase tracking-wide text-teal">Skill progress</div>
          <div className="mb-2 flex items-center justify-between text-[11px] text-grey">
            <span>{currentSkill?.label}</span>
            <span>{overallPct}%</span>
          </div>
          <ProgressBar value={completedCount} max={modules.length} />
          {currentModule && (
            <Link
              to={`/learning/${currentModule.id}`}
              className="mt-4 inline-block rounded-[10px] bg-tealDim px-4 py-2 text-[13px] font-bold text-teal"
            >
              Continue: {currentModule.title} →
            </Link>
          )}
        </Card>

        <Card>
          <div className="mb-3 text-[12px] font-bold uppercase tracking-wide text-teal">Weekly check-ins</div>
          <div className="text-[13px] text-navy">
            {checkins.length > 0 ? (
              <>Last submitted: <span className="font-semibold">Week {lastCheckinWeek}</span></>
            ) : (
              "No check-ins submitted yet."
            )}
          </div>
          <Link to="/checkins" className="mt-4 inline-block rounded-[10px] bg-light px-4 py-2 text-[13px] font-bold text-navy">
            Submit this week's check-in →
          </Link>
        </Card>
      </div>
    </div>
  );
}
