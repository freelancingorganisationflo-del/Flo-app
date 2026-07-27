import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useMembers } from "@/hooks/useMembers";
import { useSkills } from "@/hooks/useSkills";
import { useAllSubmissions } from "@/hooks/useSubmissions";
import { useAllCheckins } from "@/hooks/useCheckins";
import { useNotifications } from "@/hooks/useNotifications";
import { Card } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { Badge } from "@/components/ui/Badge";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

// ─── Skeleton atom ──────────────────────────────────────────────────────────────
function Sk({ className = "" }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded-lg bg-border ${className}`} />
  );
}

// ─── Full-page loading skeleton ─────────────────────────────────────────────────
function DashboardSkeleton() {
  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <Sk className="mb-2 h-7 w-44" />
        <Sk className="h-4 w-32" />
      </div>
      {/* Stat cards */}
      <div className="mb-6 flex flex-wrap gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="min-w-[140px] flex-1 rounded-card border border-border bg-white p-5"
          >
            <Sk className="mb-2 h-8 w-14" />
            <Sk className="mb-1.5 h-3 w-24" />
            <Sk className="h-3 w-20" />
          </div>
        ))}
      </div>
      {/* Card grid */}
      <div className="mb-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
        {[0, 1].map((i) => (
          <div
            key={i}
            className="h-44 animate-pulse rounded-card border border-border bg-white"
          />
        ))}
      </div>
      {/* Chart */}
      <div className="mb-5 h-52 animate-pulse rounded-card border border-border bg-white" />
      {/* Lower grid */}
      <div className="mb-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
        {[0, 1].map((i) => (
          <div
            key={i}
            className="h-48 animate-pulse rounded-card border border-border bg-white"
          />
        ))}
      </div>
      {/* Notifications */}
      <div className="h-36 animate-pulse rounded-card border border-border bg-white" />
    </div>
  );
}

// ─── SVG Progress Ring ──────────────────────────────────────────────────────────
function ProgressRing({
  pct,
  size = 100,
  strokeWidth = 10,
}: {
  pct: number;
  size?: number;
  strokeWidth?: number;
}) {
  const r = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - Math.min(1, Math.max(0, pct / 100)));
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="#E8ECF2"
        strokeWidth={strokeWidth}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="#00D9B8"
        strokeWidth={strokeWidth}
        strokeDasharray={circ}
        strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: "stroke-dashoffset 0.8s ease-out" }}
      />
    </svg>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────────
export function AdminDashboard() {
  const { profile } = useAuth();

  // ── Existing queries (unchanged) ──
  const { data: members = [], isLoading: membersLoading } = useMembers();
  const { data: skills = [] } = useSkills();
  const { data: submissions = [], isLoading: subsLoading } =
    useAllSubmissions("pending");

  // ── New queries ──
  const { data: allSubsRaw = [] } = useAllSubmissions(); // all statuses, for approval rate
  const { data: checkinsRaw = [], isLoading: checkinsLoading } =
    useAllCheckins();
  const { data: notifications = [], isLoading: notifsLoading } =
    useNotifications(profile?.id);

  if (membersLoading || subsLoading) return <DashboardSkeleton />;

  // ── Derived stats ──────────────────────────────────────────────────────────
  const active = members.filter((m) => m.status === "active").length;
  const atRisk = members.filter((m) => m.status === "at_risk").length;
  const activeRate =
    members.length > 0 ? Math.round((active / members.length) * 100) : 0;

  const allSubs = allSubsRaw as Array<{ status: string }>;
  const approvedCount = allSubs.filter((s) => s.status === "approved").length;
  const approvalRate =
    allSubs.length > 0
      ? Math.round((approvedCount / allSubs.length) * 100)
      : 0;

  // ── Chart data: check-ins grouped by week_number, last 8 weeks ────────────
  const weekMap = new Map<number, number>();
  (checkinsRaw as Array<{ week_number: number }>).forEach((c) => {
    weekMap.set(c.week_number, (weekMap.get(c.week_number) ?? 0) + 1);
  });
  const chartData = Array.from(weekMap.entries())
    .sort((a, b) => a[0] - b[0])
    .slice(-8)
    .map(([week, count]) => ({ label: `Wk ${week}`, count }));

  // ── Quick actions ─────────────────────────────────────────────────────────
  const quickActions = [
    { label: "Manage Members", icon: "👥", to: "/admin/members" },
    { label: "Edit Curriculum", icon: "📚", to: "/admin/curriculum" },
    { label: "View Submissions", icon: "📤", to: "/admin/submissions" },
    { label: "View Check-ins", icon: "📝", to: "/admin/checkins" },
  ];

  const recentNotifs = notifications.slice(0, 5);

  return (
    <div>
      {/* ── Header ── */}
      <SectionHeader title="Admin Dashboard" sub="FLO at a glance." />

      {/* ── Existing: 4 stat cards ─────────────────────────────────────────── */}
      <div className="mb-6 flex flex-wrap gap-4">
        <StatCard
          label="Total members"
          value={members.length}
          sub={`${skills.length} skill tracks`}
        />
        <StatCard label="Active" value={active} tone="teal" />
        <StatCard label="At risk" value={atRisk} tone="orange" />
        <StatCard
          label="Pending reviews"
          value={submissions.length}
          sub="Assignments awaiting review"
          tone="navy"
        />
      </div>

      {/* ── NEW: Overall Progress + Quick Actions ─────────────────────────── */}
      <div className="mb-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Overall Progress Card */}
        <Card>
          <div className="mb-4 text-[12px] font-bold uppercase tracking-wide text-teal">
            Overall Progress
          </div>
          <div className="flex items-center gap-6">
            {/* Ring */}
            <div className="relative shrink-0">
              <ProgressRing pct={activeRate} size={104} strokeWidth={10} />
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-[21px] font-extrabold leading-none text-navy">
                  {activeRate}%
                </span>
                <span className="text-[9px] font-semibold uppercase tracking-wider text-grey">
                  active
                </span>
              </div>
            </div>

            {/* Stats beside ring */}
            <div className="flex-1 space-y-4">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-grey">
                  Total Members
                </div>
                <div className="text-[26px] font-extrabold leading-tight text-navy">
                  {members.length}
                </div>
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-grey">
                  Approval Rate
                </div>
                <div className="flex items-baseline gap-1.5">
                  <div className="text-[26px] font-extrabold leading-tight text-green">
                    {approvalRate}%
                  </div>
                  <div className="text-[11px] text-grey">
                    {approvedCount}/{allSubs.length} reviewed
                  </div>
                </div>
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-grey">
                  Active Members
                </div>
                <div className="text-[26px] font-extrabold leading-tight text-teal">
                  {active}
                  <span className="ml-1.5 text-[13px] font-medium text-grey">
                    of {members.length}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* Quick Actions */}
        <Card>
          <div className="mb-4 text-[12px] font-bold uppercase tracking-wide text-navy">
            Quick Actions
          </div>
          <div className="grid grid-cols-2 gap-3">
            {quickActions.map(({ label, icon, to }) => (
              <Link
                key={to}
                to={to}
                className="flex items-center gap-2.5 rounded-[10px] border border-border bg-light px-3.5 py-3 text-[13px] font-semibold text-navy transition-all duration-150 hover:-translate-y-0.5 hover:border-tealBorder hover:bg-tealDim hover:text-teal hover:shadow-[0_4px_12px_rgba(0,217,184,0.12)]"
              >
                <span className="text-base">{icon}</span>
                {label}
              </Link>
            ))}
          </div>
        </Card>
      </div>

      {/* ── NEW: Weekly Check-in Activity Chart ───────────────────────────── */}
      <Card className="mb-5">
        <div className="mb-1 flex items-center justify-between">
          <div className="text-[12px] font-bold uppercase tracking-wide text-navy">
            Weekly Check-in Activity
          </div>
          <Link
            to="/admin/checkins"
            className="text-[12px] font-semibold text-teal"
          >
            View all →
          </Link>
        </div>
        <p className="mb-5 text-[12px] text-grey">
          Number of member check-ins submitted per week.
        </p>

        {checkinsLoading ? (
          /* Chart skeleton */
          <div className="flex h-36 items-end gap-2.5 px-1">
            {[55, 80, 65, 100, 75, 90, 60, 85].map((h, i) => (
              <div
                key={i}
                className="flex-1 animate-pulse rounded-t bg-border"
                style={{ height: h }}
              />
            ))}
          </div>
        ) : chartData.length === 0 ? (
          <EmptyState
            icon="📊"
            title="No activity data yet"
            description="Weekly check-in activity will appear here once members start submitting their weekly check-ins."
          />
        ) : (
          <ResponsiveContainer width="100%" height={160}>
            <BarChart
              data={chartData}
              barCategoryGap="35%"
              margin={{ top: 4, right: 4, left: -28, bottom: 0 }}
            >
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: "#6B7A90" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#6B7A90" }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <Tooltip
                cursor={{ fill: "rgba(0,217,184,0.06)", radius: 6 } as React.SVGProps<SVGRectElement>}
                contentStyle={{
                  borderRadius: 10,
                  border: "1px solid #E8ECF2",
                  fontSize: 12,
                  boxShadow: "0 4px 16px rgba(16,36,62,0.1)",
                  color: "#1A2535",
                }}
                formatter={(val) => {
                  const n = Number(val);
                  return [`${n} check-in${n !== 1 ? "s" : ""}`, "Activity"];
                }}
              />
              <Bar dataKey="count" radius={[5, 5, 0, 0]} maxBarSize={44}>
                {chartData.map((_, i) => (
                  <Cell
                    key={i}
                    fill={
                      i === chartData.length - 1
                        ? "#00D9B8"
                        : "rgba(0,217,184,0.35)"
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </Card>

      {/* ── Existing: Review Queue + Skill Capacity ───────────────────────── */}
      <div className="mb-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Review Queue — enhanced */}
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <div className="text-[12px] font-bold uppercase tracking-wide text-orange">
              ⚠ Review Queue
            </div>
            <Link
              to="/admin/submissions"
              className="text-[12px] font-semibold text-teal"
            >
              View all →
            </Link>
          </div>

          {submissions.length === 0 ? (
            <EmptyState
              icon="✅"
              title="All caught up!"
              description="No pending submissions right now. New assignment submissions from members will appear here."
            />
          ) : (
            <>
              <div className="divide-y divide-border">
                {(submissions as any[]).slice(0, 5).map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0 flex-1 pr-3">
                      <div className="truncate text-[13px] font-semibold text-navy">
                        {s.profiles?.full_name}
                      </div>
                      <div className="truncate text-[11px] text-grey">
                        {s.assignments?.title}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge label="Pending" tone="orange" />
                      <Link
                        to="/admin/submissions"
                        className="text-[11px] font-semibold text-teal hover:underline"
                      >
                        Review →
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
              {submissions.length > 5 && (
                <div className="mt-3 border-t border-border pt-3 text-center text-[12px] text-grey">
                  +{submissions.length - 5} more —{" "}
                  <Link
                    to="/admin/submissions"
                    className="font-semibold text-teal hover:underline"
                  >
                    view all
                  </Link>
                </div>
              )}
            </>
          )}
        </Card>

        {/* Skill Capacity — existing, unchanged */}
        <Card>
          <div className="mb-4 text-[12px] font-bold uppercase tracking-wide text-teal">
            Skill Capacity
          </div>

          {skills.length === 0 ? (
            <EmptyState
              icon="📚"
              title="No skill tracks yet"
              description="Add skill tracks from the Curriculum page to see capacity here."
            />
          ) : (
            <div className="divide-y divide-border">
              {skills.map((s) => {
                const count = members.filter((m) => m.skill_id === s.id).length;
                const isFull = count >= s.member_capacity;
                const fillPct = Math.min(
                  100,
                  (count / Math.max(1, s.member_capacity)) * 100
                );
                return (
                  <div
                    key={s.id}
                    className="py-2.5 first:pt-0 last:pb-0"
                  >
                    <div className="mb-1.5 flex items-center justify-between">
                      <div className="truncate text-[13px] text-navy">
                        {s.icon} {s.label}
                      </div>
                      <Badge
                        label={`${count}/${s.member_capacity}`}
                        tone={isFull ? "grey" : "teal"}
                      />
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-teal/10">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          isFull ? "bg-grey" : "bg-teal"
                        }`}
                        style={{ width: `${fillPct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      {/* ── NEW: Recent Notifications ──────────────────────────────────────── */}
      <Card>
        <div className="mb-4 flex items-center justify-between">
          <div className="text-[12px] font-bold uppercase tracking-wide text-navy">
            Recent Notifications
          </div>
          <span className="rounded-full bg-light px-2.5 py-0.5 text-[11px] font-semibold text-grey">
            Your last 5
          </span>
        </div>

        {notifsLoading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="mt-1.5 h-2 w-2 shrink-0 animate-pulse rounded-full bg-border" />
                <div className="flex-1">
                  <Sk className="mb-1.5 h-3.5 w-40" />
                  <Sk className="h-3 w-60" />
                </div>
              </div>
            ))}
          </div>
        ) : recentNotifs.length === 0 ? (
          <EmptyState
            icon="🔔"
            title="No notifications yet"
            description="System notifications will appear here as member activity happens — approvals, feedback, and more."
          />
        ) : (
          <div className="divide-y divide-border">
            {recentNotifs.map((n) => (
              <div
                key={n.id}
                className={`flex items-start gap-3 py-2.5 first:pt-0 last:pb-0 transition-opacity ${
                  n.read ? "opacity-55" : ""
                }`}
              >
                <div
                  className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                    n.read ? "bg-border" : "bg-teal"
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-semibold text-navy">
                    {n.title}
                  </div>
                  {n.message && (
                    <div className="mt-0.5 line-clamp-1 text-[12px] text-grey">
                      {n.message}
                    </div>
                  )}
                </div>
                {!n.read && (
                  <span className="shrink-0 rounded-full bg-tealDim px-2 py-0.5 text-[10px] font-bold text-teal">
                    New
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
