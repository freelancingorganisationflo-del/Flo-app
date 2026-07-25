import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Module } from "@/lib/types/database.types";

export function useModules(skillId: string | null | undefined) {
  return useQuery({
    queryKey: ["modules", skillId],
    queryFn: async (): Promise<Module[]> => {
      const { data, error } = await supabase
        .from("modules")
        .select("*")
        .eq("skill_id", skillId as string)
        .order("order_index");
      if (error) throw error;
      return data as Module[];
    },
    enabled: !!skillId,
  });
}

export function useModule(moduleId: string | null | undefined) {
  return useQuery({
    queryKey: ["module", moduleId],
    queryFn: async (): Promise<Module> => {
      const { data, error } = await supabase.from("modules").select("*").eq("id", moduleId as string).single();
      if (error) throw error;
      return data as Module;
    },
    enabled: !!moduleId,
  });
}

export function useCreateModule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { skill_id: string; title: string; description: string; order_index: number }) => {
      const { error } = await supabase.from("modules").insert(input);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => qc.invalidateQueries({ queryKey: ["modules", vars.skill_id] }),
  });
}
