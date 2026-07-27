import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useSkills } from "@/hooks/useSkills";
import { useModules } from "@/hooks/useModules";
import { useMemberProgress } from "@/hooks/useProgress";
import { useMyCheckins } from "@/hooks/useCheckins";
import { useMemberProfile, useMemberSubmissions } from "@/hooks/useProfile";
import { Card } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { ProgressBar } from "@/components/ui/ProgressBar";
import type { ProgressStatus, SubmissionStatus } from "@/lib/types/database.types";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// ─── Status config ────────────────────────────────────────────────────────────

const progressBadge: Record<
  ProgressStatus,
  { tone: "teal" | "orange" | "grey"; label: string }
> = {
  completed: { tone: "teal", label: "✅ Completed" },
  unlocked: { tone: "orange", label: "🔓 In Progress" },
  locked: { tone: "grey", label: "🔒 Locked" },
};

const subTone: Record<SubmissionStatus, "orange" | "teal" | "red" | "grey"> = {
  pending: "orange",
  approved: "teal",
  needs_improvement: "red",
  rejected: "grey",
};

const subLabel: Record<SubmissionStatus, string> = {
  pending: "Pending",
  approved: "Approved ✓",
  needs_improvement: "Needs Work",
  rejected: "Rejected",
};

const memberStatusTone = {
  active: "teal",
  at_risk: "orange",
  inactive: "grey",
} as const;

