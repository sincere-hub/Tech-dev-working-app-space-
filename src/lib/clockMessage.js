export function clockMessage(isClockOut, at = Date.now()) {
  const date = new Date(at ?? Date.now());

  const hour = Number(
    new Intl.DateTimeFormat("en-ZA", {
      timeZone: "Africa/Johannesburg",
      hour: "2-digit",
      hourCycle: "h23",
    }).format(Number.isFinite(date.getTime()) ? date : new Date())
  );

  const period =
    hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";

  if (isClockOut) {
    const farewell = period === "morning" ? "day" : period;
    return `Clocked out. Have a nice ${farewell}!`;
  }

 if (hour >= 17 || hour < 6) {
  return "Clocked in. Have a productive night shift!";
}

const workPeriod = period === "morning" ? "day" : period;
return `Clocked in. Have a productive ${workPeriod}!`;
}