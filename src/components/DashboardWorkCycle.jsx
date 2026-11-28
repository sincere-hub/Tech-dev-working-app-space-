
import { useEffect, useId, useState } from "react";
import { supabase } from "../lib/supabase.js";
import { monthWindow, workdayCycle } from "../lib/workdayCycle.js";
import "./dashboard-work-cycle.css";
import './attendance-cycle-clean.css';

export default function DashboardWorkCycle({
  employeeId,
  refreshKey
}) {
  const [snapshot, setSnapshot] = useState(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");

  useEffect(() => {
    if (!employeeId) return;

    let alive = true;
    let running = false;
    let controller;
    let timer;

    async function refresh() {
      if (document.hidden || running) return;

      running = true;
      controller = new AbortController();
      const request = controller;
      const timeout = setTimeout(() => request.abort(), 15000);

      try {
        const {
          data: auth,
          error: authError
        } = await supabase.auth.getSession();

        if (authError) throw authError;

        if (auth.session?.user.id !== employeeId) {
          throw new Error(
            "Reopen the dashboard after signing in."
          );
        }

        const now = Date.now();
        const { from, to } = monthWindow(now);

        async function read(table, columns, apply) {
          const all = [];

          for (
            let offset = 0;
            offset <= 10000;
            offset += 500
          ) {
            const { data, error: problem } = await apply(
              supabase
                .from(table)
                .select(columns)
                .eq("employee_id", employeeId)
            )
              .order("id")
              .range(offset, offset + 499)
              .abortSignal(request.signal);

            if (problem) throw problem;

            if (
              !Array.isArray(data) ||
              data.some(row => row.employee_id !== employeeId)
            ) {
              throw new Error(
                "Attendance records could not be verified."
              );
            }

            if (all.length + data.length > 10000) {
              throw new Error(
                "Too many attendance records for this month."
              );
            }

            all.push(...data);

            if (data.length < 500) return all;
          }

          throw new Error(
            "Attendance records could not be loaded completely."
          );
        }

        const start = new Date(from).toISOString();
        const end =
          new Date(Math.min(to, now)).toISOString();

        const [sessions, shifts] = await Promise.all([
          read(
            "time_entries",
            "id,employee_id,clocked_in_at,clocked_out_at",
            q => q
              .lt("clocked_in_at", end)
              .or(
                "clocked_out_at.is.null,clocked_out_at.gt." +
                start
              )
          ),
          read(
            "shifts",
            "id,employee_id,starts_at,ends_at",
            q => q
              .lt("starts_at", end)
              .gt("ends_at", start)
          )
        ]);

        if (alive && !request.signal.aborted) {
          setSnapshot({
            employeeId,
            now,
            ...workdayCycle({
              sessions,
              shifts,
              now,
              from,
              to
            })
          });
          setError("");
        }
      } catch (failure) {
        request.abort();

        if (alive) {
          setError(
            failure?.message ||
            "Attendance analytics could not refresh."
          );
        }
      } finally {
        clearTimeout(timeout);
        running = false;

        if (alive) {
          timer = setTimeout(refresh, 60000);
        }
      }
    }

    const wake = () => {
      clearTimeout(timer);
      refresh();
    };

    refresh();

    document.addEventListener("visibilitychange", wake);
    window.addEventListener("online", wake);

    return () => {
      alive = false;
      clearTimeout(timer);
      controller?.abort();
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("online", wake);
    };
  }, [employeeId, refreshKey, retry]);

    const data = snapshot?.employeeId === employeeId ? snapshot : null;
  
  

  

  const month = new Intl.DateTimeFormat("en-ZA", {
    timeZone: "Africa/Johannesburg",
    month: "long",
    year: "numeric"
  }).format(data?.now || Date.now());

  return (
    <section
      className="td-work-cycle td-cycle-visible td-cycle-clean"
      aria-labelledby={id + "-heading"}
      aria-busy={!data && !error}
    >
      <header>
        <div>
          <p className="td-cycle-eyebrow">ATTENDANCE ANALYTICS</p>
          <h2 id={id + "-heading"}>Your work cycle</h2>
        </div>
        <span>{month}</span>
      </header>

      {error && (
        <p role="status">
          {data ? "Showing the last successful update. " : ""}
          {error}{" "}
          <button type="button" onClick={() => setRetry(value => value + 1)}>
            Retry
          </button>
        </p>
      )}

      {!data && (
        <p role="status">
          {error
            ? "Analytics unavailable. Retry to load your day counts."
            : "Loading attendance analytics…"}
        </p>
      )}

      
<div className="td-attendance-chart">
  <div className="td-attendance-wheel">
    <svg
      className="td-attendance-ring-svg"
      width="320"
      height="320"
      viewBox="0 0 320 320"
      role="img"
      aria-label={
        data
          ? month+": "+data.worked+" days worked; "+
            data.notWorked+" scheduled days not worked"
          : "Attendance cycle awaiting data"
      }
    >
      <defs>
        <linearGradient
          id={id+"-clean-work"}
          x1="0" y1="0" x2="1" y2="1"
        >
          <stop offset="0" stopColor="#087853"/>
          <stop offset=".5" stopColor="#08b49c"/>
          <stop offset="1" stopColor="#36d9ec"/>
        </linearGradient>
        <linearGradient
          id={id+"-clean-unworked"}
          x1="0" y1="0" x2="1" y2="1"
        >
          <stop offset="0" stopColor="#b63555"/>
          <stop offset=".55" stopColor="#e76076"/>
          <stop offset="1" stopColor="#ff9a7a"/>
        </linearGradient>
      </defs>

      <circle
        cx="160" cy="160" r="128"
        fill="none"
        stroke="#dfeae3"
        strokeWidth="36"
      />

      {data?.total>0&&(
        <g transform="rotate(-90 160 160)">
          {data.worked>0&&(
            <circle
              cx="160" cy="160" r="128"
              pathLength="1"
              fill="none"
              stroke={"url(#"+id+"-clean-work)"}
              strokeWidth="36"
              strokeLinecap="butt"
              strokeDasharray={(data.worked/data.total)+" 1"}
            />
          )}

          {data.notWorked>0&&(
            <circle
              cx="160" cy="160" r="128"
              pathLength="1"
              fill="none"
              stroke={"url(#"+id+"-clean-unworked)"}
              strokeWidth="36"
              strokeLinecap="butt"
              strokeDasharray={(data.notWorked/data.total)+" 1"}
              strokeDashoffset={-data.worked/data.total}
            />
          )}
        </g>
      )}
    </svg>

    <div className="td-attendance-center" aria-hidden="true">
      {data?(
        data.total>0?(
          <>
            <p>
              <i/>
              <span>
                <strong>
                  {data.worked} {data.worked===1?"day":"days"}
                </strong>{" "}worked
              </span>
            </p>

            <p className="td-attendance-unworked">
              <i/>
              <span>
                <strong>
                  {data.notWorked} {data.notWorked===1?"day":"days"}
                </strong>{" "}not worked
              </span>
            </p>
          </>
        ):(
          <p>No counted days yet this month</p>
        )
      ):(
        <p>{error?"Attendance unavailable":"Loading attendance…"}</p>
      )}
    </div>
  </div>
</div>

      
<details className="td-attendance-help">
  <summary>How days are counted</summary>
  <p>
    Worked days have recorded attendance. Not worked counts completed
    published-shift days with no attendance, including leave.
    Future days, unscheduled days off and the current incomplete day
    are excluded from the not-worked count. South African time.
  </p>
</details>
    </section>
  );
}


// TD_ATTENDANCE_CLEAN_V1