// ─── Inline skeleton ──────────────────────────────────────────────────────────
function Sk({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-border ${className}`} />;
}

function MemberDetailSkeleton() {
  return (
    <div>
      <Sk className="mb-6 h-5 w-32" />
      <div className="mb-5 rounded-card border border-border bg-white p-5">
        <div className="flex gap-4">
          <div className="h-16 w-16 animate-pulse rounded-full bg-border" />
          <div className="flex-1 space-y-2">
            <Sk className="h-6 w-48" />
            <Sk className="h-4 w-32" />
            <Sk className="h-3 w-40" />
          </div>
        </div>
      </div>
      <div className="mb-5 flex flex-wrap gap-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="min-w-[140px] flex-1 animate-pulse rounded-card border border-border bg-white p-5 h-24" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className="animate-pulse rounded-card border border-border bg-white h-64" />
        ))}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export function AdminMemberDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: member, isLoading: memberLoading } = useMemberProfile(id);
  const { data: skills = [] } = useSkills();
  const { data: modules = [], isLoading: modulesLoading } = useModules(
    member?.skill_id
  );
  const { data: progress = [], isLoading: progressLoading } = useMemberProgress(id);
  const { data: submissions = [], isLoading: subsLoading } = useMemberSubmissions(id);
  const { data: checkins = [], isLoading: checkinsLoading } = useMyCheckins(id);

  const [expandedCheckin, setExpandedCheckin] = useState<string | null>(null);

  if (memberLoading) return <MemberDetailSkeleton />;
  if (!member) {
    return (
      <div>
        <Link
          to="/admin/members"
          className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-teal hover:underline"
        >
          ← Back to Members
        </Link>
        <EmptyState icon="👤" title="Member not found" description="This member profile doesn't exist or you don't have access." />
      </div>
    );
  }

  // ── Derived ──────────────────────────────────────────────────────────────
  const skill = skills.find((s) => s.id === member.skill_id);
  const progressMap = new Map(
    progress.map((p) => [p.module_id, p])
  );
  const completedCount = progress.filter((p) => p.status === "completed").length;
  const inProgressCount = progress.filter((p) => p.status === "unlocked").length;
  const pct =
    modules.length > 0 ? Math.round((completedCount / modules.length) * 100) : 0;
  const approvedSubs = (submissions as any[]).filter(
    (s) => s.status === "approved"
  ).length;

  return (
    <div>
      {/* Back link */}
      <Link
        to="/admin/members"
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-teal hover:underline"
      >
        ← Back to Members
      </Link>

      {/* ── Member header card ──────────────────────────────────────────── */}
      <Card className="mb-5">
        <div className="flex flex-wrap items-center gap-5">
          {/* Avatar */}
          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-tealDim ring-2 ring-tealBorder">
            {member.avatar_url ? (
              <img
                src={member.avatar_url}
                className="h-full w-full object-cover"
                alt={member.full_name}
              />
            ) : (
              <span className="text-[24px] font-extrabold text-teal">
                {member.full_name.charAt(0).toUpperCase()}
              </span>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-[20px] font-extrabold text-navy">
                {member.full_name}
              </h2>
              <Badge
                label={member.status.replace("_", " ")}
                tone={memberStatusTone[member.status]}
              />
            </div>
            <div className="mt-0.5 text-[13px] text-grey">
              {skill
                ? `${skill.icon} ${skill.label}`
                : "No skill assigned"}
            </div>
            <div className="mt-1 flex flex-wrap gap-4 text-[11px] text-grey">
              <span>📅 Joined {fmtDate(member.joined_at)}</span>
              {member.phone && <span>📞 {member.phone}</span>}
              {member.instagram && (
                <a href={member.instagram} target="_blank" rel="noreferrer" className="text-teal hover:underline">
                  📸 Instagram
                </a>
              )}
              {member.linkedin && (
                <a href={member.linkedin} target="_blank" rel="noreferrer" className="text-teal hover:underline">
                  💼 LinkedIn
                </a>
              )}
              {member.github && (
                <a href={member.github} target="_blank" rel="noreferrer" className="text-teal hover:underline">
                  💻 GitHub
                </a>
              )}
            </div>
            {member.bio && (
              <p className="mt-2 text-[13px] text-grey">{member.bio}</p>
            )}
          </div>
        </div>
      </Card>

      {/* ── Stat cards ───────────────────────────────────────────────────── */}
      <div className="mb-5 flex flex-wrap gap-4">
        <StatCard
          label="Modules completed"
          value={completedCount}
          sub={
            modules.length > 0
              ? `${pct}% of ${modules.length}`
              : "No modules yet"
          }
          tone="teal"
        />
        <StatCard
          label="In progress"
          value={inProgressCount}
          sub="Modules unlocked"
          tone="orange"
        />
        <StatCard
          label="Submissions"
          value={(submissions as any[]).length}
          sub={`${approvedSubs} approved`}
          tone="navy"
        />
        <StatCard
          label="Check-ins"
          value={checkins.length}
          sub="Weeks submitted"
        />
      </div>

      {/* ── Progress + Submissions grid ───────────────────────────────── */}
      <div className="mb-5 grid grid-cols-1 gap-5 lg:grid-cols-2">

        {/* Module Progress */}
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <div className="text-[12px] font-bold uppercase tracking-wide text-teal">
              Module Progress
            </div>
            {modules.length > 0 && (
              <span className="text-[11px] text-grey">
                {completedCount}/{modules.length}
              </span>
            )}
          </div>

          {!skill ? (
            <EmptyState
              icon="📚"
              title="No skill assigned"
              description="Assign this member to a skill track from the Members page."
            />
          ) : modulesLoading || progressLoading ? (
            <div className="space-y-3">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="flex items-center justify-between gap-3">
                  <Sk className="h-4 flex-1" />
                  <Sk className="h-5 w-20" />
                </div>
              ))}
            </div>
          ) : modules.length === 0 ? (
            <EmptyState
              icon="📖"
              title="No modules yet"
              description="Add modules to this skill track from the Curriculum page."
            />
          ) : (
            <>
              <div className="mb-3">
                <ProgressBar value={completedCount} max={modules.length} />
              </div>
              <div className="divide-y divide-border">
                {modules.map((m) => {
                  const prog = progressMap.get(m.id);
                  const status = (prog?.status ?? "locked") as ProgressStatus;
                  const cfg = progressBadge[status];
                  return (
                    <div
                      key={m.id}
                      className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0"
                    >
                      <div className="min-w-0 flex-1 pr-3">
                        <div className="truncate text-[13px] font-semibold text-navy">
                          {m.order_index}. {m.title}
                        </div>
                        {prog?.completed_at && (
                          <div className="text-[11px] text-grey">
                            Completed {fmtDate(prog.completed_at)}
                          </div>
                        )}
                        {prog?.unlocked_at && status === "unlocked" && (
                          <div className="text-[11px] text-grey">
                            Unlocked {fmtDate(prog.unlocked_at)}
                          </div>
                        )}
                      </div>
                      <Badge label={cfg.label} tone={cfg.tone} />
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </Card>

        {/* Submissions */}
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <div className="text-[12px] font-bold uppercase tracking-wide text-orange">
              Assignment Submissions
            </div>
            <Link
              to="/admin/submissions"
              className="text-[12px] font-semibold text-teal"
            >
              View all →
            </Link>
          </div>

          {subsLoading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="space-y-1.5">
                  <Sk className="h-4 w-3/4" />
                  <Sk className="h-3 w-1/2" />
                </div>
              ))}
            </div>
          ) : (submissions as any[]).length === 0 ? (
            <EmptyState
              icon="📤"
              title="No submissions yet"
              description="This member hasn't submitted any assignments yet."
            />
          ) : (
            <div className="divide-y divide-border">
              {(submissions as any[]).map((s) => (
                <div key={s.id} className="py-2.5 first:pt-0 last:pb-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-semibold text-navy">
                        {(s.assignment as any)?.title ?? "Assignment"}
                      </div>
                      <div className="text-[11px] text-grey">
                        {(s.assignment as any)?.module?.title
                          ? `Module: ${(s.assignment as any).module.title}`
                          : ""}
                        {s.submitted_at
                          ? ` · ${fmtDate(s.submitted_at as string)}`
                          : ""}
                      </div>
                    </div>
                    <Badge
                      label={subLabel[s.status as SubmissionStatus]}
                      tone={subTone[s.status as SubmissionStatus]}
                    />
                  </div>
                  {s.feedback && (
                    <div className="mt-1.5 rounded-lg bg-light px-3 py-1.5 text-[12px] text-grey">
                      <span className="font-semibold text-navy">Feedback: </span>
                      {s.feedback as string}
                    </div>
                  )}
                  {s.file_url && (
                    <a
                      href={s.file_url as string}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-block text-[11px] font-semibold text-teal hover:underline"
                    >
                      View submission ↗
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* ── Check-in History ────────────────────────────────────────────── */}
      <Card>
        <div className="mb-4 flex items-center justify-between">
          <div className="text-[12px] font-bold uppercase tracking-wide text-navy">
            Check-in History
          </div>
          <span className="text-[11px] text-grey">
            {checkins.length} week{checkins.length !== 1 ? "s" : ""}
          </span>
        </div>

        {checkinsLoading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => <Sk key={i} className="h-12 w-full" />)}
          </div>
        ) : checkins.length === 0 ? (
          <EmptyState
            icon="📝"
            title="No check-ins yet"
            description="This member hasn't submitted any weekly check-ins yet."
          />
        ) : (
          <div className="divide-y divide-border">
            {checkins.map((c) => {
              const isOpen = expandedCheckin === c.id;
              return (
                <div key={c.id} className="py-2.5 first:pt-0 last:pb-0">
                  <button
                    onClick={() =>
                      setExpandedCheckin(isOpen ? null : c.id)
                    }
                    className="flex w-full items-center justify-between text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-tealDim text-[11px] font-extrabold text-teal">
                        W{c.week_number}
                      </div>
                      <div>
                        <div className="text-[13px] font-semibold text-navy">
                          Week {c.week_number}
                        </div>
                        <div className="text-[11px] text-grey">
                          {fmtDate(c.submitted_at)}
                          {c.admin_feedback ? " · Feedback given" : ""}
                        </div>
                      </div>
                    </div>
                    <span className="text-[11px] text-grey">{isOpen ? "▲" : "▼"}</span>
                  </button>

                  {isOpen && (
                    <div className="mt-3 space-y-3 rounded-[10px] bg-light p-4">
                      {c.what_learned && (
                        <div>
                          <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-grey">
                            What I learned
                          </div>
                          <p className="text-[13px] text-navy">{c.what_learned}</p>
                        </div>
                      )}
                      {c.what_completed && (
                        <div>
                          <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-grey">
                            What I completed
                          </div>
                          <p className="text-[13px] text-navy">{c.what_completed}</p>
                        </div>
                      )}
                      {c.problems_faced && (
                        <div>
                          <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-grey">
                            Problems faced
                          </div>
                          <p className="text-[13px] text-navy">{c.problems_faced}</p>
                        </div>
                      )}
                      {c.admin_feedback && (
                        <div className="rounded-lg border border-tealBorder bg-tealDim p-3">
                          <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-teal">
                            Admin Feedback
                          </div>
                          <p className="text-[13px] text-navy">{c.admin_feedback}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
