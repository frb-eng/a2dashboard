/**
 * Left sidebar that lists dashboard sessions and lets the user create,
 * switch between, or delete them.
 */

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";

import type { DashboardSession } from "../sessions";

interface SessionListProps {
  sessions: DashboardSession[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
}

export function SessionList({ sessions, activeId, onSelect, onCreate, onDelete }: SessionListProps) {
  return (
    <Stack sx={{ height: "100%", minHeight: 0 }}>
      <Box sx={{ p: 2, borderBottom: 1, borderColor: "divider" }}>
        <Button
          fullWidth
          variant="outlined"
          size="small"
          startIcon={<AddIcon />}
          onClick={onCreate}
        >
          New dashboard
        </Button>
      </Box>

      <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        {sessions.length === 0 ? (
          <Box sx={{ p: 2 }}>
            <Typography variant="caption" color="text.secondary">
              No dashboards yet. Create one to begin.
            </Typography>
          </Box>
        ) : (
          <List dense disablePadding>
            {sessions.map((s) => (
              <ListItemButton
                key={s.id}
                selected={s.id === activeId}
                onClick={() => onSelect(s.id)}
                sx={{
                  borderLeft: 3,
                  borderColor: s.id === activeId ? "primary.main" : "transparent",
                  pr: 1,
                }}
              >
                <ListItemText
                  primary={
                    <Typography
                      variant="body2"
                      sx={{
                        fontWeight: s.id === activeId ? 600 : 400,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {s.title}
                    </Typography>
                  }
                  secondary={
                    <Typography variant="caption" color="text.secondary">
                      {s.messages.length === 0
                        ? "Empty"
                        : `${s.messages.filter((m) => m.role === "user").length} turn${
                            s.messages.filter((m) => m.role === "user").length === 1 ? "" : "s"
                          }`}
                    </Typography>
                  }
                />
                <Tooltip title="Delete">
                  <IconButton
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(s.id);
                    }}
                  >
                    <DeleteOutlineIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </ListItemButton>
            ))}
          </List>
        )}
      </Box>
    </Stack>
  );
}
