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
        <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
          <div>
            <h1 className="font-display font-bold text-2xl text-ink">Knowledge Base</h1>
            <p className="text-sm text-grey mt-1">Your personal searchable library</p>
          </div>
          <label htmlFor="file-upload" className="btn-primary flex items-center gap-2 cursor-pointer">
            {uploading ? <Spinner className="w-4 h-4" /> : <Icon name="plus" className="w-4 h-4" />}
            {uploading ? "Uploading…" : "Upload Document"}
          </label>
        </div>

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

        <div className="flex gap-2 mb-4">
          {["All Documents", "Processing", "Categories"].map((tab, i) => (
            <span
              key={tab}
              className={`px-3 py-1.5 rounded-full text-sm font-semibold ${
                i === 0 ? "bg-cyan/20 text-cyan border border-cyan/30" : "glass text-faint"
              }`}
            >
              {tab}
            </span>
          ))}
        </div>
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
          <div className="glass rounded-2xl overflow-hidden">
            <div className="hidden sm:grid grid-cols-[minmax(0,1fr)_80px_140px_40px] gap-3 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-widest text-faint border-b border-line">
              <span>Name</span>
              <span>Type</span>
              <span>Date</span>
              <span />
            </div>
            <ul>
              {docs.map((d) => (
                <li
                  key={d.id}
                  className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_80px_140px_40px] gap-2 sm:gap-3 px-4 py-3 items-center border-b border-line last:border-0 hover:bg-white/[0.02]"
                >
                  <span className="flex items-center gap-3 min-w-0">
                    <span className="w-8 h-8 rounded-lg bg-blue/10 text-blue flex items-center justify-center shrink-0">
                      <Icon name="file" className="w-4 h-4" />
                    </span>
                    <span className="font-medium truncate text-ink">{d.title}</span>
                  </span>
                  <span className={`chip w-fit ${typeColor[d.type] ?? typeColor.file}`}>
                    {d.type === "url" ? "URL" : "File"}
                  </span>
                  <span className="text-[12px] text-faint">{formatDate(d.created_at)}</span>
                  <button
                    onClick={() => handleDelete(d.id)}
                    aria-label="Delete document"
                    className="text-faint hover:text-red justify-self-end"
                  >
                    <Icon name="trash" className="w-4 h-4" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
