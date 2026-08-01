import { useState } from "react";

interface VideoPlayerProps {
  url: string;
  title?: string;
}

function getYouTubeId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtube\.com\/embed\/|youtube\.com\/shorts\/|youtu\.be\/)([A-Za-z0-9_-]{11})/,
    /youtube\.com\/live\/([A-Za-z0-9_-]{11})/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

function isPlayableFile(url: string): boolean {
  return /\.(mp4|webm|ogg|ogv|mov|m4v)(\?.*)?$/i.test(url);
}

export function VideoPlayer({ url, title }: VideoPlayerProps) {
  const youtubeId = getYouTubeId(url);
  const [failed, setFailed] = useState(false);

  if (youtubeId) {
    return (
      <div className="aspect-video w-full overflow-hidden rounded-lg bg-black">
        <iframe
          className="h-full w-full"
          src={`https://www.youtube.com/embed/${youtubeId}`}
          title={title ?? "Lecture video"}
          frameBorder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      </div>
    );
  }

  if (isPlayableFile(url)) {
    return (
      <div className="aspect-video w-full overflow-hidden rounded-lg bg-black">
        <video className="h-full w-full" controls playsInline preload="metadata" onError={() => setFailed(true)}>
          <source src={url} />
          Your browser does not support HTML5 video playback.
        </video>
      </div>
    );
  }

  if (failed) {
    return (
      <div className="rounded-lg border border-border bg-light px-3 py-4 text-center text-[13px] text-grey">
        This video could not be played. <a href={url} target="_blank" rel="noreferrer" className="font-semibold text-teal underline">Open in browser ↗</a>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-light px-3 py-4 text-center text-[13px] text-grey">
      <a href={url} target="_blank" rel="noreferrer" className="font-semibold text-teal underline">Watch lecture ↗</a>
    </div>
  );
}
