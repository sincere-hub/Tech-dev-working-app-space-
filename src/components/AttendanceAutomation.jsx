import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { createPortal } from "react-dom";

import {
  Bell,
  Clock3,
  RefreshCw,
  Settings2,
  ShieldCheck,
  X,
} from "lucide-react";

import { supabase } from "../lib/supabase.js";

import {
  attendanceTime,
  entrySignature,
  warningKey,
} from "./attendanceState.js";

import "./attendance-automation.css";

async function request(name, args = {}, signal) {
  const { data, error } = await supabase
    .rpc(name, args)
    .abortSignal(signal);

  if (error) throw new Error(error.message);

  return data;
}

function Dialog({
  title,
  children,
  onClose,
  className = "",
}) {
  const ref = useRef(null);
  const close = useRef(onClose);

  close.current = onClose;

  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;

    document.body.style.overflow = "hidden";
    dialog.showModal();

    return () => {
      if (dialog.open) dialog.close();

      document.body.style.overflow = overflow;

      if (previous?.isConnected) {
        previous.focus({ preventScroll: true });
      }
    };
  }, []);

  return createPortal(
    <dialog
      ref={ref}
      className={`td-att-dialog ${className}`}
      aria-label={title}
      onCancel={event => {
        event.preventDefault();
        close.current?.();
      }}
    >
      <header>
        <h2>{title}</h2>

        <button
          type="button"
          className="td-att-icon"
          aria-label="Close"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </header>

      {children}
    </dialog>,
    document.body
  );
}

