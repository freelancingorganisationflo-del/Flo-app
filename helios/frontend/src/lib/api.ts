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

async function consumeSse<T extends { type: string }>(
  res: Response,
  onEvent: (evt: T) => void
): Promise<boolean> {
  const reader = res.body!.getReader();
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
        const evt = JSON.parse(line.slice(6)) as T;
        if (evt.type === "done") sawDone = true;
        onEvent(evt);
      } catch (err) {
        if (err instanceof ApiError) throw err;
        // ignore malformed frames
      }
    }
  }
  return sawDone;
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

export interface ChatSource {
  title: string;
  url: string;
  domain: string;
  snippet: string;
  source: string;
  published?: string | null;
  fetched?: boolean;
}

export interface ChatEvent {
  type: "tool" | "delta" | "done" | "stage" | "sources" | "error";
  name?: string;
  text?: string;
  model?: string;
  stage?: string;
  sources?: ChatSource[];
}

export interface CodeMessage {
  role: "user" | "assistant";
  content: string;
}

export interface CodeEvent {
  type: "stage" | "delta" | "done" | "sources" | "tool" | "error";
  text?: string;
  stage?: string;
  model?: string;
  content?: string;
  name?: string;
  title?: string;
  sources?: ChatSource[];
}

export interface CodeSession {
  id: number;
  title: string;
  created_at: string | null;
  updated_at: string | null;
}

export interface CodeTurn {
  id: number;
  role: "user" | "assistant";
  content: string;
  model: string | null;
  created_at: string | null;
}

export interface CodeFile {
  id: number;
  name: string;
  language: string;
  content: string;
  updated_at: string | null;
}

export interface CodeSessionDetail extends CodeSession {
  messages: CodeTurn[];
  files: CodeFile[];
}

export interface Automation {
  id: number;
  name: string;
  trigger_type: string;
  trigger_config: Record<string, unknown>;
  conditions: Record<string, unknown> | null;
  action_type: string;
  action_config: Record<string, unknown>;
  enabled: boolean;
  last_run_at: string | null;
  next_run_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface AutomationInput {
  name: string;
  trigger_type?: string;
  trigger_config?: Record<string, unknown>;
  conditions?: Record<string, unknown> | null;
  action_type: string;
  action_config?: Record<string, unknown> | null;
  enabled?: boolean;
}

export interface AutomationRun {
  id: number;
  automation_id: number;
  status: "success" | "failed" | "skipped_condition" | string;
  result_summary: string | null;
  error: string | null;
  run_at: string | null;
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

export interface VoiceConfig {
  stt_model: string;
  tts_model: string;
  tts_voice: string;
  tts_voices: string[];
}

export interface VisionConfig {
  default: string;
  models: string[];
}

export interface ProviderRoute {
  task: string;
  provider: string;
  model: string;
  fallback_model?: string | null;
  configured: boolean;
  host: string;
}

export interface ProviderStatus {
  llm: ProviderRoute[];
  voice: ProviderRoute[];
}

export interface VisionResult {
  reply: string;
  model: string;
}

const VOICE_KEY = "helios_tts_voice";

export function getSavedVoice(): string | null {
  return localStorage.getItem(VOICE_KEY);
}

export function setSavedVoice(voice: string): void {
  localStorage.setItem(VOICE_KEY, voice);
}

export function effectiveVoice(configVoice: string | undefined): string | undefined {
  return getSavedVoice() ?? configVoice;
}

export function friendlyVoice(id: string): string {
  const flux = id.match(/^flux-([a-z0-9]+)-en$/);
  if (flux) return flux[1].charAt(0).toUpperCase() + flux[1].slice(1);
  const edge = id.match(/^[a-z]{2,3}-[A-Z]{2,3}-([A-Za-z0-9]+)Neural$/);
  if (edge) return edge[1].replace(/Multilingual$/, "");
  const parts = id.split("-");
  return parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
}

export interface WakeInfo {
  text: string;
  tasks: { id: number; title: string; status: string; due_at: string | null }[];
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

  getProviders: () => request<ProviderStatus>("/providers"),

  getVoiceConfig: () => request<VoiceConfig>("/voice/config"),

  getVisionModels: () => request<VisionConfig>("/vision/models"),

  analyzeImage: async (
    file: File,
    question?: string,
    model?: string
  ): Promise<VisionResult> => {
    const form = new FormData();
    form.append("file", file);
    if (question?.trim()) form.append("question", question.trim());
    if (model) form.append("model", model);
    const token = getToken();
    const headers = new Headers();
    if (token) headers.set("Authorization", `Bearer ${token}`);
    return request<VisionResult>("/vision/analyze", { method: "POST", body: form, headers });
  },

  wake: () => request<WakeInfo>("/voice/wake", { method: "POST" }),

  stt: async (audio: Blob, filename = "audio.webm"): Promise<string> => {
    const form = new FormData();
    form.append("file", audio, filename);
    const res = await request<{ text: string }>("/voice/stt", { method: "POST", body: form });
    return res.text;
  },

