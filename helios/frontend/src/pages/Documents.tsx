import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { api, type Document, type SearchResult } from "@/lib/api";
import { Spinner } from "@/components/Spinner";

const typeColor: Record<string, string> = {
  file: "bg-teal/10 text-teal2 border-teal/20",
  url: "bg-orange/10 text-orange border-orange/20",
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function Documents() {
  const [docs, setDocs] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [url, setUrl] = useState("");
  const [ingesting, setIngesting] = useState(false);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.listDocuments();
      setDocs(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load documents");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || uploading) return;
    setUploading(true);
    setError(null);
    try {
      await api.uploadDocument(file);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleUrl(e: FormEvent) {
    e.preventDefault();
    if (!url.trim() || ingesting) return;
    setIngesting(true);
    setError(null);
    try {
      await api.ingestUrl(url.trim());
      setUrl("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to ingest URL");
    } finally {
      setIngesting(false);
    }
  }

  async function handleDelete(id: number) {
    try {
      await api.deleteDocument(id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete document");
    }
  }

  async function handleSearch(e: FormEvent) {
    e.preventDefault();
    if (!query.trim() || searching) return;
    setSearching(true);
    setError(null);
    try {
      const res = await api.searchDocuments(query.trim());
      setResults(res.results);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto px-4 py-6">
      <h1 className="font-display font-bold text-2xl text-flotext mb-4">Knowledge base</h1>
      <p className="text-sm text-grey mb-6">
        Upload documents or paste a URL. Helios indexes them and answers from them
        in chat with source attribution.
      </p>

      <div className="space-y-3 mb-6">
        <div className="bg-white rounded-card border border-border p-4">
          <div className="flex items-center gap-3">
            <input
              ref={fileRef}
              type="file"
              accept=".txt,.md,.markdown,.pdf,.docx,.html,.htm"
              onChange={handleFile}
              className="hidden"
              id="file-upload"
            />
            <label
              htmlFor="file-upload"
              className="cursor-pointer px-4 py-2.5 rounded-lg bg-teal text-navy2 font-semibold hover:bg-teal2 transition-colors flex items-center gap-2"
            >
              {uploading && <Spinner className="w-4 h-4" />}
              Upload file
            </label>
            <span className="text-xs text-grey">TXT · Markdown · PDF · DOCX · HTML</span>
          </div>
        </div>

        <form onSubmit={handleUrl} className="bg-white rounded-card border border-border p-4">
          <div className="flex gap-2">
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/article"
              className="flex-1 px-3 py-2.5 rounded-lg border border-border focus:border-teal focus:outline-none"
            />
            <button
              type="submit"
              disabled={!url.trim() || ingesting}
              className="px-4 py-2.5 rounded-lg bg-teal text-navy2 font-semibold hover:bg-teal2 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {ingesting && <Spinner className="w-4 h-4" />}
              Index URL
            </button>
          </div>
        </form>
      </div>

      {error && (
        <p className="text-sm text-red bg-red/5 border border-red/20 rounded-lg px-3 py-2 mb-4">
          {error}
        </p>
      )}

      <form onSubmit={handleSearch} className="mb-6">
        <div className="flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search your knowledge base…"
            className="flex-1 px-3 py-2.5 rounded-lg border border-border focus:border-teal focus:outline-none"
          />
          <button
            type="submit"
            disabled={!query.trim() || searching}
            className="px-4 py-2.5 rounded-lg bg-navy2 text-white font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2"
          >
            {searching && <Spinner className="w-4 h-4" />}
            Search
          </button>
        </div>
      </form>

      {results !== null && (
        <div className="mb-6">
          <h2 className="font-display font-bold text-lg text-flotext mb-2">
            Results{results.length === 0 ? " — nothing found" : ""}
          </h2>
          <ul className="space-y-2">
            {results.map((r, i) => (
              <li key={i} className="bg-white rounded-card border border-border px-4 py-3">
                <p className="text-[11px] text-teal2 font-semibold mb-1">
                  {r.title} · {r.score}
                </p>
                <p className="text-sm text-flotext">{r.content}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      <h2 className="font-display font-bold text-lg text-flotext mb-2">Documents</h2>
      {loading ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : docs.length === 0 ? (
        <p className="text-center text-grey text-sm py-10">
          No documents yet. Upload one to get started.
        </p>
      ) : (
        <ul className="space-y-2">
          {docs.map((d) => (
            <li
              key={d.id}
              className="bg-white rounded-card border border-border px-4 py-3 flex items-center gap-3"
            >
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate text-flotext">{d.title}</p>
                <div className="flex flex-wrap items-center gap-2 mt-1">
                  <span
                    className={`text-[11px] px-2 py-0.5 rounded-full border font-semibold ${
                      typeColor[d.type] ?? typeColor.file
                    }`}
                  >
                    {d.type}
                  </span>
                  <span className="text-[11px] text-grey">{formatDate(d.created_at)}</span>
                  {d.source && (
                    <span className="text-[11px] text-grey truncate max-w-[200px]">
                      {d.source}
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={() => handleDelete(d.id)}
                aria-label="Delete document"
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
