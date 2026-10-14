import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, LoaderCircle, RefreshCw } from "lucide-react";
import { supabase } from "../lib/supabase.js";
import EmployeeWorkGraph from "./EmployeeWorkGraph.jsx";

const sections = [
  ["profile", "Profile & account"],
  ["tasks", "Tasks"],
  ["attendance", "Time & attendance"],
  ["shifts", "Scheduled shifts"],
  ["leave", "Leave requests & reviews"],
  ["shift_requests", "Shift-change requests & reviews"],
  ["payslips", "Payslips & published statements"],
  ["notices", "Published notices"],
  ["workplace", "Workplace records & messages"],
  ["responses", "Replies, survey responses & completions"],
  ["activity", "Recorded activity"]
];

const labels = {
  id: "Reference",
  display_name: "Full name",
  job_title: "Job title",
  employee_since: "Employee profile created",
  account_created_at: "Account created",
  last_sign_in_at: "Last sign-in",
  banned_until: "Account suspension until",
  email_confirmed_at: "Email verified",
  phone_confirmed_at: "Phone verified",
  employee_id: "Employee",
  assignee_id: "Assigned to",
  created_by: "Created by",
  author_id: "Published by",
  published_by: "Published by",
  reviewed_by: "Reviewed by",
  clocked_in_at: "Clocked in",
  clocked_out_at: "Clocked out",
  photo_updated_at: "Photo updated",
  gross_pay: "Gross pay (ZAR)",
  deductions: "Deductions (ZAR)",
  net_pay: "Net pay (ZAR)"
};

const humanize = text => String(text)
  .replaceAll("_", " ")
  .replace(/^./, letter => letter.toUpperCase());

const money = new Intl.NumberFormat("en-ZA", {
  style: "currency",
  currency: "ZAR"
});

function displayValue(key, value, people) {
  if (value === null || value === undefined || value === "") {
    return "Not recorded";
  }

  if (typeof value === "object") {
    return JSON.stringify(value, null, 2);
  }

  if (["gross_pay", "deductions", "net_pay"].includes(key)) {
    return Number.isFinite(Number(value))
      ? money.format(Number(value))
      : "Not recorded";
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  if (
    people.has(value) &&
    (
      key.endsWith("_id") ||
      ["created_by", "reviewed_by", "published_by"].includes(key)
    )
  ) {
    return `${people.get(value)}\n${value}`;
  }

  if (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}(T| |$)/.test(value)
  ) {
    const dayOnly = value.length === 10;
    const date = new Date(
      dayOnly ? `${value}T12:00:00Z` : value
    );

    if (Number.isFinite(date.getTime())) {
      return new Intl.DateTimeFormat("en-ZA", {
        timeZone: "Africa/Johannesburg",
        day: "numeric",
        month: "short",
        year: "numeric",
        ...(dayOnly ? {} : {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false
        })
      }).format(date);
    }
  }

  return String(value);
}

function Fields({ values, people }) {
  return (
    <dl className="employee-report-fields">
      {Object.entries(values)
        .filter(([key]) => key !== "photo_path")
        .map(([key, value]) => (
          <div className="employee-report-field" key={key}>
            <dt>{labels[key] || humanize(key)}</dt>
            <dd>{displayValue(key, value, people)}</dd>
          </div>
        ))}
    </dl>
  );
}

