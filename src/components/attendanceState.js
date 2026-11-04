export function attendanceTime(value) {
  return value
    ? new Intl.DateTimeFormat("en-ZA", {
        timeZone: "Africa/Johannesburg",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).format(new Date(value))
    : "";
}

export function warningKey(userId, status, serverNow) {
  const entry = status?.open_entry;

  const cutoff = Date.parse(
    entry?.attendance_cutoff_at || ""
  );

  if (
    !userId ||
    !status?.enabled ||
    !entry ||
    !Number.isFinite(cutoff)
  ) {
    return "";
  }

  const remaining = cutoff - serverNow;

  return remaining > 0 && remaining <= 3600000
    ? `td-attendance-warning:${userId}:${entry.id}:${entry.attendance_cutoff_at}`
    : "";
}

export function entrySignature(status) {
  const entry = status?.latest_entry;

  return JSON.stringify([
    entry?.id,
    entry?.clocked_out_at,
    entry?.attendance_cutoff_at,
    entry?.auto_clocked_out,
    status?.can_clock_in,
  ]);
}