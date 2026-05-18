import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";

import type { Dashboard } from "../spec";

interface DashboardJsonViewProps {
  dashboard: Dashboard;
}

export function DashboardJsonView({ dashboard }: DashboardJsonViewProps) {
  const text = JSON.stringify(dashboard, null, 2);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // clipboard may be unavailable; intentionally swallowed in MVP
    }
  };

  return (
    <Paper variant="outlined">
      <Stack
        direction="row"
        alignItems="center"
        spacing={1}
        sx={{ px: 2, py: 1.25, borderBottom: 1, borderColor: "divider" }}
      >
        <Typography variant="subtitle1" sx={{ fontWeight: 600, flexGrow: 1 }}>
          Dashboard JSON
        </Typography>
        <Button size="small" onClick={copy}>Copy</Button>
      </Stack>
      <Box
        component="pre"
        sx={{
          m: 0,
          p: 1.5,
          bgcolor: "background.default",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          fontSize: 13,
          lineHeight: 1.5,
          overflowX: "auto",
          maxHeight: "65vh",
          whiteSpace: "pre",
        }}
      >
        {text}
      </Box>
    </Paper>
  );
}