  tts: async (text: string, voice?: string): Promise<string> => {
    const token = getToken();
    const res = await fetch("/api/voice/tts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(voice ? { text, voice } : { text }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      const detail = data?.detail ?? `TTS request failed (${res.status})`;
      throw new ApiError(res.status, typeof detail === "string" ? detail : JSON.stringify(detail));
    }
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  },

  talk: async (text: string, voice?: string): Promise<{ url: string; reply: string }> => {
    const token = getToken();
    const res = await fetch("/api/voice/talk", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(voice ? { text, voice } : { text }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      const detail = data?.detail ?? `Voice reply failed (${res.status})`;
      throw new ApiError(res.status, typeof detail === "string" ? detail : JSON.stringify(detail));
    }
    const replyHeader = res.headers.get("X-Helios-Reply");
    let reply = "";
    if (replyHeader) {
      try {
        reply = decodeURIComponent(escape(atob(replyHeader)));
      } catch {
        reply = "";
      }
    }
    const blob = await res.blob();
    return { url: URL.createObjectURL(blob), reply };
  },

  streamChat: async (
    message: string,
    onEvent: (evt: ChatEvent) => void,
    signal?: AbortSignal,
    model?: string,
    mode?: string
  ): Promise<void> => {
    const token = getToken();
    const res = await fetch("/api/chat/stream", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        message,
        ...(model ? { model } : {}),
        mode: mode ?? "auto",
      }),
      signal,
    });
    if (!res.ok || !res.body) {
      const data = await res.json().catch(() => null);
      const detail = data?.detail ?? `Chat request failed (${res.status})`;
      throw new ApiError(res.status, typeof detail === "string" ? detail : JSON.stringify(detail));
    }
    const sawDone = await consumeSse<ChatEvent>(res, (evt) => {
      if (evt.type === "error") {
        throw new ApiError(502, evt.text || "Chat failed. Add USER_LLM_API_KEY in helios/backend/.env.");
      }
      onEvent(evt);
    });
    if (!sawDone) {
      throw new ApiError(
        res.status,
        "Chat stream ended unexpectedly. Add USER_LLM_API_KEY in helios/backend/.env."
      );
    }
  },

  listCodeSessions: () => request<CodeSession[]>("/coding/sessions"),

  createCodeSession: (title?: string) =>
    request<CodeSession>("/coding/sessions", {
      method: "POST",
      body: JSON.stringify(title ? { title } : {}),
    }),

  getCodeSession: (id: number) => request<CodeSessionDetail>(`/coding/sessions/${id}`),

  deleteCodeSession: (id: number) =>
    request<void>(`/coding/sessions/${id}`, { method: "DELETE" }),

  addCodeFile: (
    sessionId: number,
    payload: { name: string; language?: string; content?: string }
  ) =>
    request<CodeFile>(`/coding/sessions/${sessionId}/files`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  updateCodeFile: (
    sessionId: number,
    fileId: number,
    patch: { name?: string; language?: string; content?: string }
  ) =>
    request<CodeFile>(`/coding/sessions/${sessionId}/files/${fileId}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),

  deleteCodeFile: (sessionId: number, fileId: number) =>
    request<void>(`/coding/sessions/${sessionId}/files/${fileId}`, { method: "DELETE" }),

  streamCodeSession: async (
    sessionId: number,
    message: string,
    onEvent: (evt: CodeEvent) => void,
    signal?: AbortSignal,
    model?: string,
    mode?: string
  ): Promise<void> => {
    const token = getToken();
    const res = await fetch(`/api/coding/sessions/${sessionId}/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ message, ...(model ? { model } : {}), mode: mode ?? "auto" }),
      signal,
    });
    if (!res.ok || !res.body) {
      const data = await res.json().catch(() => null);
      const detail = data?.detail ?? `Coding request failed (${res.status})`;
      throw new ApiError(res.status, typeof detail === "string" ? detail : JSON.stringify(detail));
    }
    const sawDone = await consumeSse<CodeEvent>(res, (evt) => {
      if (evt.type === "error") {
        throw new ApiError(502, evt.text || "Coding failed. Add USER_LLM_API_KEY in helios/backend/.env.");
      }
      onEvent(evt);
    });
    if (!sawDone) {
      throw new ApiError(res.status, "Coding stream ended unexpectedly. Add USER_LLM_API_KEY in helios/backend/.env.");
    }
  },

  listAutomations: () => request<Automation[]>("/automations"),

  createAutomation: (payload: AutomationInput) =>
    request<Automation>("/automations", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  updateAutomation: (id: number, patch: Partial<AutomationInput>) =>
    request<Automation>(`/automations/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),

  deleteAutomation: (id: number) =>
    request<void>(`/automations/${id}`, { method: "DELETE" }),

  runAutomation: (id: number) =>
    request<AutomationRun>(`/automations/${id}/run`, { method: "POST" }),

  listAutomationRuns: (id: number) =>
    request<AutomationRun[]>(`/automations/${id}/runs`),
};
