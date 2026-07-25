import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { LeaderboardRow } from "@/lib/types/database.types";

export function useLeaderboard(skillId?: string | null) {
  return useQuery({
    queryKey: ["leaderboard", skillId ?? "mine"],
    queryFn: async (): Promise<LeaderboardRow[]> => {
      const { data, error } = await supabase.rpc("get_leaderboard", { p_skill_id: skillId ?? null });
      if (error) throw error;
      return data as LeaderboardRow[];
    },
  });
}
