// Hand-written types mirroring supabase/schema.sql.
// If you evolve the schema, run `supabase gen types typescript` for the
// generated version and swap it in — this file is a solid manual starting
// point so the app is fully typed even before that step.

export type Role = "admin" | "member";
export type MemberStatus = "active" | "at_risk" | "inactive";
export type ProgressStatus = "locked" | "unlocked" | "completed";
export type SubmissionStatus = "pending" | "approved" | "needs_improvement" | "rejected";
export type NotificationType =
  | "new_lecture"
  | "assignment_feedback"
  | "module_unlocked"
  | "weekly_reminder"
  | "general";
export type ResourceCategory =
  | "ai_tools"
  | "templates"
  | "fonts"
  | "icons"
  | "prompt_library"
  | "websites";

export interface Skill {
  id: string;
  slug: string;
  label: string;
  icon: string | null;
  tools: string | null;
  description: string | null;
  member_capacity: number;
  order_index: number;
  created_at: string;
}

export interface Profile {
  id: string;
  full_name: string;
  role: Role;
  skill_id: string | null;
  phone: string | null;
  avatar_url: string | null;
  status: MemberStatus;
  joined_at: string;
  created_at: string;
  // Extended columns — require supabase/profile_extras.sql to be applied.
  bio?: string | null;
  instagram?: string | null;
  linkedin?: string | null;
  github?: string | null;
}

export interface Module {
  id: string;
  skill_id: string;
  title: string;
  description: string | null;
  order_index: number;
  created_at: string;
}

export interface Lecture {
  id: string;
  module_id: string;
  title: string;
  video_url: string | null;
  order_index: number;
  created_at: string;
}

export interface Note {
  id: string;
  module_id: string;
  title: string;
  content: string | null;
  file_url: string | null;
  order_index: number;
  created_at: string;
}

export interface Assignment {
  id: string;
  module_id: string;
  title: string;
  instructions: string | null;
  created_at: string;
}

export interface AssignmentSubmission {
  id: string;
  assignment_id: string;
  member_id: string;
  file_url: string;
  file_type: string | null;
  status: SubmissionStatus;
  feedback: string | null;
  submitted_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
}

export interface LearningProgress {
  id: string;
  member_id: string;
  module_id: string;
  status: ProgressStatus;
  unlocked_at: string | null;
  completed_at: string | null;
}

export interface WeeklyCheckin {
  id: string;
  member_id: string;
  week_number: number;
  what_learned: string | null;
  what_completed: string | null;
  problems_faced: string | null;
  admin_feedback: string | null;
  submitted_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  message: string | null;
  read: boolean;
  created_at: string;
}

export interface Resource {
  id: string;
  category: ResourceCategory;
  title: string;
  url: string | null;
  description: string | null;
  created_at: string;
}

export interface LeaderboardRow {
  member_id: string;
  full_name: string;
  skill_id: string;
  skill_label: string;
  completed_modules: number;
  approved_assignments: number;
  score: number;
  skill_rank: number;
}
