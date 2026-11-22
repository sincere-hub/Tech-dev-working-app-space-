
const DAY = 86400000;
const HOUR = 3600000;
const OFFSET = 7200000;
const stamp = value => Date.parse(value);

export function mergeRanges(ranges) {
  const sorted = ranges
    .filter(([a,b]) =>
      Number.isFinite(a) && Number.isFinite(b) && b > a
    )
    .sort((a,b) => a[0] - b[0]);

  const result = [];
  for (const [a,b] of sorted) {
    const last = result.at(-1);
    if (last && a <= last[1]) {
      last[1] = Math.max(last[1], b);
    } else {
      result.push([a,b]);
    }
  }
  return result;
}

export function subtractRanges(base, covered) {
  const output = [];
  const cuts = mergeRanges(covered);

  for (const [a,b] of mergeRanges(base)) {
    let cursor = a;
    for (const [x,y] of cuts) {
      if (y <= cursor) continue;
      if (x >= b) break;
      if (x > cursor) output.push([cursor, Math.min(x,b)]);
      cursor = Math.max(cursor,y);
      if (cursor >= b) break;
    }
    if (cursor < b) output.push([cursor,b]);
  }
  return output;
}

const dayStart = t =>
  Math.floor((t + OFFSET) / DAY) * DAY - OFFSET;

const clip = (ranges,a,b) =>
  mergeRanges(
    ranges.map(([x,y]) => [Math.max(a,x), Math.min(b,y)])
  );

function measure(ranges) {
  const sums = [0];
  for (const [a,b] of ranges) {
    sums.push(sums.at(-1) + b - a);
  }

  return time => {
    let lo = 0;
    let hi = ranges.length;

    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (ranges[mid][0] < time) lo = mid + 1;
      else hi = mid;
    }

    if (!lo) return 0;
    const i = lo - 1;

    return (
      sums[i] +
      Math.max(0, Math.min(time,ranges[i][1]) - ranges[i][0])
    ) / HOUR;
  };
}

export function availabilitySeries({
  sessions = [],
  shifts = [],
  leaves = [],
  from,
  to,
  now,
  live = false
}) {
  const end = Math.min(to,now);
  const blue = [];
  const red = [];
  const outs = [];
  const unavailableNodes = [];

  const worked = mergeRanges(
    sessions.map(s => [
      stamp(s.clocked_in_at),
      s.clocked_out_at ? stamp(s.clocked_out_at) : end
    ])
  );

  const scheduled = mergeRanges(
    shifts.map(s => [stamp(s.starts_at), stamp(s.ends_at)])
  );

  const leave = mergeRanges(
    leaves
      .filter(l => l.status === "approved")
      .map(l => [
        stamp(l.start_date + "T00:00:00+02:00"),
        stamp(l.end_date + "T00:00:00+02:00") + DAY
      ])
  );

  for (let day = dayStart(from); day < end; day += DAY) {
    const a = Math.max(day,from);
    const b = Math.min(day + DAY,end);

    const w = clip(worked,a,b);
    const s = clip(scheduled,a,b);
    const l = clip(leave,a,b);

    const missing = subtractRanges(
      s,
      mergeRanges([...w,...l])
    );

    const absent = subtractRanges(
      mergeRanges([...missing,...l]),
      w
    );

    const blueHours = measure(w);
    const redHours = measure(absent);

    const daily = sessions.filter(row =>
      stamp(row.clocked_in_at) < b &&
      (!row.clocked_out_at || stamp(row.clocked_out_at) > a)
    );

    const times = new Set([a]);

    for (const row of daily) {
      times.add(Math.max(a,stamp(row.clocked_in_at)));

      if (row.clocked_out_at) {
        times.add(Math.min(b,stamp(row.clocked_out_at)));
      } else {
        times.add(b);
      }
    }

    if (w.length) {
      for (const time of [...times].sort((x,y) => x-y)) {
        blue.push({time, hours: blueHours(time)});
      }
    }

    for (const row of daily) {
      const time = stamp(row.clocked_out_at);

      if (Number.isFinite(time) && time >= a && time <= b) {
        outs.push({
          time,
          hours: blueHours(time),
          id: row.id,
          auto: row.auto_clocked_out === true
        });
      }
    }

    const redTimes = new Set([a,b]);

    for (const [x,y] of absent) {
      redTimes.add(x);
      redTimes.add(y);
    }

    for (const time of [...redTimes].sort((x,y) => x-y)) {
      red.push({time, hours: redHours(time)});
    }

    if (absent.length) {
      unavailableNodes.push({
        time: b,
        hours: redHours(b),
        leave: l.length > 0,
        missed: missing.length > 0
      });
    }
  }

  const last = blue.at(-1);

  const livePoint =
    live &&
    sessions.some(s =>
      !s.clocked_out_at && stamp(s.clocked_in_at) <= end
    ) &&
    last?.time === end
      ? last
      : null;

  return {blue,red,outs,unavailableNodes,livePoint};
}
