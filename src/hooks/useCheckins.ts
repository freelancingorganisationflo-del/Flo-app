import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { WeeklyCheckin } from "@/lib/types/database.types";

export function useMyCheckins(memberId: string | null | undefined) {
  return useQuery({
    queryKey: ["checkins", "mine", memberId],
    queryFn: async (): Promise<WeeklyCheckin[]> => {
      const { data, error } = await supabase
        .from("weekly_checkins")
        .select("*")
        .eq("member_id", memberId as string)
        .order("week_number", { ascending: false });
      if (error) throw error;
      return data as WeeklyCheckin[];
    },
    enabled: !!memberId,
  });
}

export function useAllCheckins() {
  return useQuery({
    queryKey: ["checkins", "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("weekly_checkins")
        .select("*, profiles:member_id(full_name)")
        .order("submitted_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useSubmitCheckin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      member_id: string;
      week_number: number;
      what_learned: string;
      what_completed: string;
      problems_faced: string;
    }) => {
      const { error } = await supabase.from("weekly_checkins").insert(input);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["checkins", "mine", vars.member_id] });
      qc.invalidateQueries({ queryKey: ["checkins", "all"] });
    },
  });
}

export function useReviewCheckin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; admin_feedback: string }) => {
      const { error } = await supabase
        .from("weekly_checkins")
        .update({ admin_feedback: input.admin_feedback })
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["checkins"] }),
  });
}
