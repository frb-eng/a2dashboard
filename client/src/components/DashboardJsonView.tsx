import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import Stack from "@mui/material/Stack";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";

interface DashboardJsonViewProps {
  dashboard: unknown;
  stubbed: boolean;
}

export function DashboardJsonView({ dashboard, stubbed }: DashboardJsonViewProps) {
  const text = JSON.stringify(dashboard, null, 2);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // clipboard may be unavailable; intentionally swallowed in MVP
    }
  };

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600, flexGrow: 1 }}>
          Dashboard JSON
        </Typography>
        {stubbed && (
          <Chip
            size="small"
            color="warning"
            label="LLM stubbed"
            title="Generation is currently a deterministic stub; the response shape is the real contract."
          />
        )}
        <Button size="small" onClick={copy}>Copy</Button>
      </Stack>
      <Box
        component="pre"
        sx={{
          m: 0,
          p: 1.5,
          bgcolor: "grey.50",
          border: 1,
          borderColor: "grey.200",
          borderRadius: 1,
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          fontSize: 13,
          lineHeight: 1.5,
          overflowX: "auto",
          maxHeight: "60vh",
          whiteSpace: "pre",
        }}
      >
        {text}
      </Box>
    </Paper>
  );
}
