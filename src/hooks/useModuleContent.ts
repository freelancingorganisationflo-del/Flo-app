import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Assignment, Lecture, Note } from "@/lib/types/database.types";

export function useLectures(moduleId: string | null | undefined) {
  return useQuery({
    queryKey: ["lectures", moduleId],
    queryFn: async (): Promise<Lecture[]> => {
      const { data, error } = await supabase
        .from("lectures")
        .select("*")
        .eq("module_id", moduleId as string)
        .order("order_index");
      if (error) throw error;
      return data as Lecture[];
    },
    enabled: !!moduleId,
  });
}

export function useNotes(moduleId: string | null | undefined) {
  return useQuery({
    queryKey: ["notes", moduleId],
    queryFn: async (): Promise<Note[]> => {
      const { data, error } = await supabase
        .from("notes")
        .select("*")
        .eq("module_id", moduleId as string)
        .order("order_index");
      if (error) throw error;
      return data as Note[];
    },
    enabled: !!moduleId,
  });
}

export function useAssignment(moduleId: string | null | undefined) {
  return useQuery({
    queryKey: ["assignment", moduleId],
    queryFn: async (): Promise<Assignment | null> => {
      const { data, error } = await supabase
        .from("assignments")
        .select("*")
        .eq("module_id", moduleId as string)
        .maybeSingle();
      if (error) throw error;
      return data as Assignment | null;
    },
    enabled: !!moduleId,
  });
}

export function useCreateLecture() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { module_id: string; title: string; video_url: string; order_index: number }) => {
      const { error } = await supabase.from("lectures").insert(input);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ["lectures", vars.module_id] }),
  });
}

export function useCreateNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { module_id: string; title: string; content: string; order_index: number }) => {
      const { error } = await supabase.from("notes").insert(input);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ["notes", vars.module_id] }),
  });
}

export function useUpsertAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { module_id: string; title: string; instructions: string }) => {
      const { error } = await supabase.from("assignments").upsert(input, { onConflict: "module_id" });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ["assignment", vars.module_id] }),
  });
}
