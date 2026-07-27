import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase, AVATARS_BUCKET } from "@/lib/supabase";
import type { Profile } from "@/lib/types/database.types";

// ─── Fetch single profile ───────────────────────────────────────────────────
// Members can read their own; admins can read anyone (RLS: id=auth.uid or is_admin).

export function useMemberProfile(memberId: string | null | undefined) {
  return useQuery({
    queryKey: ["profile", memberId],
    queryFn: async (): Promise<Profile> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", memberId as string)
        .single();
      if (error) throw error;
      return data as Profile;
    },
    enabled: !!memberId,
  });
}

// ─── Update profile ─────────────────────────────────────────────────────────
// Attempts to save all fields. If bio/social columns don't exist yet (run
// supabase/profile_extras.sql), falls back to saving only base columns and
// returns { extended: false } so the UI can warn the user.

export interface ProfileUpdateInput {
  id: string;
  full_name?: string;
  phone?: string | null;
  avatar_url?: string | null;
  bio?: string | null;
  instagram?: string | null;
  linkedin?: string | null;
  github?: string | null;
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: ProfileUpdateInput
    ): Promise<{ extended: boolean }> => {
      const { id, bio, instagram, linkedin, github, ...base } = input;

      // Full update (all columns, including extended ones)
      const { error } = await supabase
        .from("profiles")
        .update({ ...base, bio, instagram, linkedin, github })
        .eq("id", id);

      if (!error) return { extended: true };

      // If the column doesn't exist, fall back to base-only columns
      const isColMissing =
        error.code === "42703" ||
        error.message.toLowerCase().includes("does not exist");

      if (isColMissing) {
        const { error: e2 } = await supabase
          .from("profiles")
          .update(base)
          .eq("id", id);
        if (e2) throw e2;
        return { extended: false };
      }
      throw error;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["profile", vars.id] });
      qc.invalidateQueries({ queryKey: ["members"] });
    },
  });
}

// ─── Avatar upload ───────────────────────────────────────────────────────────
// Uploads to the 'avatars' bucket and returns the public URL.
// Requires supabase/profile_extras.sql to be applied.

export function useUploadAvatar() {
  return useMutation({
    mutationFn: async ({
      file,
      userId,
    }: {
      file: File;
      userId: string;
    }): Promise<string> => {
      const ext = file.name.split(".").pop() ?? "jpg";
      const path = `${userId}/avatar-${Date.now()}.${ext}`;
      const { error } = await supabase.storage
        .from(AVATARS_BUCKET)
        .upload(path, file, { upsert: true, contentType: file.type });
      if (error) throw error;
      const { data } = supabase.storage
        .from(AVATARS_BUCKET)
        .getPublicUrl(path);
      return data.publicUrl;
    },
  });
}

// ─── Change password ─────────────────────────────────────────────────────────
export function useChangePassword() {
  return useMutation({
    mutationFn: async (newPassword: string) => {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
    },
  });
}

// ─── Activity feed ───────────────────────────────────────────────────────────
// Merges module completions and assignment submissions into a single timeline.

export type ActivityType =
  | "module_completed"
  | "assignment_submitted"
  | "assignment_approved"
  | "assignment_needs_improvement";

export interface ActivityItem {
  id: string;
  type: ActivityType;
  label: string;
  date: string;
}

export function useProfileActivity(memberId: string | null | undefined) {
  return useQuery({
    queryKey: ["profile-activity", memberId],
    queryFn: async (): Promise<ActivityItem[]> => {
      const [{ data: completions, error: e1 }, { data: subs, error: e2 }] =
        await Promise.all([
          supabase
            .from("learning_progress")
            .select("id, completed_at, module:module_id(title)")
            .eq("member_id", memberId as string)
            .eq("status", "completed")
            .not("completed_at", "is", null)
            .order("completed_at", { ascending: false })
            .limit(15),
          supabase
            .from("assignment_submissions")
            .select(
              "id, status, submitted_at, reviewed_at, assignment:assignment_id(title)"
            )
            .eq("member_id", memberId as string)
            .order("submitted_at", { ascending: false })
            .limit(15),
        ]);

      if (e1) throw e1;
      if (e2) throw e2;

      const items: ActivityItem[] = [
        ...(completions ?? []).map((c: any) => ({
          id: `p-${c.id as string}`,
          type: "module_completed" as ActivityType,
          label: `Completed: ${(c.module as any)?.title ?? "a module"}`,
          date: c.completed_at as string,
        })),
        ...(subs ?? []).map((s: any): ActivityItem => {
          const title = (s.assignment as any)?.title ?? "assignment";
          if (s.status === "approved") {
            return {
              id: `s-${s.id as string}`,
              type: "assignment_approved",
              label: `Assignment approved — ${title}`,
              date: (s.reviewed_at ?? s.submitted_at) as string,
            };
          }
          if (s.status === "needs_improvement") {
            return {
              id: `s-${s.id as string}`,
              type: "assignment_needs_improvement",
              label: `Needs improvement — ${title}`,
              date: (s.reviewed_at ?? s.submitted_at) as string,
            };
          }
          return {
            id: `s-${s.id as string}`,
            type: "assignment_submitted",
            label: `Submitted: ${title}`,
            date: s.submitted_at as string,
          };
        }),
      ]
        .filter((i) => !!i.date)
        .sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
        )
        .slice(0, 12);

      return items;
    },
    enabled: !!memberId,
  });
}

// ─── Admin: member submissions with joined names ─────────────────────────────
export function useMemberSubmissions(memberId: string | null | undefined) {
  return useQuery({
    queryKey: ["submissions", "member-detail", memberId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assignment_submissions")
        .select(
          "*, assignment:assignment_id(title, module:module_id(title, order_index))"
        )
        .eq("member_id", memberId as string)
        .order("submitted_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!memberId,
  });
}