export default function EmployeeReport({
  employee,
  viewerId,
  employees = [],
  onBack
}) {
  const [section, setSection] = useState("profile");
  const [page, setPage] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const title = useRef(null);

  const people = useMemo(
    () => new Map(
      employees.map(person => [person.id, person.display_name])
    ),
    [employees]
  );

  const key = JSON.stringify([
    viewerId, employee.id, section, page, refresh
  ]);

  const report = result?.key === key ? result.data : null;
  const sectionName =
    sections.find(item => item[0] === section)?.[1] || "Records";

  useEffect(() => {
    title.current?.focus();
  }, []);

  useEffect(() => {
    let live = true;
    const controller = new AbortController();

    setBusy(true);
    setError("");

    const timer = window.setTimeout(() => {
      controller.abort();

      if (live) {
        setBusy(false);
        setError("The report timed out. Press Retry.");
      }
    }, 15000);

    async function load() {
      try {
        const { data: auth, error: authError } =
          await supabase.auth.getSession();

        if (!live || controller.signal.aborted) return;
        if (authError) throw authError;

        if (!viewerId || auth.session?.user.id !== viewerId) {
          throw new Error(
            "Your account changed. Reopen the employee report."
          );
        }

        const { data, error: reportError } = await supabase
          .rpc("get_employee_report", {
            p_employee_id: employee.id,
            p_section: section,
            p_page: page
          })
          .abortSignal(controller.signal);

        if (!live || controller.signal.aborted) return;
        if (reportError) throw reportError;

        if (
          data?.employee?.id !== employee.id ||
          data.section !== section ||
          data.page !== page ||
          !Array.isArray(data.records)
        ) {
          throw new Error(
            "The report response was invalid. Press Retry."
          );
        }

        setResult({ key, data });
      } catch (problem) {
        if (live && !controller.signal.aborted) {
          setError(
            problem.message || "Could not load the employee report."
          );
        }
      } finally {
        window.clearTimeout(timer);

        if (live && !controller.signal.aborted) {
          setBusy(false);
        }
      }
    }

    load();

    return () => {
      live = false;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [key]);

  return (
    <section className="employee-report">
      <div className="employee-report-actions">
        <button type="button" onClick={onBack}>
          <ArrowLeft size={16} /> Back to photo
        </button>

        <button
          type="button"
          disabled={busy}
          onClick={() => setRefresh(value => value + 1)}
        >
          <RefreshCw size={16} /> Refresh
        </button>
      </div>

      <p className="employee-report-eyebrow">
        ADMINISTRATION · CONFIDENTIAL
      </p>

      <h2 ref={title} tabIndex={-1}>Employee report</h2>

      <label className="employee-report-select">
        <span>Report section</span>
        <select
          value={section}
          disabled={busy}
          onChange={event => {
            setSection(event.target.value);
            setPage(0);
          }}
        >
          {sections.map(([id, label]) => (
            <option key={id} value={id}>{label}</option>
          ))}
        </select>
      </label>
{section === "attendance" && (
  <EmployeeWorkGraph
    employeeId={employee.id}
    viewerId={viewerId}
  />
)}

      {busy && (
        <p className="employee-report-loading" role="status">
          <LoaderCircle className="spin" size={17} />
          Loading employee records…
        </p>
      )}

      {error && (
        <div className="employee-report-error" role="alert">
          <p>{error}</p>
          <button
            type="button"
            onClick={() => setRefresh(value => value + 1)}
          >
            Retry
          </button>
        </div>
      )}

      {!busy && !error && report && (
        section === "profile" ? (
          <Fields values={report.employee} people={people} />
        ) : (
          <>
            <p className="employee-report-count">
              {sectionName} · {report.total} records related to this employee
            </p>

            {!report.records.length && (
              <p className="employee-report-empty">
                No records on this page.
              </p>
            )}

            <div className="employee-report-records">
              {report.records.map(record => (
                <article
                  className="employee-report-record"
                  key={record.id}
                >
                  <div className="employee-report-record-heading">
                    <strong>
                      {record.title ||
                        record.record_title ||
                        humanize(
                          record.leave_type ||
                          record.kind ||
                          sectionName
                        )}
                    </strong>

                    {record.status && (
                      <span className="employee-report-status">
                        {humanize(record.status)}
                      </span>
                    )}
                  </div>

                  <small>
                    {displayValue(
                      "date",
                      record.created_at ||
                        record.clocked_in_at ||
                        record.published_at ||
                        record.starts_at,
                      people
                    )}
                  </small>

                  {(record.description ||
                    record.body ||
                    record.note ||
                    record.reason) && (
                    <p className="employee-report-preview">
                      {record.description ||
                        record.body ||
                        record.note ||
                        record.reason}
                    </p>
                  )}

                  <details>
                    <summary>Full record</summary>
                    <Fields values={record} people={people} />
                  </details>
                </article>
              ))}
            </div>

            <div className="employee-report-pagination">
              <button
                type="button"
                disabled={page === 0}
                onClick={() => setPage(value => value - 1)}
              >
                Previous
              </button>

              <span>
                {report.records.length
                  ? `${page * 25 + 1}–${page * 25 + report.records.length} of ${report.total}`
                  : "0 records on this page"}
              </span>

              <button
                type="button"
                disabled={!report.has_more}
                onClick={() => setPage(value => value + 1)}
              >
                Next
              </button>
            </div>
          </>
        )
      )}

      {!busy && !error && report && (
        <p className="employee-report-updated">
          Updated {displayValue("date", report.generated_at, people)}
        </p>
      )}
    </section>
  );
}