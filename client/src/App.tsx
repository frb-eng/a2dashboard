import { useState } from "react";
import AppBar from "@mui/material/AppBar";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import Container from "@mui/material/Container";
import Stack from "@mui/material/Stack";
import Paper from "@mui/material/Paper";
import Alert from "@mui/material/Alert";
import { PromptInput } from "./components/PromptInput";
import { DashboardJsonView } from "./components/DashboardJsonView";
import { generate, type GenerateResponse } from "./api";

export default function App() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<GenerateResponse | null>(null);

  const onSubmit = async (prompt: string) => {
    setBusy(true);
    setError(null);
    try {
      const out = await generate(prompt);
      setResponse(out);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <AppBar position="static" color="default" elevation={0} sx={{ borderBottom: 1, borderColor: "divider" }}>
        <Toolbar>
          <Typography variant="h6" sx={{ fontWeight: 700, flexGrow: 1 }}>
            a2dashboard
          </Typography>
          <Typography variant="body2" color="text.secondary">
            prompt → JSON spec → live dashboard
          </Typography>
        </Toolbar>
      </AppBar>

      <Container maxWidth="md" sx={{ py: 4 }}>
        <Stack spacing={3}>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="h6" sx={{ mb: 1 }}>
              Describe your dashboard
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              MVP: one <code>table</code> primitive, two GitHub endpoints
              (<code>users/&#123;u&#125;/repos</code>, <code>repos/&#123;o&#125;/&#123;r&#125;/issues</code>).
              Renderer not wired up yet — the generated dashboard JSON is shown below.
            </Typography>
            <PromptInput onSubmit={onSubmit} busy={busy} />
          </Paper>

          {error && <Alert severity="error">{error}</Alert>}

          {response && (
            <DashboardJsonView
              dashboard={response.dashboard}
              model={response.model}
            />
          )}
        </Stack>
      </Container>
    </>
  );
}
