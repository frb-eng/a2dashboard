/**
 * Bar chart renderer (Highcharts).
 *
 * Resolves the bound `rows` binding, then projects each row into a single
 * (category, value) point — `categoryField` and `valueField` are dotted
 * paths into the row, mirroring how `table` columns address fields.
 * Non-numeric and missing values are coerced to 0.
 *
 * Surface area mirrors `TableRenderer`: an outlined Paper wrapper with a
 * title row + manual refresh button, and the same loading / error /
 * idle ("Waiting for <slot>…") placeholders so the master-detail right
 * panel behaves identically whether the right side is a chart or a table.
 *
 * No transformation logic lives here; if a derived ordering or top-N is
 * wanted, that's a `sort` / `limit` binding upstream — same as for tables.
 */

import { useMemo } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import IconButton from "@mui/material/IconButton";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { useTheme } from "@mui/material/styles";
import RefreshIcon from "@mui/icons-material/Refresh";
import Highcharts from "highcharts";
import HighchartsReact from "highcharts-react-official";

import type { NodeRendererProps } from "../registry";
import type { BarChartNode } from "../../spec";
import { useRows } from "../useRows";
import { readPath } from "../data";

function toNumber(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

export function BarChartRenderer({
  node,
  dashboard,
}: NodeRendererProps<BarChartNode>) {
  const binding = dashboard.data[node.rows];
  const { rows, loading, error, idle, pendingStateKeys, refresh } = useRows(
    binding,
    dashboard,
  );
  const theme = useTheme();

  const options = useMemo<Highcharts.Options>(() => {
    const categories: string[] = [];
    const data: number[] = [];
    for (const row of rows ?? []) {
      const cat = readPath(row, node.categoryField);
      categories.push(cat == null ? "" : String(cat));
      data.push(toNumber(readPath(row, node.valueField)));
    }
    // Highcharts defaults to light-theme grays for axis text and grid
    // lines; against our MUI dark Paper they read as nearly-black. Pull
    // colors from the active MUI theme so the chart follows whatever
    // palette the app is using.
    const textPrimary = theme.palette.text.primary;
    const textSecondary = theme.palette.text.secondary;
    const gridLine = theme.palette.divider;
    const seriesColor = theme.palette.primary.main;
    const axisLabelStyle = { color: textSecondary, fontSize: "12px" };
    const axisTitleStyle = { color: textPrimary };
    return {
      chart: { type: "column", backgroundColor: "transparent" },
      title: { text: undefined },
      credits: { enabled: false },
      legend: { enabled: false },
      xAxis: {
        categories,
        title: { text: node.categoryField, style: axisTitleStyle },
        labels: { style: axisLabelStyle },
        lineColor: gridLine,
        tickColor: gridLine,
      },
      yAxis: {
        title: { text: node.valueField, style: axisTitleStyle },
        labels: { style: axisLabelStyle },
        gridLineColor: gridLine,
        allowDecimals: false,
      },
      tooltip: {
        backgroundColor: theme.palette.background.paper,
        borderColor: gridLine,
        style: { color: textPrimary },
        pointFormat: "<b>{point.y}</b>",
      },
      plotOptions: { column: { borderWidth: 0 } },
      series: [{ type: "column", name: node.valueField, data, color: seriesColor }],
    };
  }, [rows, node.categoryField, node.valueField, theme]);

  if (!binding) {
    return (
      <Alert severity="error">
        Bar chart <code>{node.id}</code> references unknown binding{" "}
        <code>{node.rows}</code>.
      </Alert>
    );
  }

  return (
    <Paper variant="outlined" sx={{ width: "100%" }}>
      <Stack
        direction="row"
        alignItems="center"
        spacing={1}
        sx={{ px: 2, py: 1.25, borderBottom: 1, borderColor: "divider" }}
      >
        <Typography variant="subtitle1" sx={{ fontWeight: 600, flexGrow: 1 }}>
          {node.title ?? dashboard.title}
        </Typography>
        {loading && <CircularProgress size={16} />}
        <Tooltip title="Refresh">
          <span>
            <IconButton size="small" onClick={refresh} disabled={loading}>
              <RefreshIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      </Stack>

      {error && (
        <Box sx={{ p: 2 }}>
          <Alert severity="error">{error}</Alert>
        </Box>
      )}

      <Box sx={{ p: 2, minHeight: 320 }}>
        {rows && rows.length > 0 && (
          <HighchartsReact highcharts={Highcharts} options={options} />
        )}
        {rows && rows.length === 0 && (
          <Typography variant="body2" color="text.secondary" align="center" sx={{ py: 4 }}>
            No rows returned.
          </Typography>
        )}
        {!rows && !error && (
          <Typography variant="body2" color="text.secondary" align="center" sx={{ py: 4 }}>
            {loading
              ? "Loading…"
              : idle
                ? `Waiting for ${pendingStateKeys.join(", ")}…`
                : " "}
          </Typography>
        )}
      </Box>
    </Paper>
  );
}
