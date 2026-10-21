export function clockMessage(clockedOut, date = new Date()) {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Africa/Johannesburg",
      hour: "2-digit",
      hourCycle: "h23",
    }).format(date),
  );

  const period =
    hour < 5 ? "night" :
    hour < 12 ? "morning" :
    hour < 17 ? "afternoon" :
    hour < 21 ? "evening" :
    "night";

  if (clockedOut) {
    return period === "night"
      ? "You’re clocked out. Rest well tonight."
      : `You’re clocked out. Enjoy the rest of your ${period}.`;
  }

  return period === "night"
    ? "You’re clocked in. Have a productive night shift."
    : `You’re clocked in. Have a productive ${period}.`;
}