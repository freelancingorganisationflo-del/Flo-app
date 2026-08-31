interface IconProps {
  name: string;
  className?: string;
}

const paths: Record<string, string> = {
  home: "M3 10.5L12 3l9 7.5M5 9.5V21h14V9.5",
  chat: "M4 5h16v11H9l-5 4V5z",
  brain: "M9.5 3A2.5 2.5 0 0 0 7 5.5 2.5 2.5 0 0 0 4.5 8a2.5 2.5 0 0 0 0 5A2.5 2.5 0 0 0 7 15.5 2.5 2.5 0 0 0 9.5 18M14.5 3a2.5 2.5 0 0 1 2.5 2.5 2.5 2.5 0 0 1 2.5 2.5 2.5 2.5 0 0 1 0 5 2.5 2.5 0 0 1-2.5 2.5 2.5 2.5 0 0 1-2.5 2.5M12 3v18",
  tasks: "M8 6h11M8 12h11M8 18h11M4 6h.01M4 12h.01M4 18h.01",
  book: "M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5zM20 19a2 2 0 0 1-2 2H6M8 7h8",
  tools: "M14.5 6.5a4 4 0 0 1 5-5L16 5l1 2 2 1 3.5-3.5a4 4 0 0 1-5 5L12 14l-2-2 4.5-5.5zM4 20l6-6",
  zap: "M13 2L3 14h7l-1 8 11-13h-7l1-7z",
  calendar: "M6 3v3m12-3v3M4 8h16M5 5h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zm3 7h2m2 0h2m2 0h2m-8 4h2m2 0h2m2 0h2",
  folder: "M3 5a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5z",
  analytics: "M4 20V10m5 10V4m5 16v-7m5 7V7",
  settings: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm8 4h-1m-2.5-5.5l.7-.7M12 3v1m-5.5 1l.7.7M3 12h1m1 5.5l.7-.7m3.8 3.2V21m7-5.5l.7.7M21 12h-1",
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zm0 0l7 7",
  bell: "M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6zm4 11h4",
  mic: "M12 3a3 3 0 0 1 3 3v6a3 3 0 1 1-6 0V6a3 3 0 0 1 3-3zm-7 9a7 7 0 0 0 14 0m-7 7v3",
  send: "M21 3L10 14M21 3l-6 18-5-7-7-5 18-6z",
  stop: "M6 6h12v12H6z",
  plus: "M12 5v14M5 12h14",
  x: "M6 6l12 12M18 6L6 18",
  check: "M4 12l5 5L20 6",
  copy: "M8 8h12v12H8zM4 16V4h12",
  refresh: "M4 4v6h6M20 20v-6h-6M20 7a8 8 0 0 0-14-3M4 17a8 8 0 0 0 14 3",
  logout: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4m7 14l5-5-5-5m5 5H9",
  menu: "M4 6h16M4 12h16M4 18h16",
  "chevron-left": "M15 6l-6 6 6 6",
  "chevron-right": "M9 6l6 6-6 6",
  "chevron-down": "M6 9l6 6 6-6",
  sparkles: "M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15zM5 14l.7 1.8 1.8.7-1.8.7L5 19l-.7-1.8-1.8-.7 1.8-.7L5 14z",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-8 8a8 8 0 0 1 16 0",
  at: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm9-3a9 9 0 1 1-2.6-6.4",
  globe: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm-9 9h18M12 3c2.5 2.6 4 5.6 4 9s-1.5 6.4-4 9c-2.5-2.6-4-5.6-4-9s1.5-6.4 4-9z",
  paperclip: "M21 11.5l-8.5 8.5a6 6 0 0 1-8.5-8.5L13 3.5a4 4 0 0 1 5.7 5.7L9.5 18.4a2 2 0 0 1-2.8-2.8L15.8 6.5",
  trash: "M4 7h16M9 7V4h6v3m-8 0l1 13h8l1-13M10 11v5m4-5v5",
  file: "M6 2h8l4 4v16H6V2zm8 0v4h4",
  quote: "M10 11H7a3 3 0 0 1 0-6h1m6 6h-3a3 3 0 0 1 0-6h1m-3 6v3a4 4 0 0 1-4 4M13 11v3a4 4 0 0 0 4 4",
  database: "M12 3c4 0 7 1.3 7 3s-3 3-7 3-7-1.3-7-3 3-3 7-3zm-7 3v6c0 1.7 3 3 7 3s7-1.3 7-3V6m0 6v6c0 1.7-3 3-7 3s-7-1.3-7-3v-6",
  "arrow-up-right": "M7 17L17 7M8 7h9v9",
  clock: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 5v4l3 3",
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z",
  link: "M9 15l6-6m-4-3l1.5-1.5a4 4 0 0 1 5.7 5.7L17 12m-4 6l-1.5 1.5a4 4 0 0 1-5.7-5.7L8 14",
  info: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 8v5m0-8h.01",
};

export function Icon({ name, className = "w-5 h-5" }: IconProps) {
  const d = paths[name] ?? paths.info;
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}
