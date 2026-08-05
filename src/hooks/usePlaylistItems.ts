import { useQuery } from "@tanstack/react-query";

export interface PlaylistItem {
  videoId: string;
  title: string;
  position: number;
}

const API_KEY = import.meta.env.VITE_YOUTUBE_API_KEY as string | undefined;

async function fetchPage(playlistId: string, pageToken?: string) {
  const url = new URL("https://www.googleapis.com/youtube/v3/playlistItems");
  url.searchParams.set("part", "snippet,contentDetails");
  url.searchParams.set("maxResults", "50");
  url.searchParams.set("playlistId", playlistId);
  url.searchParams.set("key", API_KEY ?? "");
  if (pageToken) url.searchParams.set("pageToken", pageToken);
  const res = await fetch(url.toString());
  if (!res.ok) {
    let message = "Could not load playlist";
    try {
      const body = await res.json();
      message = body?.error?.message ?? message;
    } catch {
      // keep default message
    }
    throw new Error(message);
  }
  return (await res.json()) as {
    items?: Array<{
      contentDetails?: { videoId?: string };
      snippet?: { title?: string; position?: number; resourceId?: { videoId?: string } };
    }>;
    nextPageToken?: string;
  };
}

export function usePlaylistItems(playlistId: string | null | undefined) {
  return useQuery({
    queryKey: ["playlist-items", playlistId],
    enabled: Boolean(playlistId && API_KEY),
    queryFn: async () => {
      const items: PlaylistItem[] = [];
      let pageToken: string | undefined;
      for (let page = 0; page < 10; page++) {
        const data = await fetchPage(playlistId as string, pageToken);
        for (const entry of data.items ?? []) {
          const videoId = entry.contentDetails?.videoId ?? entry.snippet?.resourceId?.videoId;
          if (!videoId) continue;
          items.push({
            videoId,
            title: entry.snippet?.title ?? "Untitled",
            position: entry.snippet?.position ?? items.length,
          });
        }
        pageToken = data.nextPageToken;
        if (!pageToken) break;
      }
      return items;
    },
  });
}