function AdminSettings({ onClose, onSaved }) {
  const [context, setContext] = useState(null);
  const [day, setDay] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState(null);

  const [employeeTime, setEmployeeTime] =
    useState("18:00");

  const [company, setCompany] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [refresh, setRefresh] = useState(0);

  const alive = useRef(true);
  const lock = useRef(false);
  const initialized = useRef(false);
  const loadVersion = useRef(0);
  const mutation = useRef(null);

  useEffect(() => {
    alive.current = true;

    return () => {
      alive.current = false;
      mutation.current?.abort();
    };
  }, []);

  useEffect(() => {
    const version = ++loadVersion.current;
    const controller = new AbortController();

    let timeout;

    setLoading(true);

    const debounce = setTimeout(async () => {
      timeout = setTimeout(
        () => controller.abort(),
        15000
      );

      try {
        const value = await request(
          "td_attendance_admin_context",
          {
            p_day: day || null,
            p_search: search.trim(),
            p_page: page,
          },
          controller.signal
        );

        if (
          version !== loadVersion.current ||
          !alive.current
        ) {
          return;
        }

        setContext(value);

        if (!initialized.current) {
          initialized.current = true;

          setCompany({
            enabled: value.settings.enabled,
            cutoff: value.settings.cutoff.slice(0, 5),
            revision: value.settings.revision,
          });
        }
      } catch (failure) {
        if (
          version === loadVersion.current &&
          alive.current
        ) {
          setError(
            controller.signal.aborted
              ? "Settings loading timed out. Press Reload settings."
              : failure.message
          );
        }
      } finally {
        clearTimeout(timeout);

        if (
          version === loadVersion.current &&
          alive.current
        ) {
          setLoading(false);
        }
      }
    }, 250);

    return () => {
      clearTimeout(debounce);
      clearTimeout(timeout);
      controller.abort();
    };
  }, [day, search, page, refresh]);

  function reload() {
    initialized.current = false;

    setSelected(null);
    setError("");
    setNotice("");
    setRefresh(value => value + 1);
  }

  async function save(action) {
    if (
      lock.current ||
      !context ||
      !company ||
      loading
    ) {
      return;
    }

    if (!navigator.onLine) {
      setError(
        "Connect to the internet to save settings."
      );
      return;
    }

    if (action !== "company" && !selected) return;

    if (
      action === "company" &&
      company.enabled &&
      !context.settings.enabled &&
      !window.confirm(
        "Enable automatic clock-out? Open sessions past their cutoff, including forgotten sessions from earlier days, will close at their applicable cutoff."
      )
    ) {
      return;
    }

    lock.current = true;

    setSaving(true);
    setError("");
    setNotice("");

    const controller = new AbortController();
    mutation.current = controller;

    const timeout = setTimeout(
      () => controller.abort(),
      20000
    );

    try {
      const result = await request(
        "td_attendance_save",
        {
          p_action: action,

          p_expected_revision:
            action === "company"
              ? company.revision
              : context.settings.revision,

          p_enabled:
            action === "company"
              ? company.enabled
              : null,

          p_cutoff:
            action === "clear"
              ? null
              : action === "company"
                ? company.cutoff
                : employeeTime,

          p_employee:
            action === "company"
              ? null
              : selected.id,

          p_day:
            action === "company"
              ? null
              : day || context.work_date,
        },
        controller.signal
      );

      if (!result?.saved) {
        throw new Error(
          "The save was not confirmed. Reload settings."
        );
      }

      if (!alive.current) return;

      initialized.current = false;
      setSelected(null);

      setNotice(
        action === "company"
          ? "Company attendance settings saved."
          : action === "clear"
            ? "Employee will follow the company cutoff on this date."
            : "Employee cutoff saved for the selected date."
      );

      setRefresh(value => value + 1);
      onSaved?.();
    } catch (failure) {
      if (alive.current) {
        setError(
          controller.signal.aborted
            ? "The request timed out. Reload settings to check whether it saved."
            : failure.message
        );
      }
    } finally {
      clearTimeout(timeout);
      lock.current = false;

      if (alive.current) setSaving(false);
    }
  }

  const people = context?.employees || [];

  return (
    <Dialog
      title="Attendance settings"
      onClose={saving ? () => {} : onClose}
    >
      <div className="td-att-admin-body">
        <p className="td-att-muted">
          All times use South African time (SAST).
          App access stays available after clock-out.
        </p>

        <button
          className="td-att-secondary"
          type="button"
          disabled={saving || loading}
          onClick={reload}
        >
          <RefreshCw size={15} />
          Reload settings
        </button>

        {loading && (
          <p role="status">Loading settings…</p>
        )}

        {error && (
          <p className="td-att-error" role="alert">
            {error}
          </p>
        )}

        {notice && (
          <p className="td-att-success" role="status">
            {notice}
          </p>
        )}

        {company && (
          <fieldset disabled={saving || loading}>
            <legend>
              <ShieldCheck size={18} />
              Company cutoff
            </legend>

            <label className="td-att-check">
              <input
                type="checkbox"
                checked={company.enabled}
                onChange={event =>
                  setCompany(value => ({
                    ...value,
                    enabled: event.target.checked,
                  }))
                }
              />

              Enable automatic clock-out
            </label>

            <label className="td-att-field">
              Daily cutoff time

              <input
                type="time"
                step="60"
                value={company.cutoff}
                onChange={event =>
                  setCompany(value => ({
                    ...value,
                    cutoff: event.target.value,
                  }))
                }
              />
            </label>

            <p className="td-att-muted">
              Repeats daily. Individual cutoffs below
              take precedence on their selected date.
              Moving the cutoff earlier can close
              open sessions immediately.
            </p>

            <button
              type="button"
              className="td-att-primary"
              disabled={!company.cutoff}
              onClick={() => save("company")}
            >
              {saving
                ? "Saving…"
                : "Save company settings"}
            </button>
          </fieldset>
        )}

        {context && (
          <fieldset disabled={saving}>
            <legend>
              <Clock3 size={18} />
              One employee
            </legend>

            <label className="td-att-field">
              Date

              <input
                type="date"
                min={context.today}
                value={day || context.work_date}
                onChange={event => {
                  setDay(event.target.value);
                  setSelected(null);
                  setPage(0);
                }}
              />
            </label>

            <label className="td-att-field">
              Find an employee

              <input
                type="search"
                placeholder="Search by name"
                value={search}
                maxLength={100}
                onChange={event => {
                  setSearch(event.target.value);
                  setPage(0);
                }}
              />
            </label>

            <div
              className="td-att-people"
              aria-label="Employees"
              aria-busy={loading}
            >
              {people.slice(0, 50).map(person => (
                <button
                  type="button"
                  key={person.id}
                  disabled={loading}
                  className={
                    selected?.id === person.id
                      ? "is-selected"
                      : ""
                  }
                  aria-pressed={
                    selected?.id === person.id
                  }
                  onClick={() => {
                    setSelected(person);

                    setEmployeeTime(
                      person.override_cutoff ||
                        context.settings.cutoff.slice(
                          0,
                          5
                        )
                    );
                  }}
                >
                  <span>
                    <strong>
                      {person.display_name || "Employee"}
                    </strong>

                    <small>{person.role}</small>
                  </span>

                  <span>
                    {person.override_cutoff ||
                      "Company time"}
                  </span>
                </button>
              ))}

              {!people.length && !loading && (
                <p>No matching employees.</p>
              )}
            </div>

            <div className="td-att-actions">
              <button
                type="button"
                className="td-att-secondary"
                disabled={loading || page === 0}
                onClick={() =>
                  setPage(value => value - 1)
                }
              >
                Previous
              </button>

              <button
                type="button"
                className="td-att-secondary"
                disabled={
                  loading || people.length <= 50
                }
                onClick={() =>
                  setPage(value => value + 1)
                }
              >
                Next
              </button>
            </div>

            {selected && (
              <div className="td-att-selected">
                <strong>
                  {selected.display_name || "Employee"}
                </strong>

                <label className="td-att-field">
                  Cutoff for {day || context.work_date}

                  <input
                    type="time"
                    step="60"
                    value={employeeTime}
                    onChange={event =>
                      setEmployeeTime(event.target.value)
                    }
                  />
                </label>

                <div className="td-att-actions">
                  <button
                    type="button"
                    className="td-att-primary"
                    disabled={loading || !employeeTime}
                    onClick={() => save("employee")}
                  >
                    Save employee cutoff
                  </button>

                  <button
                    type="button"
                    className="td-att-secondary"
                    disabled={
                      loading ||
                      !selected.override_cutoff
                    }
                    onClick={() => save("clear")}
                  >
                    Use company time
                  </button>
                </div>
              </div>
            )}

            <p className="td-att-muted">
              An extension after clock-out allows a
              new clock-in. Closed sessions and the gap
              between sessions remain unchanged.
              Individual times apply only while
              company automation is enabled.
            </p>
          </fieldset>
        )}
      </div>
    </Dialog>
  );
}

