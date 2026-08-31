import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, type Memory as MemoryItem } from "@/lib/api";
import { Spinner } from "@/components/Spinner";
import { Icon } from "@/components/Icon";

export function Memory() {
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.listMemories();
      setMemories(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load memories");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (!content.trim() || submitting) return;
    setSubmitting(true);
    try {
      await api.addMemory(content.trim());
      setContent("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save memory");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: number) {
    try {
      await api.deleteMemory(id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete memory");
    }
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto scrollbar-slim">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 py-6">
        <div className="flex items-center gap-3 mb-1 animate-fade-up">
          <Icon name="brain" className="w-6 h-6 text-violet" />
          <h1 className="font-display font-bold text-2xl sm:text-3xl text-ink">Memory</h1>
        </div>
        <p className="text-sm text-grey mb-6 animate-fade-up">
          Facts HELIOS remembers about you. You can also just tell HELIOS in chat.
        </p>

        <form onSubmit={handleAdd} className="flex gap-2 mb-6 animate-fade-up" style={{ animationDelay: "60ms" }}>
          <input
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="e.g. My birthday is Jan 5"
            className="input-dark flex-1"
          />
          <button
            type="submit"
            disabled={!content.trim() || submitting}
            className="btn-primary flex items-center gap-2"
          >
            {submitting && <Spinner className="w-4 h-4" />}
            Save
          </button>
        </form>

        {error && (
          <p className="text-sm text-red glass border-red/30 rounded-lg px-3 py-2 mb-4 animate-fade-in">
            {error}
          </p>
        )}

        {loading ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : memories.length === 0 ? (
          <div className="text-center text-grey text-sm py-12 animate-fade-in">
            <Icon name="brain" className="w-8 h-8 mx-auto mb-3 text-faint" />
            No memories saved yet.
          </div>
        ) : (
          <ul className="space-y-2 animate-fade-in">
            {memories.map((m) => (
              <li
                key={m.id}
                className="glass rounded-2xl px-4 py-3.5 flex items-center gap-3 hover:border-violet/30 transition-all"
              >
                <span className="w-2 h-2 rounded-full bg-violet shadow-glow-violet shrink-0" />
                <p className="flex-1 text-sm text-ink leading-relaxed">{m.content}</p>
                <button
                  onClick={() => handleDelete(m.id)}
                  aria-label="Delete memory"
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
