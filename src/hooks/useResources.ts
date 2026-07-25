import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Resource, ResourceCategory } from "@/lib/types/database.types";

export function useResources() {
  return useQuery({
    queryKey: ["resources"],
    queryFn: async (): Promise<Resource[]> => {
      const { data, error } = await supabase.from("resources").select("*").order("category");
      if (error) throw error;
      return data as Resource[];
    },
  });
}

export function useCreateResource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { category: ResourceCategory; title: string; url: string; description: string }) => {
      const { error } = await supabase.from("resources").insert(input);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["resources"] }),
  });
}

export function useDeleteResource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("resources").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["resources"] }),
  });
}
