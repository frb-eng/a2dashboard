/**
 * Table renderer.
 *
 * Resolves the bound `rows` binding, then renders each column according
 * to its shape:
 *   - When a column declares a nested `cell` UI node, every cell renders
 *     that node inside a `<RowContext.Provider>` so descendant `text`
 *     leaves can read the row via their `field`. This is the a2UI
 *     recursive composition story applied to table cells.
 *   - Otherwise the column's `field` (dotted path) is applied to the row
 *     and the value is formatted for display.
 *
 * No transformation logic lives here; if a derived value is needed,
 * that's a signal to add an aggregation primitive, not to inline logic
 * in the renderer.
 */

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import IconButton from "@mui/material/IconButton";
import Link from "@mui/material/Link";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import RefreshIcon from "@mui/icons-material/Refresh";

import { NodeRenderer, type NodeRendererProps } from "../registry";
import type { TableNode } from "../../spec";
import { useRows } from "../useRows";
import { readPath } from "../data";
import { RowContext } from "../RowContext";

function formatCell(value: unknown): React.ReactNode {
  if (value == null) {
    return <Typography variant="body2" color="text.disabled">—</Typography>;
  }
  if (typeof value === "string") {
    if (/^https?:\/\//.test(value)) {
      return <Link href={value} target="_blank" rel="noreferrer">{value}</Link>;
    }
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return <code>{JSON.stringify(value)}</code>;
}

export function TableRenderer({ node, dashboard }: NodeRendererProps<TableNode>) {
  const binding = dashboard.data[node.rows];
  const { rows, loading, error, refresh } = useRows(binding, dashboard);

  if (!binding) {
    return (
      <Alert severity="error">
        Table <code>{node.id}</code> references unknown binding{" "}
        <code>{node.rows}</code>.
      </Alert>
    );
  }

  return (
    <Paper variant="outlined">
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

      <TableContainer sx={{ maxHeight: "65vh" }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              {node.columns.map((col) => (
                <TableCell key={col.id} sx={{ fontWeight: 600 }}>
                  {col.header}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {rows && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={node.columns.length} align="center">
                  <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                    No rows returned.
                  </Typography>
                </TableCell>
              </TableRow>
            )}
            {rows?.map((row, i) => (
              <TableRow key={i} hover>
                {node.columns.map((col) => (
                  <TableCell key={col.id}>
                    {col.cell ? (
                      <RowContext.Provider value={row}>
                        <NodeRenderer node={col.cell} dashboard={dashboard} />
                      </RowContext.Provider>
                    ) : col.field ? (
                      formatCell(readPath(row, col.field))
                    ) : (
                      <Typography variant="body2" color="text.disabled">—</Typography>
                    )}
                  </TableCell>
                ))}
              </TableRow>
            ))}
            {!rows && !error && (
              <TableRow>
                <TableCell colSpan={node.columns.length} align="center">
                  <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                    {loading ? "Loading…" : " "}
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
}
