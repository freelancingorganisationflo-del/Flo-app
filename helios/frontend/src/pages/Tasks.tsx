import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, type Task } from "@/lib/api";
import { Spinner } from "@/components/Spinner";

type Filter = "all" | "pending" | "done" | "cancelled";

const priorityColor: Record<string, string> = {
  high: "bg-red/10 text-red border-red/20",
  medium: "bg-orange/10 text-orange border-orange/20",
  low: "bg-teal/10 text-teal2 border-teal/20",
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function Tasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState("medium");
  const [dueAt, setDueAt] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async (status?: string) => {
    setLoading(true);
    try {
      const data = await api.listTasks(status);
      setTasks(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load tasks");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(filter === "all" ? undefined : filter);
  }, [filter, load]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!title.trim() || submitting) return;
    setSubmitting(true);
    try {
      await api.createTask({
        title: title.trim(),
        priority,
        ...(dueAt ? { due_at: new Date(dueAt).toISOString() } : {}),
      });
      setTitle("");
      setDueAt("");
      setPriority("medium");
      await load(filter === "all" ? undefined : filter);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create task");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleComplete(id: number) {
    try {
      await api.completeTask(id);
      await load(filter === "all" ? undefined : filter);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update task");
    }
  }

  async function handleDelete(id: number) {
    try {
      await api.deleteTask(id);
      await load(filter === "all" ? undefined : filter);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete task");
    }
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto px-4 py-6">
      <h1 className="font-display font-bold text-2xl text-flotext mb-4">Tasks</h1>

      <form
        onSubmit={handleCreate}
        className="bg-white rounded-card border border-border p-4 mb-6 space-y-3"
      >
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="New task… (e.g. finish report)"
            className="flex-1 px-3 py-2.5 rounded-lg border border-border focus:border-teal focus:outline-none"
          />
          <div className="flex gap-3">
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="px-3 py-2.5 rounded-lg border border-border focus:border-teal focus:outline-none bg-white"
            >
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
            <input
              type="datetime-local"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
              className="px-3 py-2.5 rounded-lg border border-border focus:border-teal focus:outline-none"
            />
            <button
              type="submit"
              disabled={!title.trim() || submitting}
              className="px-4 py-2.5 rounded-lg bg-teal text-navy2 font-semibold hover:bg-teal2 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {submitting && <Spinner className="w-4 h-4" />}
              Add
            </button>
          </div>
        </div>
      </form>

      <div className="flex gap-2 mb-4">
        {(["all", "pending", "done", "cancelled"] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-full text-sm font-semibold capitalize transition-colors ${
              filter === f
                ? "bg-teal text-navy2"
                : "bg-white border border-border text-grey hover:text-flotext"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {error && (
        <p className="text-sm text-red bg-red/5 border border-red/20 rounded-lg px-3 py-2 mb-4">
          {error}
        </p>
      )}

      {loading ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : tasks.length === 0 ? (
        <p className="text-center text-grey text-sm py-10">
          No {filter === "all" ? "" : `${filter} `}tasks yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {tasks.map((t) => (
            <li
              key={t.id}
              className="bg-white rounded-card border border-border px-4 py-3 flex items-center gap-3"
            >
              <button
                onClick={() => handleComplete(t.id)}
                aria-label={t.status === "done" ? "Task completed" : "Mark as done"}
                className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs transition-colors ${
                  t.status === "done"
                    ? "bg-teal border-teal text-navy2"
                    : "border-grey/40 hover:border-teal"
                }`}
              >
                {t.status === "done" ? "✓" : ""}
              </button>
              <div className="flex-1 min-w-0">
                <p
                  className={`font-medium truncate ${
                    t.status === "done" ? "line-through text-grey" : "text-flotext"
                  }`}
                >
                  {t.title}
                </p>
                <div className="flex flex-wrap items-center gap-2 mt-1">
                  <span
                    className={`text-[11px] px-2 py-0.5 rounded-full border font-semibold ${
                      priorityColor[t.priority] ?? priorityColor.medium
                    }`}
                  >
                    {t.priority}
                  </span>
                  {t.reminder_at && (
                    <span className="text-[11px] text-orange">
                      Reminder: {formatDate(t.reminder_at)}
                    </span>
                  )}
                  {t.due_at && (
                    <span className="text-[11px] text-grey">Due: {formatDate(t.due_at)}</span>
                  )}
                  {t.recurrence && (
                    <span className="text-[11px] text-teal2">
                      Repeats {String((t.recurrence as { freq?: string }).freq ?? "every")}
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={() => handleDelete(t.id)}
                aria-label="Delete task"
                className="text-grey hover:text-red px-2 py-1 rounded-lg hover:bg-red/5 transition-colors text-sm"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