export default function AttendanceAutomation({
  userId,
  role,
  openEntryId = "",
  onChanged,
}) {
  const [status, setStatus] = useState(null);
  const [, setTick] = useState(0);
  const [error, setError] = useState("");
  const [adminOpen, setAdminOpen] = useState(false);
  const [dismissed, setDismissed] = useState("");

  const callbacks = useRef(onChanged);
  const signature = useRef(null);
  const clock = useRef(null);
  const requestVersion = useRef(0);
  const controller = useRef(null);
  const alive = useRef(false);

  callbacks.current = onChanged;

  useEffect(() => {
    if (role !== "admin") setAdminOpen(false);
  }, [role]);

  const refresh = useCallback(async () => {
    if (
      !userId ||
      !alive.current ||
      document.visibilityState === "hidden"
    ) {
      return;
    }

    if (!navigator.onLine) {
      setError(
        "Offline: reconnect to refresh your attendance cutoff."
      );
      return;
    }

    const version = ++requestVersion.current;

    controller.current?.abort();

    const aborter = new AbortController();
    controller.current = aborter;

    const timeout = setTimeout(
      () => aborter.abort(),
      15000
    );

    try {
      const result = await request(
        "td_attendance_status",
        {},
        aborter.signal
      );

      if (
        version !== requestVersion.current ||
        !alive.current
      ) {
        return;
      }

      if (
        !result?.server_now ||
        result.employee_id !== userId
      ) {
        throw new Error(
          "Your account changed. Reopen the workspace."
        );
      }

      const next = entrySignature(result);

      clock.current = {
        stamp: Date.parse(result.server_now),
        at: performance.now(),
      };

      setStatus(result);
      setError("");

      if (signature.current !== next) {
        Promise.resolve(
          callbacks.current?.()
        ).catch(() => {});
      }

      signature.current = next;
    } catch (failure) {
      if (
        version === requestVersion.current &&
        alive.current
      ) {
        setError(
          aborter.signal.aborted
            ? "Attendance refresh timed out. Retry when connected."
            : failure.message
        );
      }
    } finally {
      clearTimeout(timeout);
    }
  }, [userId]);

  useEffect(() => {
    alive.current = true;

    refresh();

    const poll = setInterval(refresh, 30000);

    const timer = setInterval(() => {
      if (
        document.visibilityState !== "hidden"
      ) {
        setTick(value => value + 1);
      }
    }, 1000);

    const visible = () => {
      if (
        document.visibilityState === "visible"
      ) {
        refresh();
      }
    };

    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);

    document.addEventListener(
      "visibilitychange",
      visible
    );

    return () => {
      alive.current = false;
      ++requestVersion.current;

      controller.current?.abort();

      clearInterval(poll);
      clearInterval(timer);

      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);

      document.removeEventListener(
        "visibilitychange",
        visible
      );
    };
  }, [refresh, openEntryId]);

  const serverNow = clock.current
    ? clock.current.stamp +
      performance.now() -
      clock.current.at
    : 0;

  const key = warningKey(
    userId,
    status,
    serverNow
  );

  const acknowledged = (() => {
    if (!key) return true;
    if (dismissed === key) return true;

    try {
      return sessionStorage.getItem(key) === "seen";
    } catch {
      return false;
    }
  })();

  const openCutoff =
    status?.open_entry?.attendance_cutoff_at;

  useEffect(() => {
    if (!openCutoff || !clock.current) return;

    const remaining =
      Date.parse(openCutoff) -
      (
        clock.current.stamp +
        performance.now() -
        clock.current.at
      );

    if (remaining <= 0) return;

    const timeout = setTimeout(
      refresh,
      Math.min(remaining + 100, 2147483647)
    );

    return () => clearTimeout(timeout);
  }, [
    openCutoff,
    refresh,
    status?.server_now,
  ]);

  function acknowledge() {
    try {
      sessionStorage.setItem(key, "seen");
    } catch {
      // Dismissed for this mounted screen.
    }

    setDismissed(key);
  }

  return (
    <>
      <div
        className="td-att-status"
        aria-label="Attendance cutoff"
      >
        <Clock3 size={17} />

        <span>
          {status?.enabled
            ? status.can_clock_in
              ? `Automatic clock-out: ${attendanceTime(
                  status.cutoff_at
                )} SAST`
              : "Attendance is closed for today. You can still use the app."
            : status
              ? "Automatic clock-out is off."
              : "Checking attendance…"}
        </span>

        {role === "admin" && (
          <button
            type="button"
            className="td-att-secondary"
            onClick={() => setAdminOpen(true)}
          >
            <Settings2 size={16} />
            Attendance settings
          </button>
        )}

        {error && (
          <span
            className="td-att-error"
            role="status"
          >
            {error}

            <button
              type="button"
              className="td-att-link"
              onClick={refresh}
            >
              Retry
            </button>
          </span>
        )}
      </div>

      {key &&
        !acknowledged &&
        !adminOpen && (
          <Dialog
            title="Your workday is ending soon"
            onClose={acknowledge}
          >
            <div className="td-att-warning">
              <span className="td-att-warning-icon">
                <Bell size={30} />
              </span>

              <p className="td-att-eyebrow">
                AUTOMATIC CLOCK-OUT
              </p>

              <h3>
                Clock-out at{" "}
                {attendanceTime(openCutoff)}
              </h3>

              <p>
                Please finish your remaining work and
                save your progress. You will be clocked
                out automatically at{" "}
                <strong>
                  {attendanceTime(openCutoff)} South
                  African time
                </strong>.
              </p>

              <p>
                You can continue using TechDev
                afterwards. Time spent after clock-out
                will not be added to your attendance
                hours.
              </p>

              <button
                type="button"
                className="td-att-primary"
                onClick={acknowledge}
              >
                Understood, continue working
              </button>
            </div>
          </Dialog>
        )}

      {adminOpen && role === "admin" && (
        <AdminSettings
          onClose={() => setAdminOpen(false)}
          onSaved={refresh}
        />
      )}
    </>
  );
}