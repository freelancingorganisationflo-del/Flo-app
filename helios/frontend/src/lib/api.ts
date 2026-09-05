const TOKEN_KEY = "helios_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(`/api${path}`, { ...init, headers });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const detail = data?.detail ?? `Request failed (${res.status})`;
    throw new ApiError(res.status, typeof detail === "string" ? detail : JSON.stringify(detail));
  }
  return data as T;
}

export interface User {
  id: number;
  email: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
}

export interface Memory {
  id: number;
  content: string;
  created_at: string;
}

export interface Task {
  id: number;
  title: string;
  notes: string | null;
  due_at: string | null;
  priority: string;
  status: string;
  created_at: string;
  reminder_at: string | null;
  recurrence: Record<string, unknown> | null;
  completed_at: string | null;
  reminded_at: string | null;
  updated_at: string;
}

export interface ChatEvent {
  type: "tool" | "delta" | "done";
  name?: string;
  text?: string;
  model?: string;
}

export interface Document {
  id: number;
  title: string;
  type: string;
  source: string | null;
  indexed: boolean;
  created_at: string;
}

export interface SearchResult {
  content: string;
  title: string;
  score: number;
}

export interface ModelsInfo {
  default: string;
  models: string[];
}

export interface WebSearchHit {
  title: string;
  url: string;
  snippet: string;
  source: "instant" | "web";
}

export interface WebPage {
  url: string;
  title: string;
  text: string;
  truncated: boolean;
}

export const api = {
  login: (email: string, password: string) =>
    request<TokenResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  signup: (email: string, password: string) =>
    request<TokenResponse>("/auth/signup", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  me: () => request<User>("/auth/me"),

  listMemories: () => request<Memory[]>("/memory"),

  addMemory: (content: string) =>
    request<Memory>("/memory", {
      method: "POST",
      body: JSON.stringify({ content }),
    }),

  deleteMemory: (id: number) =>
    request<void>(`/memory/${id}`, { method: "DELETE" }),

  listTasks: (status?: string) =>
    request<Task[]>(`/tasks${status ? `?status=${status}` : ""}`),

  createTask: (payload: {
    title: string;
    notes?: string | null;
    due_at?: string | null;
    priority?: string;
    reminder_at?: string | null;
    recurrence?: Record<string, unknown> | null;
  }) =>
    request<Task>("/tasks", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  completeTask: (id: number) =>
    request<Task>(`/tasks/${id}/complete`, { method: "POST" }),

  deleteTask: (id: number) =>
    request<void>(`/tasks/${id}`, { method: "DELETE" }),

  listDocuments: () => request<Document[]>("/documents"),

  uploadDocument: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    const token = getToken();
    const headers = new Headers();
    if (token) headers.set("Authorization", `Bearer ${token}`);
    return request<Document>("/documents", { method: "POST", body: form, headers });
  },

  ingestUrl: (url: string) =>
    request<Document>("/documents/url", {
      method: "POST",
      body: JSON.stringify({ url }),
    }),

  deleteDocument: (id: number) =>
    request<void>(`/documents/${id}`, { method: "DELETE" }),

  searchDocuments: (q: string) =>
    request<{ results: SearchResult[] }>(`/documents/search?q=${encodeURIComponent(q)}`),

  searchWeb: (q: string, limit?: number) =>
    request<{ query: string; results: WebSearchHit[] }>(
      `/search?q=${encodeURIComponent(q)}${limit ? `&limit=${limit}` : ""}`
    ),

  fetchUrl: (url: string) =>
    request<WebPage>("/search/fetch", {
      method: "POST",
      body: JSON.stringify({ url }),
    }),

  listModels: () => request<ModelsInfo>("/chat/models"),

  streamChat: async (
    message: string,
    onEvent: (evt: ChatEvent) => void,
    signal?: AbortSignal,
    model?: string
  ): Promise<void> => {
    const token = getToken();
    const res = await fetch("/api/chat/stream", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(model ? { message, model } : { message }),
      signal,
    });
    if (!res.ok || !res.body) {
      const data = await res.json().catch(() => null);
      const detail = data?.detail ?? `Chat request failed (${res.status})`;
      throw new ApiError(res.status, typeof detail === "string" ? detail : JSON.stringify(detail));
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let sawDone = false;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";
      for (const part of parts) {
        const line = part.split("\n").find((l) => l.startsWith("data: "));
        if (!line) continue;
        try {
          const evt = JSON.parse(line.slice(6)) as ChatEvent;
          if (evt.type === "done") sawDone = true;
          onEvent(evt);
        } catch {
          // ignore malformed frames
        }
      }
    }
    if (!sawDone) {
      throw new ApiError(res.status, "Chat stream ended unexpectedly. Is the backend configured with an LLM API key?");
    }
  },
};
