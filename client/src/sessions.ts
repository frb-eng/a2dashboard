/**
 * Dashboard sessions — per-conversation state for iterating on a
 * dashboard with the LLM.
 *
 * Each session keeps its chat history alongside the current Dashboard
 * JSON, so the user can switch between independent dashboards and pick
 * up each conversation where they left off. State is persisted to
 * localStorage; there is no server-side session store.
 */

import type { Dashboard } from "./spec";

const STORAGE_KEY = "a2dashboard.sessions.v1";
const ACTIVE_KEY = "a2dashboard.sessions.active.v1";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  /** True while the assistant turn is in flight. */
  pending?: boolean;
  /** Error replacing the assistant turn if generation failed. */
  error?: string;
  /**
   * Raw intermediate dashboard JSON the LLM produced when validation
   * failed — present alongside `error` so the chat bubble can expose it
   * for debugging. In the LLM-emitted flat form (componentEntries +
   * uiRootId), not the tree shape, since the failure happened before
   * the server resolved it.
   */
  rawDashboard?: unknown;
}

export interface DashboardSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  dashboard: Dashboard | null;
  model: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface SessionsState {
  sessions: DashboardSession[];
  activeId: string | null;
}

function newId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export function createSession(): DashboardSession {
  const now = Date.now();
  return {
    id: newId(),
    title: "New dashboard",
    messages: [],
    dashboard: null,
    model: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function newMessage(
  role: ChatMessage["role"],
  content: string,
  extra: Partial<ChatMessage> = {},
): ChatMessage {
  return {
    id: newId(),
    role,
    content,
    timestamp: Date.now(),
    ...extra,
  };
}

/** Truncate the first user prompt into a short tab label. */
export function deriveTitle(prompt: string, fallback = "New dashboard"): string {
  const trimmed = prompt.trim().replace(/\s+/g, " ");
  if (trimmed.length === 0) return fallback;
  return trimmed.length <= 48 ? trimmed : trimmed.slice(0, 45) + "…";
}

export function loadState(): SessionsState {
  if (typeof window === "undefined") return { sessions: [], activeId: null };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const sessions: DashboardSession[] = raw ? JSON.parse(raw) : [];
    const activeId = window.localStorage.getItem(ACTIVE_KEY);
    return {
      sessions,
      activeId: activeId && sessions.some((s) => s.id === activeId) ? activeId : sessions[0]?.id ?? null,
    };
  } catch {
    return { sessions: [], activeId: null };
  }
}

export function saveSessions(sessions: DashboardSession[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  } catch {
    // localStorage may be unavailable (private mode, quota); persistence is best-effort.
  }
}

export function saveActiveId(id: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (id) window.localStorage.setItem(ACTIVE_KEY, id);
    else window.localStorage.removeItem(ACTIVE_KEY);
  } catch {
    // best-effort
  }
}

/** Project a session's messages into the API history shape. */
export function toHistory(messages: ChatMessage[]): { role: "user" | "assistant"; content: string }[] {
  return messages
    .filter((m) => !m.pending && !m.error)
    .map((m) => ({ role: m.role, content: m.content }));
}
