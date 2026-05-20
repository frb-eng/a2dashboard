/**
 * Conversational input for iterating on a dashboard.
 *
 * Renders the message history above a multiline composer. The composer
 * sends the typed prompt on Enter (Shift+Enter for newline). Users can
 * pick from a list of starter examples when the conversation is empty.
 */

import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import Alert from "@mui/material/Alert";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import PersonIcon from "@mui/icons-material/Person";
import SendIcon from "@mui/icons-material/Send";

import type { ChatMessage } from "../sessions";

const EXAMPLES: string[] = [
  "List mucsi96's repos with name and number of stars",
  "Show open issues in vercel/next.js with title and author",
  "Recently updated repositories of @anthropics",
  "I want to see the open issues for react, angular and vue projects.",
  "I want a search input where I can type a pattern. A button to apply my search criteria and below a table of issues in react project. So a issue search dashboard for react repo.",
  "In the left column I want to see the anthropics repositories. Clicking one of them shows in the right column the list of contributors.",
  "On left side I want to see the top 10 anthropic repos (based on amount of stars). Clicking on a repo I see on the right side the top 3 contributors name.",
  "Bar chart of the top 10 contributors to facebook/react, with login on the x-axis and commit count on the y-axis.",
  "I wan to see a comparison of contributors for react, angular and vue as part of single bar chart",
];

interface ConversationPanelProps {
  messages: ChatMessage[];
  busy: boolean;
  onSubmit: (prompt: string) => void;
  /** Resets composer draft state. Pass the active session id so the prompt clears on switch. */
  sessionId: string;
}

export function ConversationPanel({ messages, busy, onSubmit, sessionId }: ConversationPanelProps) {
  const [value, setValue] = useState("");
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setValue("");
  }, [sessionId]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, busy]);

  const submit = () => {
    const trimmed = value.trim();
    if (trimmed.length === 0 || busy) return;
    onSubmit(trimmed);
    setValue("");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      submit();
    }
  };

  const openMenu = (e: MouseEvent<HTMLButtonElement>) => setMenuAnchor(e.currentTarget);
  const closeMenu = () => setMenuAnchor(null);
  const pickExample = (example: string) => {
    setValue(example);
    closeMenu();
  };

  const empty = messages.length === 0;

  return (
    <Stack sx={{ height: "100%", minHeight: 0 }}>
      <Box
        ref={scrollRef}
        sx={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          p: 2,
          display: "flex",
          flexDirection: "column",
          gap: 1.5,
        }}
      >
        {empty ? (
          <EmptyConversation />
        ) : (
          messages.map((m) => <MessageBubble key={m.id} message={m} />)
        )}
      </Box>

      <Box sx={{ p: 2, borderTop: 1, borderColor: "divider" }}>
        <Stack spacing={1.25}>
          {empty && (
            <Stack direction="row">
              <Button
                size="small"
                variant="outlined"
                endIcon={<ArrowDropDownIcon />}
                onClick={openMenu}
                disabled={busy}
              >
                Try an example
              </Button>
              <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={closeMenu}>
                {EXAMPLES.map((ex) => (
                  <MenuItem key={ex} onClick={() => pickExample(ex)}>
                    {ex}
                  </MenuItem>
                ))}
              </Menu>
            </Stack>
          )}

          <TextField
            placeholder={
              empty
                ? "Describe the dashboard you want…"
                : "Refine it — add a column, change the source, filter…"
            }
            helperText="Enter to send · Shift+Enter for a new line"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={onKeyDown}
            multiline
            minRows={2}
            maxRows={8}
            fullWidth
            disabled={busy}
            size="small"
          />
          <Stack direction="row" justifyContent="flex-end">
            <Button
              variant="contained"
              onClick={submit}
              disabled={busy || value.trim().length === 0}
              startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <SendIcon />}
            >
              {busy ? "Thinking…" : empty ? "Generate" : "Send"}
            </Button>
          </Stack>
        </Stack>
      </Box>
    </Stack>
  );
}

function EmptyConversation() {
  return (
    <Box
      sx={{
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "text.secondary",
        textAlign: "center",
        px: 1,
      }}
    >
      <Stack spacing={1} alignItems="center">
        <AutoAwesomeIcon fontSize="small" />
        <Typography variant="body2">
          Describe a dashboard to start. Then refine it turn-by-turn.
        </Typography>
        <Typography variant="caption" color="text.disabled">
          MVP: one <code>table</code> primitive, two GitHub endpoints.
        </Typography>
      </Stack>
    </Box>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  return (
    <Stack
      direction="row"
      spacing={1}
      alignItems="flex-start"
      sx={{ flexDirection: isUser ? "row-reverse" : "row" }}
    >
      <Avatar
        sx={{
          width: 28,
          height: 28,
          bgcolor: isUser ? "primary.main" : "background.paper",
          color: isUser ? "primary.contrastText" : "text.primary",
          border: isUser ? "none" : 1,
          borderColor: "divider",
        }}
      >
        {isUser ? <PersonIcon fontSize="small" /> : <AutoAwesomeIcon fontSize="small" />}
      </Avatar>
      <Paper
        variant="outlined"
        sx={{
          px: 1.5,
          py: 1,
          maxWidth: "85%",
          bgcolor: isUser ? "primary.dark" : "background.paper",
          borderColor: isUser ? "primary.dark" : "divider",
        }}
      >
        {message.error ? (
          <Alert severity="error" variant="outlined" sx={{ py: 0 }}>
            {message.error}
          </Alert>
        ) : message.pending ? (
          <Stack direction="row" spacing={1} alignItems="center">
            <CircularProgress size={14} />
            <Typography variant="body2" color="text.secondary">
              {message.content || "Composing the spec…"}
            </Typography>
          </Stack>
        ) : (
          <Typography
            variant="body2"
            sx={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}
          >
            {message.content}
          </Typography>
        )}
      </Paper>
    </Stack>
  );
}
