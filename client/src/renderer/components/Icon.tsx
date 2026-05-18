/**
 * Icon display leaf.
 *
 * Mirrors a2ui's basic-catalog Icon: a named glyph from a curated enum.
 * Each name is mapped to a concrete `@mui/icons-material` component
 * below — adding a new name requires updating both this map and the
 * `IconName` enum in `spec.ts` (and its server twin).
 */

import type { SvgIconComponent } from "@mui/icons-material";
import AccountCircle from "@mui/icons-material/AccountCircle";
import Add from "@mui/icons-material/Add";
import ArrowBack from "@mui/icons-material/ArrowBack";
import ArrowForward from "@mui/icons-material/ArrowForward";
import CalendarToday from "@mui/icons-material/CalendarToday";
import Check from "@mui/icons-material/Check";
import Close from "@mui/icons-material/Close";
import Delete from "@mui/icons-material/Delete";
import Download from "@mui/icons-material/Download";
import Edit from "@mui/icons-material/Edit";
import Error from "@mui/icons-material/Error";
import Favorite from "@mui/icons-material/Favorite";
import Folder from "@mui/icons-material/Folder";
import Help from "@mui/icons-material/Help";
import Home from "@mui/icons-material/Home";
import Info from "@mui/icons-material/Info";
import Lock from "@mui/icons-material/Lock";
import LockOpen from "@mui/icons-material/LockOpen";
import Mail from "@mui/icons-material/Mail";
import Menu from "@mui/icons-material/Menu";
import Person from "@mui/icons-material/Person";
import Refresh from "@mui/icons-material/Refresh";
import Search from "@mui/icons-material/Search";
import Send from "@mui/icons-material/Send";
import Settings from "@mui/icons-material/Settings";
import Share from "@mui/icons-material/Share";
import Star from "@mui/icons-material/Star";
import Upload from "@mui/icons-material/Upload";
import Visibility from "@mui/icons-material/Visibility";
import VisibilityOff from "@mui/icons-material/VisibilityOff";
import Warning from "@mui/icons-material/Warning";

import type { NodeRendererProps } from "../registry";
import type { IconName, IconNode } from "../../spec";

const ICONS: Record<IconName, SvgIconComponent> = {
  accountCircle: AccountCircle,
  add: Add,
  arrowBack: ArrowBack,
  arrowForward: ArrowForward,
  calendarToday: CalendarToday,
  check: Check,
  close: Close,
  delete: Delete,
  download: Download,
  edit: Edit,
  error: Error,
  favorite: Favorite,
  folder: Folder,
  help: Help,
  home: Home,
  info: Info,
  lock: Lock,
  lockOpen: LockOpen,
  mail: Mail,
  menu: Menu,
  person: Person,
  refresh: Refresh,
  search: Search,
  send: Send,
  settings: Settings,
  share: Share,
  star: Star,
  upload: Upload,
  visibility: Visibility,
  visibilityOff: VisibilityOff,
  warning: Warning,
};

export function IconRenderer({ node }: NodeRendererProps<IconNode>) {
  const Component = ICONS[node.name];
  return <Component fontSize="small" />;
}
