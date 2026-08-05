import { useCallback, useEffect, useRef, useState } from "react";
import { getYouTubeId, getYouTubePlaylistId, isPlayableFile } from "@/lib/youtube";

interface VideoPlayerProps {
  url: string;
  title?: string;
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const SPEEDS = [1, 1.25, 1.5, 1.75, 2];

function PlayIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} stroke="currentColor" strokeWidth="2">
      <path d="M8 5.5v13l11-6.5-11-6.5Z" fill="currentColor" stroke="none" />
    </svg>
  );
}

function PauseIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <rect x="6.5" y="5" width="3.5" height="14" rx="1" />
      <rect x="14" y="5" width="3.5" height="14" rx="1" />
    </svg>
  );
}

function VolumeIcon({ muted, volume }: { muted: boolean; volume: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-[18px] w-[18px]" stroke="currentColor" strokeWidth="2">
      <path d="M4 9.5v5h3l4.5 4V5.5L7 9.5H4Z" fill="currentColor" stroke="none" />
      {muted || volume === 0 ? (
        <path d="M16 9l5 6M21 9l-5 6" />
      ) : (
        <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" />
      )}
    </svg>
  );
}

function ExpandIcon({ on }: { on: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-[18px] w-[18px]" stroke="currentColor" strokeWidth="2">
      {on ? (
        <>
          <path d="M4 14h6v6M20 10h-6V4M4 10h6V4M20 14h-6v6" />
        </>
      ) : (
        <>
          <path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" />
        </>
      )}
    </svg>
  );
}

function PiPIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} stroke="currentColor" strokeWidth="2">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <rect x="11" y="11" width="7" height="5" rx="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function Html5VideoPlayer({ url, title }: { url: string; title?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<number | null>(null);

  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [rate, setRate] = useState(1);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const onFs = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const revealControls = useCallback(() => {
    setControlsVisible(true);
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    const video = videoRef.current;
    if (video && !video.paused) {
      hideTimer.current = window.setTimeout(() => setControlsVisible(false), 2600);
    }
  }, []);

  useEffect(() => () => {
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
  }, []);

  function togglePlay() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play();
    else video.pause();
  }

  function seek(e: React.MouseEvent<HTMLDivElement>) {
    const video = videoRef.current;
    if (!video || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    video.currentTime = ratio * duration;
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      containerRef.current?.requestFullscreen?.().catch(() => undefined);
    }
  }

  async function togglePip() {
    const video = videoRef.current;
    if (!video) return;
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await video.requestPictureInPicture();
    } catch {
      // PiP unsupported — ignore
    }
  }

  if (failed) {
    return (
      <div className="rounded-lg border border-border bg-light px-3 py-4 text-center text-[13px] text-grey">
        This video could not be played.{" "}
        <a href={url} target="_blank" rel="noreferrer" className="font-semibold text-teal underline">
          Open in browser ↗
        </a>
      </div>
    );
  }

  const controlsFaded = !controlsVisible && playing;

  return (
    <div
      ref={containerRef}
      className="group relative aspect-video w-full select-none overflow-hidden rounded-lg bg-black"
      onMouseMove={revealControls}
      onTouchStart={revealControls}
    >
      <video
        ref={videoRef}
        className="h-full w-full"
        playsInline
        preload="metadata"
        onClick={togglePlay}
        onPlay={() => {
          setPlaying(true);
          revealControls();
        }}
        onPause={() => {
          setPlaying(false);
          setControlsVisible(true);
          if (hideTimer.current) window.clearTimeout(hideTimer.current);
        }}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onVolumeChange={(e) => {
          setVolume(e.currentTarget.volume);
          setMuted(e.currentTarget.muted);
        }}
        onProgress={(e) => {
          const el = e.currentTarget;
          if (el.buffered.length > 0) setBuffered(el.buffered.end(el.buffered.length - 1));
        }}
        onError={() => setFailed(true)}
        src={url}
      />

      {!playing && (
        <button
          onClick={togglePlay}
          aria-label="Play video"
          className="absolute left-1/2 top-1/2 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/25 bg-navy/70 text-white backdrop-blur-sm transition hover:scale-105 hover:border-teal hover:bg-teal hover:text-navy"
        >
          <PlayIcon className="ml-1 h-7 w-7" />
        </button>
      )}

      {title && (
        <div className="pointer-events-none absolute left-3 top-3 max-w-[75%] truncate text-[12px] font-semibold text-white/80 drop-shadow">
          {title}
        </div>
      )}

      <div
        className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-3 pb-2 pt-8 transition-opacity duration-300 ${
          controlsFaded ? "pointer-events-none opacity-0" : "opacity-100"
        }`}
      >
        <div
          className="group/bar relative mb-2 h-1.5 w-full cursor-pointer rounded-full bg-white/20"
          onClick={seek}
        >
          <div className="absolute inset-y-0 left-0 rounded-full bg-white/25" style={{ width: `${(buffered / Math.max(duration, 1)) * 100}%` }} />
          <div className="absolute inset-y-0 left-0 rounded-full bg-teal" style={{ width: `${(currentTime / Math.max(duration, 1)) * 100}%` }} />
          <div
            className="absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full bg-teal shadow-[0_0_8px_rgba(0,217,184,0.8)]"
            style={{ left: `calc(${(currentTime / Math.max(duration, 1)) * 100}% - 7px)` }}
          />
        </div>

        <div className="flex items-center gap-1.5 text-white">
          <button
            onClick={togglePlay}
            aria-label={playing ? "Pause" : "Play"}
            className="flex h-8 w-8 items-center justify-center rounded-md text-white transition hover:bg-white/10 hover:text-teal"
          >
            {playing ? <PauseIcon className="h-4 w-4" /> : <PlayIcon className="ml-0.5 h-4 w-4" />}
          </button>

          <span className="flex items-center gap-0.5">
            <button
              onClick={() => {
                const v = videoRef.current;
                if (!v) return;
                v.muted = !v.muted;
              }}
              aria-label={muted ? "Unmute" : "Mute"}
              className="flex h-8 w-8 items-center justify-center rounded-md transition hover:bg-white/10 hover:text-teal"
            >
              <VolumeIcon muted={muted} volume={volume} />
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={muted ? 0 : volume}
              onChange={(e) => {
                const v = videoRef.current;
                if (!v) return;
                v.volume = Number(e.target.value);
                v.muted = false;
              }}
              className="hidden w-20 sm:block"
              aria-label="Volume"
            />
          </span>

          <span className="ml-1 text-[11px] font-medium tabular-nums text-white/80">
            {formatTime(currentTime)} <span className="text-white/40">/</span> {formatTime(duration)}
          </span>

          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={() => {
                const next = SPEEDS[(SPEEDS.indexOf(rate) + 1) % SPEEDS.length];
                setRate(next);
                if (videoRef.current) videoRef.current.playbackRate = next;
              }}
              aria-label="Playback speed"
              className="flex h-8 items-center justify-center rounded-md px-2 text-[11px] font-bold tabular-nums text-white/90 transition hover:bg-white/10 hover:text-teal"
            >
              {rate}x
            </button>
            {document.pictureInPictureEnabled && (
              <button
                onClick={() => void togglePip()}
                aria-label="Picture in picture"
                className="hidden h-8 w-8 items-center justify-center rounded-md transition hover:bg-white/10 hover:text-teal sm:flex"
              >
                <PiPIcon className="h-4 w-4" />
              </button>
            )}
            <button
              onClick={toggleFullscreen}
              aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
              className="flex h-8 w-8 items-center justify-center rounded-md transition hover:bg-white/10 hover:text-teal"
            >
              <ExpandIcon on={isFullscreen} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function YouTubeEmbed({ src, title }: { src: string; title?: string }) {
  return (
    <div className="aspect-video w-full overflow-hidden rounded-lg bg-black">
      <iframe
        className="h-full w-full"
        src={src}
        title={title ?? "Lecture video"}
        frameBorder="0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
      />
    </div>
  );
}

export function VideoPlayer({ url, title }: VideoPlayerProps) {
  const playlistId = getYouTubePlaylistId(url);
  const youtubeId = getYouTubeId(url);

  if (playlistId) {
    return (
      <YouTubeEmbed src={`https://www.youtube.com/embed/videoseries?list=${playlistId}`} title={title} />
    );
  }

  if (youtubeId) {
    return <YouTubeEmbed src={`https://www.youtube.com/embed/${youtubeId}`} title={title} />;
  }

  if (isPlayableFile(url)) {
    return <Html5VideoPlayer url={url} title={title} />;
  }

  return (
    <div className="rounded-lg border border-border bg-light px-3 py-4 text-center text-[13px] text-grey">
      <a href={url} target="_blank" rel="noreferrer" className="font-semibold text-teal underline">
        Watch lecture ↗
      </a>
    </div>
  );
}
