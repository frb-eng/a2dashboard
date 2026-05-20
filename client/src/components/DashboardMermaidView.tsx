/**
 * Renders an LLM-generated mermaid flowchart of the current dashboard
 * spec. Third sibling to the rendered dashboard and the raw JSON: the
 * server returns a single mermaid source string, this component renders
 * it client-side via the mermaid library.
 *
 * Generated diagrams are cached per Dashboard object reference so
 * toggling away and back is instant; only a fresh spec triggers a new
 * server call.
 */

import { useEffect, useId, useRef, useState } from "react";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Typography from "@mui/material/Typography";
import mermaid from "mermaid";

import type { Dashboard } from "../spec";
import { generateMermaid } from "../api";

mermaid.initialize({
  startOnLoad: false,
  theme: "default",
  securityLevel: "loose",
  flowchart: { htmlLabels: true, useMaxWidth: true },
});

const sourceCache = new WeakMap<Dashboard, string>();

interface Props {
  dashboard: Dashboard;
}

export function DashboardMermaidView({ dashboard }: Props) {
  const [source, setSource] = useState<string | null>(
    () => sourceCache.get(dashboard) ?? null,
  );
  const [loading, setLoading] = useState<boolean>(() => !sourceCache.has(dashboard));
  const [error, setError] = useState<string | null>(null);
  const [svg, setSvg] = useState<string>("");

  const reactId = useId().replace(/[^a-zA-Z0-9]/g, "");
  const renderTokenRef = useRef(0);

  useEffect(() => {
    const cached = sourceCache.get(dashboard);
    if (cached) {
      setSource(cached);
      setLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSource(null);
    setSvg("");
    generateMermaid(dashboard)
      .then((r) => {
        if (cancelled) return;
        sourceCache.set(dashboard, r.mermaid);
        setSource(r.mermaid);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [dashboard]);

  useEffect(() => {
    if (!source) {
      setSvg("");
      return;
    }
    let cancelled = false;
    const token = ++renderTokenRef.current;
    const renderId = `mmd_${reactId}_${token}`;
    mermaid
      .render(renderId, source)
      .then(({ svg }) => {
        if (cancelled || token !== renderTokenRef.current) return;
        setSvg(svg);
        setError(null);
      })
      .catch((e: unknown) => {
        if (cancelled || token !== renderTokenRef.current) return;
        setSvg("");
        setError(
          "Mermaid render failed: " + (e instanceof Error ? e.message : String(e)),
        );
      });
    return () => {
      cancelled = true;
    };
  }, [source, reactId]);

  const regenerate = () => {
    sourceCache.delete(dashboard);
    setSource(null);
    setSvg("");
    setLoading(true);
    setError(null);
    generateMermaid(dashboard)
      .then((r) => {
        sourceCache.set(dashboard, r.mermaid);
        setSource(r.mermaid);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => setLoading(false));
  };

  const copySource = async () => {
    if (!source) return;
    try {
      await navigator.clipboard.writeText(source);
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
          Dashboard diagram
        </Typography>
        {loading && <CircularProgress size={18} />}
        <Button size="small" onClick={copySource} disabled={!source}>
          Copy source
        </Button>
        <Button size="small" onClick={regenerate} disabled={loading}>
          Regenerate
        </Button>
      </Stack>
      <Box sx={{ p: 2, minHeight: 240, overflow: "auto", maxHeight: "70vh" }}>
        {error ? (
          <Stack spacing={1}>
            <Typography color="error" variant="body2" sx={{ fontWeight: 600 }}>
              {error}
            </Typography>
            {source && (
              <Box
                component="pre"
                sx={{
                  m: 0,
                  p: 1.5,
                  bgcolor: "background.default",
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                  fontSize: 12,
                  lineHeight: 1.5,
                  whiteSpace: "pre",
                  overflowX: "auto",
                }}
              >
                {source}
              </Box>
            )}
          </Stack>
        ) : svg ? (
          <Box
            sx={{
              "& svg": { maxWidth: "100%", height: "auto", display: "block" },
            }}
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        ) : loading ? (
          <Stack
            direction="row"
            spacing={1.5}
            alignItems="center"
            sx={{ color: "text.secondary" }}
          >
            <CircularProgress size={16} />
            <Typography variant="body2">Generating diagram…</Typography>
          </Stack>
        ) : null}
      </Box>
    </Paper>
  );
}
