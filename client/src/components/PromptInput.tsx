import { useState, type KeyboardEvent, type MouseEvent } from "react";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import CircularProgress from "@mui/material/CircularProgress";
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";

const EXAMPLES: string[] = [
  "List mucsi96's repos with name and number of stars",
  "Show open issues in vercel/next.js with title and author",
  "Recently updated repositories of @anthropics",
];

interface PromptInputProps {
  onSubmit: (prompt: string) => void;
  busy: boolean;
}

export function PromptInput({ onSubmit, busy }: PromptInputProps) {
  const [value, setValue] = useState("");
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);

  const submit = () => {
    const trimmed = value.trim();
    if (trimmed.length === 0 || busy) return;
    onSubmit(trimmed);
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

  return (
    <Stack spacing={1.5}>
      <Stack direction="row" spacing={1}>
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

      <TextField
        label="Describe the dashboard you want"
        placeholder="e.g. Show me @anthropics' repositories sorted by stars"
        helperText="Enter to submit · Shift+Enter for a new line"
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
