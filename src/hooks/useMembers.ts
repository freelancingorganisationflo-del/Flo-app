import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Profile } from "@/lib/types/database.types";

// Admin-only: full member roster.
export function useMembers() {
  return useQuery({
    queryKey: ["members"],
    queryFn: async (): Promise<Profile[]> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("role", "member")
        .order("full_name");
      if (error) throw error;
      return data as Profile[];
    },
  });
}

export function useAssignMemberSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { memberId: string; skillId: string }) => {
      const { error } = await supabase.from("profiles").update({ skill_id: input.skillId }).eq("id", input.memberId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["members"] });
      qc.invalidateQueries({ queryKey: ["progress"] });
    },
  });
}

export function useUpdateMemberStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { memberId: string; status: Profile["status"] }) => {
      const { error } = await supabase.from("profiles").update({ status: input.status }).eq("id", input.memberId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["members"] }),
  });
}
