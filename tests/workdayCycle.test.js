
import test from "node:test";
import assert from "node:assert/strict";
import {
  monthWindow,
  workdayCycle
} from "../src/lib/workdayCycle.js";

const t = value => Date.parse(value + "+02:00");
const now = t("2026-11-22T12:00:00");
const options = { now, ...monthWindow(now) };

const session = (a, b) => ({
  clocked_in_at: a + "+02:00",
  clocked_out_at: b ? b + "+02:00" : null
});

const shift = (a, b) => ({
  starts_at: a + "+02:00",
  ends_at: b + "+02:00"
});

test("month boundaries use South African time", () => {
  const result = monthWindow(t("2026-12-01T00:30:00"));
  assert.equal(result.from, t("2026-12-01T00:00:00"));
  assert.equal(result.to, t("2027-01-01T00:00:00"));
});

test("multiple sessions count as one worked day", () => {
  assert.deepEqual(workdayCycle({
    ...options,
    sessions: [
      session("2026-11-20T08:00:00", "2026-11-20T10:00:00"),
      session("2026-11-20T12:00:00", "2026-11-20T16:00:00")
    ]
  }), { worked: 1, notWorked: 0, total: 1 });
});

test("overnight work respects exact midnight", () => {
  assert.equal(workdayCycle({
    ...options,
    sessions: [
      session("2026-11-20T23:00:00", "2026-11-21T01:00:00")
    ]
  }).worked, 2);

  assert.equal(workdayCycle({
    ...options,
    sessions: [
      session("2026-11-20T23:00:00", "2026-11-21T00:00:00")
    ]
  }).worked, 1);
});

test("missed days exclude today and future days", () => {
  assert.deepEqual(workdayCycle({
    ...options,
    shifts: [
      shift("2026-11-20T08:00:00", "2026-11-20T16:00:00"),
      shift("2026-11-20T17:00:00", "2026-11-20T18:00:00"),
      shift("2026-11-22T08:00:00", "2026-11-22T10:00:00"),
      shift("2026-11-23T08:00:00", "2026-11-23T16:00:00")
    ]
  }), { worked: 0, notWorked: 1, total: 1 });
});

test("partial attendance is not also a missed day", () => {
  assert.deepEqual(workdayCycle({
    ...options,
    shifts: [
      shift("2026-11-20T08:00:00", "2026-11-20T16:00:00")
    ],
    sessions: [
      session("2026-11-20T09:00:00", "2026-11-20T10:00:00")
    ]
  }), { worked: 1, notWorked: 0, total: 1 });
});

test("open work counts today; invalid entries do not", () => {
  assert.equal(workdayCycle({
    ...options,
    sessions: [
      session("2026-11-22T08:00:00", null),
      { clocked_in_at: "invalid" },
      session("2026-11-20T08:00:00", "2026-11-20T08:00:00")
    ]
  }).worked, 1);
});

test("outside-month and future attendance are excluded", () => {
  assert.deepEqual(workdayCycle({
    ...options,
    sessions: [
      session("2026-10-31T08:00:00", "2026-10-31T16:00:00"),
      session("2026-11-23T08:00:00", "2026-11-23T16:00:00")
    ]
  }), { worked: 0, notWorked: 0, total: 0 });
});
