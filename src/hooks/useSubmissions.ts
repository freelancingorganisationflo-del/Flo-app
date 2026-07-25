import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase, SUBMISSIONS_BUCKET } from "@/lib/supabase";
import type { AssignmentSubmission, SubmissionStatus } from "@/lib/types/database.types";

export function useMySubmissions(memberId: string | null | undefined) {
  return useQuery({
    queryKey: ["submissions", "mine", memberId],
    queryFn: async (): Promise<AssignmentSubmission[]> => {
      const { data, error } = await supabase
        .from("assignment_submissions")
        .select("*")
        .eq("member_id", memberId as string)
        .order("submitted_at", { ascending: false });
      if (error) throw error;
      return data as AssignmentSubmission[];
    },
    enabled: !!memberId,
  });
}

// Admin review queue — every submission, most recent first.
export function useAllSubmissions(statusFilter?: SubmissionStatus) {
  return useQuery({
    queryKey: ["submissions", "all", statusFilter ?? "all"],
    queryFn: async () => {
      let query = supabase
        .from("assignment_submissions")
        .select("*, profiles:member_id(full_name), assignments:assignment_id(title, module_id)")
        .order("submitted_at", { ascending: false });
      if (statusFilter) query = query.eq("status", statusFilter);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });
}

export function useSubmitAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { assignment_id: string; member_id: string; file: File }) => {
      const path = `${input.member_id}/${input.assignment_id}/${Date.now()}-${input.file.name}`;
      const { error: uploadError } = await supabase.storage
        .from(SUBMISSIONS_BUCKET)
        .upload(path, input.file);
      if (uploadError) throw uploadError;

      const { data: pub } = supabase.storage.from(SUBMISSIONS_BUCKET).getPublicUrl(path);

      const { error } = await supabase.from("assignment_submissions").insert({
        assignment_id: input.assignment_id,
        member_id: input.member_id,
        file_url: pub.publicUrl,
        file_type: input.file.type,
      });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["submissions", "mine", vars.member_id] });
      qc.invalidateQueries({ queryKey: ["submissions", "all"] });
    },
  });
}

export function useReviewSubmission() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; status: SubmissionStatus; feedback: string; reviewed_by: string }) => {
      const { error } = await supabase
        .from("assignment_submissions")
        .update({
          status: input.status,
          feedback: input.feedback,
          reviewed_by: input.reviewed_by,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["submissions"] });
      qc.invalidateQueries({ queryKey: ["progress"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}
