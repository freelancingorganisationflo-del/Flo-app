import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Notification } from "@/lib/types/database.types";

export function useNotifications(userId: string | null | undefined) {
  return useQuery({
    queryKey: ["notifications", userId],
    queryFn: async (): Promise<Notification[]> => {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", userId as string)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as Notification[];
    },
    enabled: !!userId,
    refetchInterval: 60_000,
  });
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("notifications").update({ read: true }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
}

export function useSendNotification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { user_id: string; type: Notification["type"]; title: string; message: string }) => {
      const { error } = await supabase.from("notifications").insert(input);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
}
