import { useState, type KeyboardEvent } from "react";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";

interface PromptInputProps {
  onSubmit: (prompt: string) => void;
  busy: boolean;
}

export function PromptInput({ onSubmit, busy }: PromptInputProps) {
  const [value, setValue] = useState("");

  const submit = () => {
    const trimmed = value.trim();
    if (trimmed.length === 0 || busy) return;
    onSubmit(trimmed);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      submit();
    }
  };

  return (
    <Stack spacing={1.5}>
      <TextField
        label="Describe the dashboard you want"
        placeholder="e.g. Show me @anthropics' repositories sorted by stars"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        multiline
        minRows={3}
        fullWidth
        disabled={busy}
      />
      <Stack direction="row" spacing={1} justifyContent="flex-end" alignItems="center">
        <Button
          variant="contained"
          onClick={submit}
          disabled={busy || value.trim().length === 0}
          startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
        >
          {busy ? "Generating…" : "Generate dashboard"}
        </Button>
      </Stack>
    </Stack>
  );
}
