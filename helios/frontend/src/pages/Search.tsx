import { useEffect, useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api, type WebSearchHit, type WebPage } from "@/lib/api";
import { Spinner } from "@/components/Spinner";
import { Icon } from "@/components/Icon";

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function Search() {
  const location = useLocation();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<WebSearchHit[] | null>(null);
  const [activeQuery, setActiveQuery] = useState("");
  const [preview, setPreview] = useState<WebPage | null>(null);
  const [fetching, setFetching] = useState<string | null>(null);

  useEffect(() => {
    const incoming = (location.state as { query?: string } | null)?.query?.trim();
    if (!incoming) return;
    setQuery(incoming);
    navigate(location.pathname, { replace: true, state: null });
    void runSearch(incoming);
  }, [location.state]);

  async function runSearch(q: string) {
    const text = q.trim();
    if (!text || searching) return;
    setSearching(true);
    setError(null);
    setPreview(null);
    try {
      const res = await api.searchWeb(text);
      setResults(res.results);
      setActiveQuery(res.query);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
      setResults(null);
    } finally {
      setSearching(false);
    }
  }

  async function handleSearch(e: FormEvent) {
    e.preventDefault();
    await runSearch(query);
  }

  async function handleFetch(url: string) {
    if (fetching) return;
    setFetching(url);
    setError(null);
    try {
      const page = await api.fetchUrl(url);
      setPreview(page);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch page");
    } finally {
      setFetching(null);
    }
  }

  function askHelios() {
    const q = (activeQuery || query).trim();
    if (!q) return;
    navigate("/chat", { state: { query: `Search the web for: ${q}` } });
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto scrollbar-slim">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 py-6">
        <div className="flex items-center gap-3 mb-1 animate-fade-up">
          <Icon name="globe" className="w-6 h-6 text-cyan" />
          <h1 className="font-display font-bold text-2xl sm:text-3xl text-ink">Web search</h1>
        </div>
        <p className="text-sm text-grey mb-6 animate-fade-up">
          Live results from the public web. HELIOS can also search during chat.
        </p>

        <form onSubmit={handleSearch} className="mb-6 animate-fade-up" style={{ animationDelay: "60ms" }}>
          <div className="flex gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search the web…"
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
            <button
              type="button"
              onClick={askHelios}
              disabled={!(activeQuery || query).trim()}
              className="btn-ghost flex items-center gap-2"
            >
              <Icon name="sparkles" className="w-4 h-4" />
              Ask HELIOS
            </button>
          </div>
        </form>

        {error && (
          <p className="text-sm text-red glass border-red/30 rounded-lg px-3 py-2 mb-4 animate-fade-in">
            {error}
          </p>
        )}

        {preview && (
          <div className="mb-6 glass rounded-2xl p-4 animate-fade-in">
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="min-w-0">
                <p className="text-[11px] text-cyan font-semibold uppercase tracking-widest mb-1">
                  Page preview
                </p>
                <h2 className="font-display font-bold text-lg text-ink truncate">{preview.title}</h2>
                <a
                  href={preview.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-faint hover:text-cyan truncate block"
                >
                  {preview.url}
                </a>
              </div>
              <button
                onClick={() => setPreview(null)}
                aria-label="Close preview"
                className="text-faint hover:text-ink p-1.5 rounded-lg hover:bg-white/[0.06]"
              >
                <Icon name="x" className="w-4 h-4" />
              </button>
            </div>
            <p className="text-sm text-ink/85 leading-relaxed whitespace-pre-wrap max-h-72 overflow-y-auto scrollbar-slim">
              {preview.text}
            </p>
            {preview.truncated && (
              <p className="mt-2 text-[11px] text-faint">Preview truncated.</p>
            )}
          </div>
        )}

        {results !== null && (
          <div className="animate-fade-in">
            <h2 className="font-display font-bold text-lg text-ink mb-2">
              {results.length === 0
                ? `No results for "${activeQuery}"`
                : `${results.length} result${results.length === 1 ? "" : "s"} for "${activeQuery}"`}
            </h2>
            {results.length === 0 ? (
              <div className="text-center text-grey text-sm py-12">
                <Icon name="globe" className="w-8 h-8 mx-auto mb-3 text-faint" />
                Try a different query.
              </div>
            ) : (
              <ul className="space-y-2">
                {results.map((r) => (
                  <li key={r.url} className="glass rounded-2xl px-4 py-3 hover:border-cyan/40 transition-all">
                    <div className="flex items-start gap-3">
                      <span className="w-9 h-9 mt-0.5 rounded-lg bg-gradient-to-br from-cyan/20 to-blue/20 border border-cyan/25 flex items-center justify-center text-cyan shrink-0">
                        <Icon name={r.source === "instant" ? "sparkles" : "globe"} className="w-4 h-4" />
                      </span>
                      <div className="flex-1 min-w-0">
                        <a
                          href={r.url}
                          target="_blank"
                          rel="noreferrer"
                          className="font-medium text-ink hover:text-cyan transition-colors"
                        >
                          {r.title}
                        </a>
                        <p className="text-[11px] text-cyan/80 truncate mt-0.5">{hostname(r.url)}</p>
                        {r.snippet && (
                          <p className="text-sm text-ink/80 leading-relaxed mt-1.5">{r.snippet}</p>
                        )}
                        <div className="flex items-center gap-2 mt-2">
                          {r.source === "instant" && (
                            <span className="chip border-mint/30 text-mint bg-mint/10">Instant answer</span>
                          )}
                          <button
                            onClick={() => handleFetch(r.url)}
                            disabled={fetching === r.url}
                            className="text-[11px] font-semibold text-grey hover:text-cyan transition-colors"
                          >
                            {fetching === r.url ? "Reading…" : "Read page"}
                          </button>
                        </div>
                      </div>
                      <a
                        href={r.url}
                        target="_blank"
                        rel="noreferrer"
                        aria-label="Open in new tab"
                        className="text-faint hover:text-cyan p-1.5"
                      >
                        <Icon name="arrow-up-right" className="w-4 h-4" />
                      </a>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {results === null && !searching && (
          <div className="text-center text-grey text-sm py-16 animate-fade-in">
            <Icon name="search" className="w-8 h-8 mx-auto mb-3 text-faint" />
            Search news, docs, or anything current on the web.
          </div>
        )}
      </div>
    </div>
  );
}
