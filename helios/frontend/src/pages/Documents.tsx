import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { api, type Document, type SearchResult } from "@/lib/api";
import { Spinner } from "@/components/Spinner";
import { Icon } from "@/components/Icon";

const typeColor: Record<string, string> = {
  file: "bg-cyan/10 text-cyan border-cyan/30",
  url: "bg-amber/10 text-amber border-amber/30",
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
    <div className="flex-1 min-h-0 overflow-y-auto scrollbar-slim">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 py-6">
        <div className="flex items-center gap-3 mb-1 animate-fade-up">
          <Icon name="book" className="w-6 h-6 text-blue" />
          <h1 className="font-display font-bold text-2xl sm:text-3xl text-ink">Knowledge base</h1>
        </div>
        <p className="text-sm text-grey mb-6 animate-fade-up">
          Upload documents or paste a URL. HELIOS indexes them and answers from them
          in chat with source attribution.
        </p>

        <div className="grid md:grid-cols-2 gap-3 mb-6 animate-fade-up" style={{ animationDelay: "60ms" }}>
          <div className="glass rounded-2xl p-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-faint mb-3">
              Upload file
            </p>
            <div className="flex flex-col gap-3">
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
                className="cursor-pointer inline-flex justify-center items-center gap-2 px-4 py-2.5 rounded-lg btn-ghost"
              >
                {uploading ? <Spinner className="w-4 h-4" /> : <Icon name="paperclip" className="w-4 h-4" />}
                {uploading ? "Uploading…" : "Choose file"}
              </label>
              <span className="text-[11px] text-faint">TXT · Markdown · PDF · DOCX · HTML</span>
            </div>
          </div>

          <form onSubmit={handleUrl} className="glass rounded-2xl p-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-faint mb-3">
              Index from URL
            </p>
            <div className="flex gap-2">
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com/article"
                className="input-dark flex-1"
              />
              <button
                type="submit"
                disabled={!url.trim() || ingesting}
                className="btn-ghost flex items-center gap-2"
              >
                {ingesting && <Spinner className="w-4 h-4" />}
                Index
              </button>
            </div>
          </form>
        </div>

        {error && (
          <p className="text-sm text-red glass border-red/30 rounded-lg px-3 py-2 mb-4 animate-fade-in">
            {error}
          </p>
        )}

        <form onSubmit={handleSearch} className="mb-6 animate-fade-up" style={{ animationDelay: "100ms" }}>
          <div className="flex gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search your knowledge base…"
              className="input-dark flex-1"
            />
            <button
              type="submit"
              disabled={!query.trim() || searching}
              className="btn-primary flex items-center gap-2"
            >
              {searching ? <Spinner className="w-4 h-4" /> : <Icon name="search" className="w-4 h-4" />}
              Search
            </button>
          </div>
        </form>

        {results !== null && (
          <div className="mb-6 animate-fade-in">
            <h2 className="font-display font-bold text-lg text-ink mb-2">
              Results{results.length === 0 ? " — nothing found" : ""}
            </h2>
            <ul className="space-y-2">
              {results.map((r, i) => (
                <li key={i} className="glass rounded-2xl px-4 py-3 hover:border-blue/40 transition-all">
                  <p className="text-[11px] text-blue font-semibold mb-1 flex items-center gap-1.5">
                    <Icon name="quote" className="w-3 h-3" />
                    {r.title} · {r.score}
                  </p>
                  <p className="text-sm text-ink/85 leading-relaxed">{r.content}</p>
                </li>
              ))}
            </ul>
          </div>
        )}

        <h2 className="font-display font-bold text-lg text-ink mb-2 animate-fade-up">Documents</h2>
        {loading ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : docs.length === 0 ? (
          <div className="text-center text-grey text-sm py-12 animate-fade-in">
            <Icon name="book" className="w-8 h-8 mx-auto mb-3 text-faint" />
            No documents yet. Upload one to get started.
          </div>
        ) : (
          <ul className="space-y-2 animate-fade-in">
            {docs.map((d) => (
              <li
                key={d.id}
                className="glass rounded-2xl px-4 py-3 flex items-center gap-3 hover:border-blue/25 transition-all"
              >
                <span className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue/20 to-violet/20 border border-blue/25 flex items-center justify-center text-blue shrink-0">
                  <Icon name="file" className="w-4 h-4" />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate text-ink">{d.title}</p>
                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    <span className={`chip ${typeColor[d.type] ?? typeColor.file}`}>
                      {d.type === "url" ? "URL" : "File"}
                    </span>
                    <span className="text-[11px] text-faint">{formatDate(d.created_at)}</span>
                    {d.source && (
                      <span className="text-[11px] text-faint truncate max-w-[220px]">
                        {d.source}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(d.id)}
                  aria-label="Delete document"
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
