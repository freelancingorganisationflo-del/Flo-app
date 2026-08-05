import { useState } from "react";
import { usePlaylistItems } from "@/hooks/usePlaylistItems";
import { VideoPlayer } from "@/components/ui/VideoPlayer";
import { Spinner } from "@/components/ui/Spinner";

interface PlaylistLecturesProps {
  playlistId: string;
  url: string;
  title?: string;
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="2">
      <path d="M8 5.5v13l11-6.5-11-6.5Z" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function PlaylistLectures({ playlistId, url, title }: PlaylistLecturesProps) {
  const { data: items = [], isLoading, error } = usePlaylistItems(playlistId);
  const [active, setActive] = useState(0);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2.5 rounded-lg border border-border bg-light px-4 py-5 text-[13px] text-grey">
        <Spinner />
        Loading lectures from playlist…
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-3">
        <div className="rounded-lg border border-orange/30 bg-orange/10 px-3.5 py-3 text-[12.5px] text-grey">
          Couldn't load the lecture list: <span className="font-semibold text-orange">{error.message}</span>
        </div>
        <VideoPlayer url={url} title={title} />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-light px-3 py-4 text-center text-[13px] text-grey">
        This playlist has no public videos.
      </div>
    );
  }

  const current = items[Math.min(active, items.length - 1)];

  return (
    <div className="space-y-3">
      <div className="max-h-72 overflow-y-auto rounded-lg border border-border">
        {items.map((item, i) => {
          const selected = i === Math.min(active, items.length - 1);
          return (
            <button
              key={item.videoId}
              onClick={() => setActive(i)}
              className={`flex w-full items-center gap-3 border-b border-border px-3.5 py-2.5 text-left transition-colors last:border-none ${
                selected ? "bg-teal/10" : "hover:bg-light"
              }`}
            >
              <span
                className={`flex h-6 w-9 shrink-0 items-center justify-center rounded-md text-[11px] font-bold ${
                  selected ? "bg-teal text-navy" : "bg-light text-grey"
                }`}
              >
                {i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block truncate text-[13px] font-semibold ${selected ? "text-teal" : "text-navy"}`}>
                  {item.title}
                </span>
                <span className="text-[11px] text-grey">Lec {i + 1}</span>
              </span>
              {selected && (
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal/15 text-teal">
                  <PlayIcon />
                </span>
              )}
            </button>
          );
        })}
      </div>

      {current && (
        <div className="space-y-2">
          <div className="text-[13px] font-bold text-navy">
            Lec {Math.min(active, items.length - 1) + 1} — {current.title}
          </div>
          <VideoPlayer url={`https://www.youtube.com/watch?v=${current.videoId}`} title={current.title} />
          <div className="flex items-center justify-between gap-2">
            <button
              onClick={() => setActive((a) => Math.max(0, a - 1))}
              disabled={active === 0}
              className="rounded-[8px] border border-border px-3 py-1.5 text-[12px] font-bold text-navy transition hover:bg-light disabled:cursor-not-allowed disabled:opacity-40"
            >
              ← Prev
            </button>
            <button
              onClick={() => setActive((a) => Math.min(items.length - 1, a + 1))}
              disabled={active >= items.length - 1}
              className="rounded-[8px] border border-border px-3 py-1.5 text-[12px] font-bold text-navy transition hover:bg-light disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
