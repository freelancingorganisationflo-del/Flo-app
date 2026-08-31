import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, type Task } from "@/lib/api";
import { Spinner } from "@/components/Spinner";
import { Icon } from "@/components/Icon";

type Filter = "all" | "pending" | "done" | "cancelled";

const priorityColor: Record<string, string> = {
  high: "bg-red/10 text-red border-red/30",
  medium: "bg-amber/10 text-amber border-amber/30",
  low: "bg-mint/10 text-mint border-mint/30",
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
    <div className="flex-1 min-h-0 overflow-y-auto scrollbar-slim">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 py-6">
        <div className="flex items-center gap-3 mb-1 animate-fade-up">
          <Icon name="tasks" className="w-6 h-6 text-cyan" />
          <h1 className="font-display font-bold text-2xl sm:text-3xl text-ink">Tasks</h1>
        </div>
        <p className="text-sm text-grey mb-6 animate-fade-up">
          Keep your priorities in orbit. HELIOS can add these from chat too.
        </p>

        <form
          onSubmit={handleCreate}
          className="glass rounded-2xl p-4 mb-6 space-y-3 animate-fade-up"
          style={{ animationDelay: "60ms" }}
        >
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="New task… (e.g. finish report)"
              className="input-dark flex-1"
            />
            <div className="flex gap-3">
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="input-dark bg-navy3 w-auto"
              >
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
              <input
                type="datetime-local"
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
                className="input-dark [color-scheme:dark]"
              />
              <button
                type="submit"
                disabled={!title.trim() || submitting}
                className="btn-primary flex items-center gap-2"
              >
                {submitting && <Spinner className="w-4 h-4" />}
                Add
              </button>
            </div>
          </div>
        </form>

        <div className="flex gap-2 mb-4 animate-fade-up" style={{ animationDelay: "100ms" }}>
          {(["all", "pending", "done", "cancelled"] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-full text-sm font-semibold capitalize transition-all ${
                filter === f
                  ? "bg-gradient-to-r from-cyan to-blue text-navy shadow-glow-sm"
                  : "glass text-grey hover:text-ink hover:border-cyan/30"
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        {error && (
          <p className="text-sm text-red glass border-red/30 rounded-lg px-3 py-2 mb-4 animate-fade-in">
            {error}
          </p>
        )}

        {loading ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : tasks.length === 0 ? (
          <div className="text-center text-grey text-sm py-12 animate-fade-in">
            <Icon name="tasks" className="w-8 h-8 mx-auto mb-3 text-faint" />
            No {filter === "all" ? "" : `${filter} `}tasks yet.
          </div>
        ) : (
          <ul className="space-y-2 animate-fade-in">
            {tasks.map((t) => (
              <li
                key={t.id}
                className="glass rounded-2xl px-4 py-3 flex items-center gap-3 hover:border-cyan/25 transition-all"
              >
                <button
                  onClick={() => handleComplete(t.id)}
                  aria-label={t.status === "done" ? "Task completed" : "Mark as done"}
                  className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs transition-all ${
                    t.status === "done"
                      ? "bg-gradient-to-br from-cyan to-blue border-transparent text-navy shadow-glow-sm"
                      : "border-grey/50 hover:border-cyan hover:shadow-glow-sm"
                  }`}
                >
                  {t.status === "done" ? "✓" : ""}
                </button>
                <div className="flex-1 min-w-0">
                  <p
                    className={`font-medium truncate ${
                      t.status === "done" ? "line-through text-faint" : "text-ink"
                    }`}
                  >
                    {t.title}
                  </p>
                  <div className="flex flex-wrap items-center gap-2 mt-1.5">
                    <span className={`chip ${priorityColor[t.priority] ?? priorityColor.medium}`}>
                      {t.priority}
                    </span>
                    {t.reminder_at && (
                      <span className="text-[11px] text-amber flex items-center gap-1">
                        <Icon name="bell" className="w-3 h-3" />
                        {formatDate(t.reminder_at)}
                      </span>
                    )}
                    {t.due_at && (
                      <span className="text-[11px] text-grey flex items-center gap-1">
                        <Icon name="clock" className="w-3 h-3" />
                        Due {formatDate(t.due_at)}
                      </span>
                    )}
                    {t.recurrence && (
                      <span className="text-[11px] text-mint">
                        Repeats {String((t.recurrence as { freq?: string }).freq ?? "every")}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(t.id)}
                  aria-label="Delete task"
                  className="text-faint hover:text-red px-2 py-1 rounded-lg hover:bg-red/10 transition-colors text-sm"
                >
                  <Icon name="trash" className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
