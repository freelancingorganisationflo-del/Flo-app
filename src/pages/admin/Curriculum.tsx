import { useEffect, useState } from "react";
import { useSkills } from "@/hooks/useSkills";
import { useModules, useCreateModule } from "@/hooks/useModules";
import {
  useAssignment,
  useCreateLecture,
  useCreateNote,
  useLectures,
  useNotes,
  useUpsertAssignment,
} from "@/hooks/useModuleContent";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input, Label, Textarea } from "@/components/ui/FormField";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageSpinner } from "@/components/ui/Spinner";

export function AdminCurriculum() {
  const { data: skills = [], isLoading: skillsLoading } = useSkills();
  const [selectedSkill, setSelectedSkill] = useState<string | null>(null);
  const [selectedModule, setSelectedModule] = useState<string | null>(null);
  const [moduleModalOpen, setModuleModalOpen] = useState(false);

  const activeSkillId = selectedSkill ?? skills[0]?.id ?? null;
  const { data: modules = [], isLoading: modulesLoading } = useModules(activeSkillId);
  const activeModuleId = selectedModule ?? modules[0]?.id ?? null;

  if (skillsLoading) return <PageSpinner />;
  if (skills.length === 0) {
    return (
      <div>
        <SectionHeader title="Curriculum" sub="Build out modules, lectures, notes, and assignments per skill." />
        <EmptyState icon="🎯" title="No skills yet" description="Run supabase/seed.sql, or add skills directly in the Supabase table editor to get started." />
      </div>
    );
  }

  const activeModule = modules.find((m) => m.id === activeModuleId);

  return (
    <div>
      <SectionHeader title="Curriculum" sub="Build out modules, lectures, notes, and assignments per skill." />

      {/* Skill tabs */}
      <div className="mb-5 flex flex-wrap gap-2">
        {skills.map((s) => (
          <button
            key={s.id}
            onClick={() => {
              setSelectedSkill(s.id);
              setSelectedModule(null);
            }}
            className={`rounded-[10px] px-4 py-2 text-[13px] font-bold transition-colors ${
              activeSkillId === s.id ? "bg-navy text-teal" : "bg-light text-grey hover:text-navy"
            }`}
          >
            {s.icon} {s.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[280px_1fr]">
        {/* Module list */}
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <div className="text-[12px] font-bold uppercase tracking-wide text-teal">Modules</div>
            <button onClick={() => setModuleModalOpen(true)} className="text-[12px] font-bold text-teal">
              + Add
            </button>
          </div>
          {modulesLoading ? (
            <PageSpinner />
          ) : modules.length === 0 ? (
            <div className="text-[13px] text-grey">No modules yet.</div>
          ) : (
            <div className="space-y-1">
              {modules.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setSelectedModule(m.id)}
                  className={`block w-full rounded-lg px-3 py-2 text-left text-[13px] transition-colors ${
                    activeModuleId === m.id ? "bg-tealDim font-bold text-teal" : "text-navy hover:bg-light"
                  }`}
                >
                  {m.order_index}. {m.title}
                </button>
              ))}
            </div>
          )}
        </Card>

        {/* Module editor */}
        {activeModule ? (
          <ModuleEditor key={activeModule.id} moduleId={activeModule.id} moduleTitle={activeModule.title} />
        ) : (
          <EmptyState icon="📚" title="No module selected" description="Add a module to start building this skill's curriculum." />
        )}
      </div>

      {moduleModalOpen && activeSkillId && (
        <AddModuleModal skillId={activeSkillId} nextOrder={modules.length + 1} onClose={() => setModuleModalOpen(false)} />
      )}
    </div>
  );
}

function AddModuleModal({ skillId, nextOrder, onClose }: { skillId: string; nextOrder: number; onClose: () => void }) {
  const createModule = useCreateModule();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  async function handleSubmit() {
    if (!title.trim()) return;
    await createModule.mutateAsync({ skill_id: skillId, title, description, order_index: nextOrder });
    onClose();
  }

  return (
    <Modal open onClose={onClose} title="New module" subtitle={`Module ${nextOrder}`}>
      <div className="space-y-4">
        <div>
          <Label>Title</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <Label>Description</Label>
          <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="flex gap-3">
          <Button onClick={() => void handleSubmit()} disabled={createModule.isPending} className="flex-1">
            {createModule.isPending ? "Creating…" : "Create module"}
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function ModuleEditor({ moduleId, moduleTitle }: { moduleId: string; moduleTitle: string }) {
  const { data: lectures = [] } = useLectures(moduleId);
  const { data: notes = [] } = useNotes(moduleId);
  const { data: assignment } = useAssignment(moduleId);
  const createLecture = useCreateLecture();
  const createNote = useCreateNote();
  const upsertAssignment = useUpsertAssignment();

  const [lectureModal, setLectureModal] = useState(false);
  const [noteModal, setNoteModal] = useState(false);
  const [lectureTitle, setLectureTitle] = useState("");
  const [lectureUrl, setLectureUrl] = useState("");
  const [noteTitle, setNoteTitle] = useState("");
  const [noteContent, setNoteContent] = useState("");
  const [assignmentTitle, setAssignmentTitle] = useState(assignment?.title ?? "");
  const [assignmentInstructions, setAssignmentInstructions] = useState(assignment?.instructions ?? "");

  useEffect(() => {
    setAssignmentTitle(assignment?.title ?? "");
    setAssignmentInstructions(assignment?.instructions ?? "");
  }, [assignment?.title, assignment?.instructions]);

  return (
    <div className="space-y-5">
      <Card>
        <div className="mb-1 text-[15px] font-bold text-navy">{moduleTitle}</div>
        <div className="text-[12px] text-grey">Manage the lecture, notes, and assignment for this module.</div>
      </Card>

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <div className="text-[12px] font-bold uppercase tracking-wide text-teal">Lectures</div>
          <button onClick={() => setLectureModal(true)} className="text-[12px] font-bold text-teal">+ Add</button>
        </div>
        {lectures.length === 0 ? (
          <div className="text-[13px] text-grey">No lecture yet.</div>
        ) : (
          lectures.map((l) => (
            <div key={l.id} className="border-b border-border py-2 text-[13px] last:border-none">
              <span className="font-semibold text-navy">{l.title}</span>{" "}
              {l.video_url && <a href={l.video_url} className="text-teal underline" target="_blank" rel="noreferrer">link</a>}
            </div>
          ))
        )}
      </Card>

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <div className="text-[12px] font-bold uppercase tracking-wide text-teal">Notes</div>
          <button onClick={() => setNoteModal(true)} className="text-[12px] font-bold text-teal">+ Add</button>
        </div>
        {notes.length === 0 ? (
          <div className="text-[13px] text-grey">No notes yet.</div>
        ) : (
          notes.map((n) => (
            <div key={n.id} className="border-b border-border py-2 text-[13px] last:border-none">
              <span className="font-semibold text-navy">{n.title}</span>
            </div>
          ))
        )}
      </Card>

      <Card>
        <div className="mb-3 text-[12px] font-bold uppercase tracking-wide text-teal">Assignment</div>
        <div className="space-y-3">
          <div>
            <Label>Title</Label>
            <Input value={assignmentTitle} onChange={(e) => setAssignmentTitle(e.target.value)} />
          </div>
          <div>
            <Label>Instructions</Label>
            <Textarea rows={3} value={assignmentInstructions} onChange={(e) => setAssignmentInstructions(e.target.value)} />
          </div>
          <Button
            onClick={() =>
              upsertAssignment.mutate({ module_id: moduleId, title: assignmentTitle, instructions: assignmentInstructions })
            }
            disabled={!assignmentTitle.trim() || upsertAssignment.isPending}
          >
            {upsertAssignment.isPending ? "Saving…" : assignment ? "Update assignment" : "Create assignment"}
          </Button>
        </div>
      </Card>

      {lectureModal && (
        <Modal open onClose={() => setLectureModal(false)} title="Add lecture">
          <div className="space-y-4">
            <div>
              <Label>Title</Label>
              <Input value={lectureTitle} onChange={(e) => setLectureTitle(e.target.value)} />
            </div>
            <div>
              <Label>Video URL</Label>
              <Input value={lectureUrl} onChange={(e) => setLectureUrl(e.target.value)} placeholder="https://…" />
            </div>
            <div className="flex gap-3">
              <Button
                className="flex-1"
                onClick={async () => {
                  await createLecture.mutateAsync({ module_id: moduleId, title: lectureTitle, video_url: lectureUrl, order_index: lectures.length + 1 });
                  setLectureTitle("");
                  setLectureUrl("");
                  setLectureModal(false);
                }}
                disabled={!lectureTitle.trim() || createLecture.isPending}
              >
                Add
              </Button>
              <Button variant="secondary" onClick={() => setLectureModal(false)}>Cancel</Button>
            </div>
          </div>
        </Modal>
      )}

      {noteModal && (
        <Modal open onClose={() => setNoteModal(false)} title="Add note">
          <div className="space-y-4">
            <div>
              <Label>Title</Label>
              <Input value={noteTitle} onChange={(e) => setNoteTitle(e.target.value)} />
            </div>
            <div>
              <Label>Content</Label>
              <Textarea rows={4} value={noteContent} onChange={(e) => setNoteContent(e.target.value)} />
            </div>
            <div className="flex gap-3">
              <Button
                className="flex-1"
                onClick={async () => {
                  await createNote.mutateAsync({ module_id: moduleId, title: noteTitle, content: noteContent, order_index: notes.length + 1 });
                  setNoteTitle("");
                  setNoteContent("");
                  setNoteModal(false);
                }}
                disabled={!noteTitle.trim() || createNote.isPending}
              >
                Add
              </Button>
              <Button variant="secondary" onClick={() => setNoteModal(false)}>Cancel</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
