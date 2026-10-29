import {
  createContext,
  useContext,
  useMemo,
} from "react";
import {
  Check,
  CheckCheck,
  Clock3,
  X,
} from "lucide-react";

import EmployeeAvatar from "./EmployeeAvatar.jsx";
import { messageStatus } from "../lib/companyChat.js";
import {
  useOnlineEmployees,
} from "../lib/chatPresence.js";

import "./chat-signals.css";

const Signals = createContext({
  online: new Set(),
  blocked: new Set(),
});

export function ChatSignalsProvider({
  userId,
  rooms = [],
  children,
}) {
  const online = useOnlineEmployees(userId);

  const blocked = useMemo(
    () => new Set(
      rooms
        .filter(room =>
          room.kind === "direct" &&
          room.is_member &&
          room.blocked_by_other
        )
        .flatMap(room =>
          room.member_ids.filter(
            id => id !== userId
          )
        )
    ),
    [rooms, userId]
  );

  return (
    <Signals.Provider value={{ online, blocked }}>
      {children}
    </Signals.Provider>
  );
}

export function ChatAvatar({
  employeeId,
  size = 40,
  ...props
}) {
  const { online, blocked } = useContext(Signals);

  const state = blocked.has(employeeId)
    ? "blocked"
    : online.has(employeeId)
      ? "online"
      : "offline";

  const label = state === "blocked"
    ? "Blocked by this person"
    : state === "online"
      ? "Online"
      : "Offline";

  return (
    <span
      className="td-chat-person-avatar"
      style={{
        "--td-presence-size": `${size}px`,
      }}
    >
      <EmployeeAvatar
        {...props}
        employeeId={employeeId}
        size={size}
      />

      <span
        className={`td-chat-presence-dot is-${state}`}
        role="img"
        aria-label={label}
        title={label}
      />
    </span>
  );
}

export function ChatPreviewTicks({ message }) {
  if (!message) return null;

  const state = messageStatus(message);

  const label = {
    sending: "Sending",
    sent: "Sent",
    delivered: "Delivered",
    read: "Read",
    blocked: "Blocked — not delivered",
    failed: "Send failed",
  }[state];

  return (
    <span
      className={`td-chat-preview-ticks is-${state}`}
      role="img"
      aria-label={label}
      title={label}
    >
      {state === "blocked" ? (
        <span className="td-chat-preview-triple">
          <Check />
          <Check />
          <Check />
        </span>
      ) : state === "read" ||
        state === "delivered" ? (
        <CheckCheck />
      ) : state === "sending" ? (
        <Clock3 />
      ) : state === "failed" ? (
        <X />
      ) : (
        <Check />
      )}
    </span>
  );
}