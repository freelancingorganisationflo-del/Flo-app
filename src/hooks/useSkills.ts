import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Skill } from "@/lib/types/database.types";

export function useSkills() {
  return useQuery({
    queryKey: ["skills"],
    queryFn: async (): Promise<Skill[]> => {
      const { data, error } = await supabase.from("skills").select("*").order("order_index");
      if (error) throw error;
      return data as Skill[];
    },
  });
}
