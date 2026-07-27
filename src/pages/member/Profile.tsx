import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useSkills } from "@/hooks/useSkills";
import { useModules } from "@/hooks/useModules";
import { useMyProgress } from "@/hooks/useProgress";
import {
  useUpdateProfile,
  useUploadAvatar,
  useChangePassword,
  useProfileActivity,
} from "@/hooks/useProfile";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageSpinner } from "@/components/ui/Spinner";
import { ProgressBar } from "@/components/ui/ProgressBar";
import type { ActivityType } from "@/hooks/useProfile";

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function fmtRelative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return fmtDate(iso);
}

const activityConfig: Record<
  ActivityType,
  { dot: string; label: string }
> = {
  module_completed: { dot: "bg-green", label: "✅" },
  assignment_submitted: { dot: "bg-orange", label: "📤" },
  assignment_approved: { dot: "bg-teal", label: "🎉" },
  assignment_needs_improvement: { dot: "bg-red", label: "⚠️" },
};

const statusTone = { active: "teal", at_risk: "orange", inactive: "grey" } as const;

// ─── Inline skeleton atom ────────────────────────────────────────────────────
function Sk({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-border ${className}`} />;
}

// ─── Avatar component ────────────────────────────────────────────────────────
function Avatar({
  url,
  name,
  size = "h-20 w-20",
}: {
  url: string | null | undefined;
  name: string;
  size?: string;
}) {
  return (
    <div
      className={`${size} flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-tealDim ring-2 ring-tealBorder`}
    >
      {url ? (
        <img src={url} className="h-full w-full object-cover" alt={name} />
      ) : (
        <span className="text-[28px] font-extrabold text-teal">
          {name.charAt(0).toUpperCase()}
        </span>
      )}
    </div>
  );
}

// ─── Feedback row ─────────────────────────────────────────────────────────────
function Feedback({ msg }: { msg: string | null }) {
  if (!msg) return null;
  const isWarn = msg.startsWith("⚠");
  const isOk = msg.startsWith("✓");
  return (
    <div
      className={`mt-2 rounded-lg px-3 py-2 text-[12px] font-semibold ${
        isWarn
          ? "bg-orangeDim text-orange"
          : isOk
            ? "bg-greenDim text-green"
            : "bg-redDim text-red"
      }`}
    >
      {msg}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export function Profile() {
  const { profile, refreshProfile } = useAuth();
  const { data: skills = [] } = useSkills();
  const { data: modules = [], isLoading: modulesLoading } = useModules(
    profile?.skill_id
  );
  const { data: progress = [] } = useMyProgress(profile?.id);
  const { data: activity = [], isLoading: activityLoading } =
    useProfileActivity(profile?.id);

  const updateProfile = useUpdateProfile();
  const uploadAvatar = useUploadAvatar();
  const changePassword = useChangePassword();

  // ── Form state ──────────────────────────────────────────────────────────
  const [nameVal, setNameVal] = useState("");
  const [bioVal, setBioVal] = useState("");
  const [phoneVal, setPhoneVal] = useState("");
  const [igVal, setIgVal] = useState("");
  const [linkedinVal, setLinkedinVal] = useState("");
  const [githubVal, setGithubVal] = useState("");

  // ── UI state ─────────────────────────────────────────────────────────────
  const [infoMsg, setInfoMsg] = useState<string | null>(null);
  const [socialMsg, setSocialMsg] = useState<string | null>(null);
  const [pwOpen, setPwOpen] = useState(false);
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwMsg, setPwMsg] = useState<string | null>(null);
  const [avatarErr, setAvatarErr] = useState<string | null>(null);
  const avatarRef = useRef<HTMLInputElement>(null);
  const initialized = useRef(false);

  // Initialize form from profile (once)
  useEffect(() => {
    if (profile && !initialized.current) {
      setNameVal(profile.full_name);
      setBioVal(profile.bio ?? "");
      setPhoneVal(profile.phone ?? "");
      setIgVal(profile.instagram ?? "");
      setLinkedinVal(profile.linkedin ?? "");
      setGithubVal(profile.github ?? "");
      initialized.current = true;
    }
  }, [profile]);

  if (!profile) return <PageSpinner />;

  // ── Derived ───────────────────────────────────────────────────────────────
  const skill = skills.find((s) => s.id === profile.skill_id);
  const progressMap = new Map(progress.map((p) => [p.module_id, p.status]));
  const completedCount = modules.filter(
    (m) => progressMap.get(m.id) === "completed"
  ).length;
  const pct =
    modules.length > 0 ? Math.round((completedCount / modules.length) * 100) : 0;
  const completedModules = modules.filter(
    (m) => progressMap.get(m.id) === "completed"
  );

  // ── Handlers ─────────────────────────────────────────────────────────────
  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarErr(null);
    try {
      const url = await uploadAvatar.mutateAsync({ file, userId: profile!.id });
      await updateProfile.mutateAsync({ id: profile!.id, avatar_url: url });
      await refreshProfile();
    } catch (err) {
      setAvatarErr(
        err instanceof Error ? err.message : "Upload failed. Run supabase/profile_extras.sql to enable avatars."
      );
    }
  }

  async function saveInfo() {
    try {
      const res = await updateProfile.mutateAsync({
        id: profile!.id,
        full_name: nameVal.trim() || profile!.full_name,
        phone: phoneVal.trim() || null,
        bio: bioVal.trim() || null,
      });
      await refreshProfile();
      setInfoMsg(
        res.extended
          ? "✓ Saved"
          : "✓ Name & phone saved. Bio requires supabase/profile_extras.sql."
      );
    } catch (err) {
      setInfoMsg(err instanceof Error ? err.message : "Save failed.");
    }
    setTimeout(() => setInfoMsg(null), 4000);
  }

  async function saveSocial() {
    try {
      const res = await updateProfile.mutateAsync({
        id: profile!.id,
        instagram: igVal.trim() || null,
        linkedin: linkedinVal.trim() || null,
        github: githubVal.trim() || null,
      });
      await refreshProfile();
      setSocialMsg(
        res.extended
          ? "✓ Saved"
          : "⚠️ Social links require supabase/profile_extras.sql — run it first."
      );
    } catch (err) {
      setSocialMsg(err instanceof Error ? err.message : "Save failed.");
    }
    setTimeout(() => setSocialMsg(null), 5000);
  }

  async function handleChangePassword() {
    setPwMsg(null);
    if (newPw.length < 6) {
      setPwMsg("Password must be at least 6 characters.");
      return;
    }
    if (newPw !== confirmPw) {
      setPwMsg("Passwords do not match.");
      return;
    }
    try {
      await changePassword.mutateAsync(newPw);
      setPwMsg("✓ Password updated.");
      setNewPw("");
      setConfirmPw("");
      setTimeout(() => setPwOpen(false), 1500);
    } catch (err) {
      setPwMsg(err instanceof Error ? err.message : "Failed to update password.");
    }
  }

  const inputCls =
    "w-full rounded-[10px] border border-border bg-white px-3.5 py-2.5 text-sm text-flotext outline-none transition-colors focus:border-teal focus:ring-2 focus:ring-teal/10";
  const labelCls = "mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-grey";

  return (
    <div>
      <SectionHeader title="My Profile" sub="Manage your account, track your progress." />

      {/* ── Avatar + identity header ──────────────────────────────────── */}
      <Card className="mb-5">
        <div className="flex flex-wrap items-center gap-5">
          {/* Avatar with upload overlay */}
          <div className="relative shrink-0">
            <Avatar url={profile.avatar_url} name={profile.full_name} size="h-20 w-20" />
            <button
              onClick={() => avatarRef.current?.click()}
              disabled={uploadAvatar.isPending || updateProfile.isPending}
              className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-teal text-[13px] text-navy shadow transition-transform hover:scale-110 disabled:opacity-50"
              title="Upload photo"
            >
              {uploadAvatar.isPending ? "…" : "📷"}
            </button>
            <input
              ref={avatarRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => void handleAvatarChange(e)}
            />
          </div>

          {/* Name + meta */}
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-[22px] font-extrabold text-navy">
                {profile.full_name}
              </h2>
              <Badge
                label={profile.status.replace("_", " ")}
                tone={statusTone[profile.status]}
              />
            </div>
            {skill ? (
              <div className="mt-0.5 text-[13px] text-grey">
                {skill.icon} {skill.label}
              </div>
            ) : (
              <div className="mt-0.5 text-[13px] text-grey">No skill assigned yet</div>
            )}
            <div className="mt-1.5 flex flex-wrap gap-3 text-[11px] text-grey">
              <span>📅 Joined {fmtDate(profile.joined_at)}</span>
              <span>🎭 {profile.role.charAt(0).toUpperCase() + profile.role.slice(1)}</span>
              {profile.phone && <span>📞 {profile.phone}</span>}
            </div>
            {avatarErr && (
              <div className="mt-1 text-[11px] text-red">{avatarErr}</div>
            )}
          </div>
        </div>
      </Card>

      {/* ── Two-column body ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">

        {/* ── Left 2/3 ───────────────────────────────────────────────────── */}
        <div className="space-y-5 lg:col-span-2">

          {/* Personal Info */}
          <Card>
            <div className="mb-4 text-[12px] font-bold uppercase tracking-wide text-navy">
              Personal Information
            </div>
            <div className="space-y-4">
              <div>
                <label className={labelCls}>Full Name</label>
                <input
                  className={inputCls}
                  value={nameVal}
                  onChange={(e) => setNameVal(e.target.value)}
                  placeholder="Your full name"
                />
              </div>
              <div>
                <label className={labelCls}>Bio</label>
                <textarea
                  className={`${inputCls} resize-none`}
                  rows={3}
                  value={bioVal}
                  onChange={(e) => setBioVal(e.target.value)}
                  placeholder="A short intro about you…"
                />
              </div>
              <div>
                <label className={labelCls}>Phone</label>
                <input
                  className={inputCls}
                  value={phoneVal}
                  onChange={(e) => setPhoneVal(e.target.value)}
                  placeholder="+44 7000 000000"
                />
              </div>
            </div>
            <div className="mt-4 flex items-center gap-3">
              <button
                onClick={() => void saveInfo()}
                disabled={updateProfile.isPending}
                className="rounded-[10px] bg-teal px-4 py-2.5 text-sm font-extrabold text-navy transition-colors hover:bg-teal2 disabled:opacity-50"
              >
                {updateProfile.isPending ? "Saving…" : "Save changes"}
              </button>
            </div>
            <Feedback msg={infoMsg} />
          </Card>

          {/* Social Links */}
          <Card>
            <div className="mb-4 text-[12px] font-bold uppercase tracking-wide text-navy">
              Social Links
            </div>
            <div className="space-y-4">
              <div>
                <label className={labelCls}>📸 Instagram</label>
                <input
                  className={inputCls}
                  value={igVal}
                  onChange={(e) => setIgVal(e.target.value)}
                  placeholder="https://instagram.com/yourhandle"
                />
              </div>
              <div>
                <label className={labelCls}>💼 LinkedIn</label>
                <input
                  className={inputCls}
                  value={linkedinVal}
                  onChange={(e) => setLinkedinVal(e.target.value)}
                  placeholder="https://linkedin.com/in/yourname"
                />
              </div>
              <div>
                <label className={labelCls}>💻 GitHub</label>
                <input
                  className={inputCls}
                  value={githubVal}
                  onChange={(e) => setGithubVal(e.target.value)}
                  placeholder="https://github.com/yourusername"
                />
              </div>
            </div>
            <div className="mt-4">
              <button
                onClick={() => void saveSocial()}
                disabled={updateProfile.isPending}
                className="rounded-[10px] bg-teal px-4 py-2.5 text-sm font-extrabold text-navy transition-colors hover:bg-teal2 disabled:opacity-50"
              >
                {updateProfile.isPending ? "Saving…" : "Save links"}
              </button>
            </div>
            <Feedback msg={socialMsg} />
          </Card>

          {/* Activity Timeline */}
          <Card>
            <div className="mb-4 text-[12px] font-bold uppercase tracking-wide text-navy">
              Activity Timeline
            </div>
            {activityLoading ? (
              <div className="space-y-3">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-border" />
                    <div className="flex-1">
                      <Sk className="h-3.5 w-3/4" />
                    </div>
                    <Sk className="h-3 w-14" />
                  </div>
                ))}
              </div>
            ) : activity.length === 0 ? (
              <EmptyState
                icon="📅"
                title="No activity yet"
                description="Your completed modules and submitted assignments will appear here."
              />
            ) : (
              <div className="relative space-y-0">
                {/* Vertical line */}
                <div className="absolute bottom-0 left-[5px] top-0 w-px bg-border" />
                {activity.map((item) => {
                  const cfg = activityConfig[item.type];
                  return (
                    <div
                      key={item.id}
                      className="relative flex items-start gap-4 py-2.5"
                    >
                      <div
                        className={`relative z-10 mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${cfg.dot}`}
                      />
                      <div className="min-w-0 flex-1">
                        <span className="mr-1">{cfg.label}</span>
                        <span className="text-[13px] text-flotext">
                          {item.label}
                        </span>
                      </div>
                      <span className="shrink-0 text-[11px] text-grey">
                        {fmtRelative(item.date)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>

        {/* ── Right 1/3 ──────────────────────────────────────────────────── */}
        <div className="space-y-5">

          {/* Learning Progress */}
          <Card>
            <div className="mb-3 text-[12px] font-bold uppercase tracking-wide text-teal">
              Learning Progress
            </div>
            {!skill ? (
              <EmptyState
                icon="⏳"
                title="No skill assigned yet"
                description="An admin will assign you to a skill track soon."
              />
            ) : modulesLoading ? (
              <div className="space-y-2">
                {[0, 1, 2].map((i) => <Sk key={i} className="h-4 w-full" />)}
              </div>
            ) : (
              <>
                <div className="mb-3">
                  <div className="mb-1.5 flex items-center justify-between text-[11px] text-grey">
                    <span>{skill.icon} {skill.label}</span>
                    <span>{completedCount}/{modules.length}</span>
                  </div>
                  <ProgressBar value={completedCount} max={modules.length || 1} />
                  <div className="mt-1 text-[11px] text-grey">{pct}% complete</div>
                </div>

                {completedModules.length === 0 ? (
                  <div className="text-[12px] text-grey">No modules completed yet.</div>
                ) : (
                  <div className="space-y-1.5">
                    <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-grey">
                      Completed
                    </div>
                    {completedModules.map((m) => (
                      <div
                        key={m.id}
                        className="flex items-center gap-2 text-[12px]"
                      >
                        <span className="text-green">✅</span>
                        <span className="text-navy">
                          Module {m.order_index}: {m.title}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </Card>

          {/* Account Settings */}
          <Card>
            <div className="mb-4 text-[12px] font-bold uppercase tracking-wide text-navy">
              Account Settings
            </div>
            <button
              onClick={() => {
                setPwOpen((o) => !o);
                setPwMsg(null);
              }}
              className="flex w-full items-center justify-between rounded-[10px] border border-border bg-light px-3.5 py-2.5 text-[13px] font-semibold text-navy transition-colors hover:border-tealBorder hover:bg-tealDim hover:text-teal"
            >
              <span>🔑 Change password</span>
              <span className="text-[10px]">{pwOpen ? "▲" : "▼"}</span>
            </button>

            {pwOpen && (
              <div className="mt-4 space-y-3">
                <div>
                  <label className={labelCls}>New Password</label>
                  <input
                    type="password"
                    className={inputCls}
                    value={newPw}
                    onChange={(e) => setNewPw(e.target.value)}
                    placeholder="Min. 6 characters"
                    autoComplete="new-password"
                  />
                </div>
                <div>
                  <label className={labelCls}>Confirm Password</label>
                  <input
                    type="password"
                    className={inputCls}
                    value={confirmPw}
                    onChange={(e) => setConfirmPw(e.target.value)}
                    placeholder="Repeat new password"
                    autoComplete="new-password"
                  />
                </div>
                <button
                  onClick={() => void handleChangePassword()}
                  disabled={changePassword.isPending}
                  className="w-full rounded-[10px] bg-navy py-2.5 text-sm font-bold text-white transition-colors hover:bg-navy/80 disabled:opacity-50"
                >
                  {changePassword.isPending ? "Updating…" : "Update password"}
                </button>
                {pwMsg && (
                  <Feedback msg={pwMsg.startsWith("✓") ? pwMsg : pwMsg} />
                )}
              </div>
            )}
          </Card>

          {/* Member Info */}
          <Card>
            <div className="mb-4 text-[12px] font-bold uppercase tracking-wide text-navy">
              Member Info
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[12px] text-grey">Status</span>
                <Badge
                  label={profile.status.replace("_", " ")}
                  tone={statusTone[profile.status]}
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[12px] text-grey">Role</span>
                <span className="text-[13px] font-semibold text-navy capitalize">
                  {profile.role}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[12px] text-grey">Joined</span>
                <span className="text-[13px] font-semibold text-navy">
                  {fmtDate(profile.joined_at)}
                </span>
              </div>
              {skill && (
                <div className="flex items-center justify-between">
                  <span className="text-[12px] text-grey">Skill track</span>
                  <span className="text-[13px] font-semibold text-navy">
                    {skill.icon} {skill.label}
                  </span>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
