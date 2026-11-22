
const DAY = 86400000, OFFSET = 7200000;

export const sastDay = value =>
  Math.floor((value + OFFSET) / DAY) * DAY - OFFSET;

export function monthWindow(now) {
  const date = new Date(now + OFFSET);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();

  return {
    from: Date.UTC(year, month, 1) - OFFSET,
    to: Date.UTC(year, month + 1, 1) - OFFSET
  };
}

export function workdayCycle({
  sessions = [],
  shifts = [],
  now,
  from,
  to
}) {
  const worked = new Set();
  const scheduled = new Set();
  const end = Math.min(to, now);
  const today = sastDay(now);

  function visit(a, b, callback) {
    a = Math.max(from, a);
    b = Math.min(end, b);

    if (
      !Number.isFinite(a) ||
      !Number.isFinite(b) ||
      b <= a
    ) return;

    for (let day = sastDay(a); day < b; day += DAY) {
      callback(day);
    }
  }

  for (const row of sessions) {
    const start = Date.parse(row.clocked_in_at);
    const stop = row.clocked_out_at
      ? Date.parse(row.clocked_out_at)
      : now;

    visit(start, stop, day => worked.add(day));
  }

  for (const row of shifts) {
    visit(
      Date.parse(row.starts_at),
      Date.parse(row.ends_at),
      day => {
        if (day < today) scheduled.add(day);
      }
    );
  }

  const notWorked =
    [...scheduled].filter(day => !worked.has(day)).length;

  return {
    worked: worked.size,
    notWorked,
    total: worked.size + notWorked
  };
}
