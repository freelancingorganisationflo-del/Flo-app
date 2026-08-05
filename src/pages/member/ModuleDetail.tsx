import { useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useModule } from "@/hooks/useModules";
import { useAssignment, useLectures, useNotes } from "@/hooks/useModuleContent";
import { useMyProgress } from "@/hooks/useProgress";
import { useMySubmissions, useSubmitAssignment } from "@/hooks/useSubmissions";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageSpinner } from "@/components/ui/Spinner";
import { VideoPlayer } from "@/components/ui/VideoPlayer";
import { PlaylistLectures } from "@/components/ui/PlaylistLectures";
import { getYouTubePlaylistId, isYouTubeConfigured } from "@/lib/youtube";

const statusTone = {
  pending: "orange",
  approved: "green",
  needs_improvement: "orange",
  rejected: "red",
} as const;

const statusLabel = {
  pending: "Pending review",
  approved: "Approved",
  needs_improvement: "Needs improvement",
  rejected: "Rejected",
} as const;

export function ModuleDetail() {
  const { moduleId } = useParams<{ moduleId: string }>();
  const { profile } = useAuth();
  const { data: module_, isLoading: moduleLoading } = useModule(moduleId);
  const { data: lectures = [] } = useLectures(moduleId);
  const { data: notes = [] } = useNotes(moduleId);
  const { data: assignment } = useAssignment(moduleId);
  const { data: progress = [] } = useMyProgress(profile?.id);
  const { data: submissions = [] } = useMySubmissions(profile?.id);
  const submit = useSubmitAssignment();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  if (moduleLoading || !module_) return <PageSpinner />;

  const myStatus = progress.find((p) => p.module_id === moduleId)?.status ?? "locked";
  const mySubmissions = assignment ? submissions.filter((s) => s.assignment_id === assignment.id) : [];
  const latestSubmission = mySubmissions[0];

  if (myStatus === "locked") {
    return (
      <div>
        <SectionHeader title={module_.title} sub="This module is still locked." />
        <EmptyState icon="🔒" title="Complete the previous module first" description="Once your last assignment is approved, this unlocks automatically." />
      </div>
    );
  }

  async function handleUpload() {
    const file = fileRef.current?.files?.[0];
    if (!file || !assignment || !profile) return;
    setUploadError(null);
    try {
      await submit.mutateAsync({ assignment_id: assignment.id, member_id: profile.id, file });
      if (fileRef.current) fileRef.current.value = "";
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    }
  }

  return (
    <div>
      <Link to="/learning" className="mb-3 inline-block text-[12px] font-semibold text-grey hover:text-navy">
        ← Back to roadmap
      </Link>
      <SectionHeader title={module_.title} sub={module_.description ?? undefined} />

      <div className="space-y-5">
        {/* Video lectures */}
        <Card>
          <div className="mb-3 text-[12px] font-bold uppercase tracking-wide text-teal">Video lecture</div>
          {lectures.length === 0 ? (
            <div className="text-[13px] text-grey">No lecture uploaded for this module yet.</div>
          ) : (
            <div className="space-y-3">
              {lectures.map((l) => (
                <div key={l.id}>
                  <div className="mb-2 text-[13px] font-semibold text-navy">{l.title}</div>
                  {l.video_url &&
                    (isYouTubeConfigured && getYouTubePlaylistId(l.video_url) ? (
                      <PlaylistLectures playlistId={getYouTubePlaylistId(l.video_url)!} url={l.video_url} title={l.title} />
                    ) : (
                      <VideoPlayer url={l.video_url} title={l.title} />
                    ))}
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Notes */}
        <Card>
          <div className="mb-3 text-[12px] font-bold uppercase tracking-wide text-teal">Notes</div>
          {notes.length === 0 ? (
            <div className="text-[13px] text-grey">No notes added yet.</div>
          ) : (
            <div className="space-y-4">
              {notes.map((n) => (
                <div key={n.id}>
                  <div className="text-[13px] font-semibold text-navy">{n.title}</div>
                  {n.content && <p className="mt-1 whitespace-pre-wrap text-[13px] text-grey">{n.content}</p>}
                  {n.file_url && (
                    <a href={n.file_url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-[12px] font-semibold text-teal underline">
                      Open attachment ↗
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Assignment */}
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <div className="text-[12px] font-bold uppercase tracking-wide text-teal">Assignment</div>
            {latestSubmission && <Badge label={statusLabel[latestSubmission.status]} tone={statusTone[latestSubmission.status]} />}
          </div>

          {!assignment ? (
            <div className="text-[13px] text-grey">No assignment set for this module yet.</div>
          ) : (
            <>
              <div className="mb-1 text-[13px] font-semibold text-navy">{assignment.title}</div>
              {assignment.instructions && <p className="mb-4 text-[13px] text-grey">{assignment.instructions}</p>}

              {latestSubmission?.feedback && (
                <div className="mb-4 rounded-lg border border-border bg-light px-3 py-2 text-[13px] text-navy">
                  <span className="font-semibold">Admin feedback: </span>
                  {latestSubmission.feedback}
                </div>
              )}

              {latestSubmission?.status === "approved" ? (
                <div className="text-[13px] font-semibold text-green">✓ Approved — next module unlocked.</div>
              ) : (
                <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
                  <input ref={fileRef} type="file" accept=".pdf,.zip,image/*,video/*" className="w-full text-[13px] sm:w-auto" />
                  <Button onClick={() => void handleUpload()} disabled={submit.isPending} className="sm:w-auto">
                    {submit.isPending ? "Uploading…" : latestSubmission ? "Resubmit" : "Submit assignment"}
                  </Button>
                </div>
              )}
              {uploadError && <div className="mt-2 text-[12px] text-red">{uploadError}</div>}
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
