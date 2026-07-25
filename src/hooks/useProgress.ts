import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { LearningProgress } from "@/lib/types/database.types";

// The member's own progress across every module of their skill — drives the
// roadmap (completed / current / locked) and gates content + assignment upload.
export function useMyProgress(memberId: string | null | undefined) {
  return useQuery({
    queryKey: ["progress", memberId],
    queryFn: async (): Promise<LearningProgress[]> => {
      const { data, error } = await supabase
        .from("learning_progress")
        .select("*")
        .eq("member_id", memberId as string);
      if (error) throw error;
      return data as LearningProgress[];
    },
    enabled: !!memberId,
  });
}

export function useMemberProgress(memberId: string | null | undefined) {
  return useMyProgress(memberId);
}
