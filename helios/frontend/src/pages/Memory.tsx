import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, type Memory as MemoryItem } from "@/lib/api";
import { Spinner } from "@/components/Spinner";

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
    <div className="flex-1 min-h-0 overflow-y-auto px-4 py-6">
      <h1 className="font-display font-bold text-2xl text-flotext mb-4">Memory</h1>
      <p className="text-sm text-grey mb-4">
        Facts Helios remembers about you. You can also just tell Helios in chat.
      </p>

      <form onSubmit={handleAdd} className="flex gap-2 mb-6">
        <input
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="e.g. My birthday is Jan 5"
          className="flex-1 px-3 py-2.5 rounded-lg border border-border focus:border-teal focus:outline-none"
        />
        <button
          type="submit"
          disabled={!content.trim() || submitting}
          className="px-4 py-2.5 rounded-lg bg-teal text-navy2 font-semibold hover:bg-teal2 transition-colors disabled:opacity-50 flex items-center gap-2"
        >
          {submitting && <Spinner className="w-4 h-4" />}
          Save
        </button>
      </form>

      {error && (
        <p className="text-sm text-red bg-red/5 border border-red/20 rounded-lg px-3 py-2 mb-4">
          {error}
        </p>
      )}

      {loading ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : memories.length === 0 ? (
        <p className="text-center text-grey text-sm py-10">
          No memories saved yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {memories.map((m) => (
            <li
              key={m.id}
              className="bg-white rounded-card border border-border px-4 py-3 flex items-center gap-3"
            >
              <p className="flex-1 text-sm text-flotext">{m.content}</p>
              <button
                onClick={() => handleDelete(m.id)}
                aria-label="Delete memory"
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
