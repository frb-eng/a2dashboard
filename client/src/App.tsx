import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AppBar from "@mui/material/AppBar";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";

import { ConversationPanel } from "./components/ConversationPanel";
import { DashboardView } from "./components/DashboardView";
import { SessionList } from "./components/SessionList";
import { generate, GenerateError } from "./api";
import {
  createSession,
  deriveTitle,
  loadState,
  newMessage,
  saveActiveId,
  saveSessions,
  toHistory,
  type DashboardSession,
} from "./sessions";

const SIDEBAR_RIGHT = 380;

export default function App() {
  const initial = useMemo(loadState, []);
  const [sessions, setSessions] = useState<DashboardSession[]>(initial.sessions);
  const [activeId, setActiveId] = useState<string | null>(initial.activeId);
  // Tracks which sessions are awaiting a response. Lets the user switch
  // sessions without losing the spinner on the one that's still working.
  const busyIds = useRef<Set<string>>(new Set());
  const [, forceTick] = useState(0);

  useEffect(() => {
    saveSessions(sessions);
  }, [sessions]);

  useEffect(() => {
    saveActiveId(activeId);
  }, [activeId]);

  const active = sessions.find((s) => s.id === activeId) ?? null;
  const activeBusy = active ? busyIds.current.has(active.id) : false;

  const updateSession = useCallback(
    (id: string, patch: (s: DashboardSession) => DashboardSession) => {
      setSessions((prev) => prev.map((s) => (s.id === id ? patch(s) : s)));
    },
    [],
  );

  const ensureActiveSession = (): DashboardSession => {
    if (active) return active;
    const s = createSession();
    setSessions((prev) => [s, ...prev]);
    setActiveId(s.id);
    return s;
  };

  const createNew = () => {
    const s = createSession();
    setSessions((prev) => [s, ...prev]);
    setActiveId(s.id);
  };

  const deleteSession = (id: string) => {
    busyIds.current.delete(id);
    const next = sessions.filter((s) => s.id !== id);
    setSessions(next);
    if (activeId === id) {
      setActiveId(next[0]?.id ?? null);
    }
  };

  const handleSubmit = async (prompt: string) => {
    const session = ensureActiveSession();
    const sessionId = session.id;
    if (busyIds.current.has(sessionId)) return;

    const userMsg = newMessage("user", prompt);
    const pendingMsg = newMessage("assistant", "", { pending: true });

    // Capture history BEFORE we append the new turn so the server gets
    // only previously-completed exchanges.
    const history = toHistory(session.messages);
    const current = session.dashboard;

    updateSession(sessionId, (s) => ({
      ...s,
      title:
        s.messages.length === 0 || s.title === "New dashboard"
          ? deriveTitle(prompt, s.title)
          : s.title,
      messages: [...s.messages, userMsg, pendingMsg],
      updatedAt: Date.now(),
    }));

    busyIds.current.add(sessionId);
    forceTick((t) => t + 1);

    try {
      const out = await generate({ prompt, history, current });
      updateSession(sessionId, (s) => {
        const nextDashboard = out.dashboard ?? s.dashboard;
        const nextTitle =
          out.dashboard && (s.title === "New dashboard" || s.messages.length <= 2)
            ? out.dashboard.title || s.title
            : s.title;
        return {
          ...s,
          dashboard: nextDashboard,
          model: out.model,
          title: nextTitle,
          messages: s.messages.map((m) =>
            m.id === pendingMsg.id
              ? { ...m, pending: false, content: out.reply || "(no reply)" }
              : m,
          ),
          updatedAt: Date.now(),
        };
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const rawDashboard = e instanceof GenerateError ? e.rawDashboard : undefined;
      updateSession(sessionId, (s) => ({
        ...s,
        messages: s.messages.map((m) =>
          m.id === pendingMsg.id
            ? { ...m, pending: false, error: msg, rawDashboard }
            : m,
        ),
        updatedAt: Date.now(),
      }));
    } finally {
      busyIds.current.delete(sessionId);
      forceTick((t) => t + 1);
    }
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <AppBar
        position="static"
        color="default"
        elevation={0}
        sx={{ borderBottom: 1, borderColor: "divider" }}
      >
        <Toolbar>
          <Typography variant="h6" sx={{ fontWeight: 700, flexGrow: 1 }}>
            a2dashboard
          </Typography>
          <Typography variant="body2" color="text.secondary">
            prompt → JSON spec → live dashboard
          </Typography>
        </Toolbar>
      </AppBar>

      <Box sx={{ flex: 1, display: "flex", minHeight: 0 }}>
        <Box
          component="main"
          sx={{
            flex: 1,
            minWidth: 0,
            overflow: "auto",
            p: 3,
            bgcolor: "background.default",
          }}
        >
          {active && active.dashboard ? (
            <DashboardView
              key={active.id}
              dashboard={active.dashboard}
              model={active.model ?? ""}
            />
          ) : (
            <EmptyState busy={activeBusy} hasSession={Boolean(active)} />
          )}
        </Box>

        <Box
          component="aside"
          sx={{
            width: SIDEBAR_RIGHT,
            flexShrink: 0,
            borderLeft: 1,
            borderColor: "divider",
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <Box
            sx={{
              flexShrink: 0,
              maxHeight: "40%",
              display: "flex",
              flexDirection: "column",
              borderBottom: 1,
              borderColor: "divider",
            }}
          >
            <SessionList
              sessions={sessions}
              activeId={activeId}
              onSelect={setActiveId}
              onCreate={createNew}
              onDelete={deleteSession}
            />
          </Box>
          <Box sx={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
            <ConversationPanel
              sessionId={active?.id ?? "none"}
              messages={active?.messages ?? []}
              busy={activeBusy}
              onSubmit={handleSubmit}
            />
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

function EmptyState({ busy, hasSession }: { busy: boolean; hasSession: boolean }) {
  return (
    <Box
      sx={{
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "text.secondary",
      }}
    >
      <Stack spacing={1} alignItems="center">
        <Typography variant="h6">
          {busy ? "Generating your dashboard…" : "No dashboard yet"}
        </Typography>
        <Typography variant="body2">
          {busy
            ? "The model is composing the spec."
            : hasSession
            ? "Describe one in the panel on the right to get started."
            : "Create a new dashboard from the panel on the right, then describe it."}
        </Typography>
      </Stack>
    </Box>
  );
}
