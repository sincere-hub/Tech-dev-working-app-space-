import { useEffect, useRef, useState } from "react";
import {
  BriefcaseBusiness,
  Plus,
  RefreshCw,
  Search,
  ExternalLink,
} from "lucide-react";
import { supabase } from "../lib/supabase.js";
import EmployeeAvatar from "./EmployeeAvatar.jsx";
import "./recruiting-workspace.css";

const stages = {
  applied: "Applied",
  screening: "Screening",
  interview: "Interview",
  offer: "Offer",
  hired: "Hired",
};

const modes = {
  onsite: "On site",
  hybrid: "Hybrid",
  remote: "Remote",
};

const employment = {
  permanent: "Permanent",
  contract: "Contract",
  internship: "Internship",
  temporary: "Temporary",
  part_time: "Part time",
};

const sources = {
  email: "Email",
  referral: "Referral",
  linkedin: "LinkedIn",
  website: "Website",
  other: "Other",
};

const label = row =>
  row.disposition === "active"
    ? stages[row.stage]
    : row.disposition === "rejected"
      ? "Rejected"
      : "Withdrawn";

const date = value =>
  value
    ? new Date(
        value.length === 10
          ? `${value}T12:00:00+02:00`
          : value
      ).toLocaleDateString("en-ZA", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "Africa/Johannesburg",
      })
    : "";

const today = () => {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Africa/Johannesburg",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  return ["year", "month", "day"]
    .map(key => parts.find(part => part.type === key).value)
    .join("-");
};

function safeLink(value) {
  try {
    const url = new URL(value);

    return url.protocol === "https:" &&
      !url.username &&
      !url.password
      ? url.href
      : "";
  } catch {
    return "";
  }
}

const options = object =>
  Object.entries(object).map(([value, title]) => (
    <option key={value} value={value}>
      {title}
    </option>
  ));

function VacancyForm({
  job,
  employees,
  userId,
  role,
  busy,
  onSave,
  onCancel,
}) {
  return (
    <section className="rc-panel">
      <h3>{job ? "Edit vacancy" : "Create a vacancy"}</h3>

      <form
        onSubmit={event => {
          event.preventDefault();

          const form = new FormData(event.currentTarget);

          void onSave(
            Object.fromEntries(
              [
                "title",
                "location",
                "work_mode",
                "employment",
                "requirements",
                "owner_id",
                "status",
              ].map(key => [
                key,
                String(form.get(key) || "").trim(),
              ])
            )
          );
        }}
      >
        <fieldset disabled={busy}>
          <div className="rc-fields">
            <label>
              Role title
              <input
                name="title"
                maxLength={160}
                defaultValue={job?.title || ""}
                placeholder="For example: Frontend developer"
                required
              />
            </label>

            <label>
              Location
              <input
                name="location"
                maxLength={160}
                defaultValue={job?.location || ""}
                placeholder="For example: Thohoyandou or South Africa"
                required
              />
            </label>

            <label>
              Work arrangement
              <select
                name="work_mode"
                defaultValue={job?.work_mode || "onsite"}
              >
                {options(modes)}
              </select>
            </label>

            <label>
              Employment type
              <select
                name="employment"
                defaultValue={job?.employment || "permanent"}
              >
                {options(employment)}
              </select>
            </label>

            {role === "admin" ? (
              <label>
                Hiring owner
                <select
                  name="owner_id"
                  defaultValue={job?.owner_id || userId}
                  required
                >
                  <option value="">Choose an owner</option>
                  {employees
                    .filter(
                      person =>
                        !person.is_banned &&
                        ["manager", "admin"].includes(person.role)
                    )
                    .map(person => (
                      <option key={person.id} value={person.id}>
                        {person.display_name}
                      </option>
                    ))}
                </select>
              </label>
            ) : (
              <div>
                <input
                  name="owner_id"
                  type="hidden"
                  value={userId}
                />
                <p>You will own this vacancy.</p>
              </div>
            )}

            <label>
              Vacancy status
              <select
                name="status"
                defaultValue={job?.status || "draft"}
              >
                <option value="draft">Draft</option>
                <option value="open">Open for recruiting</option>
                <option value="closed">Closed</option>
              </select>
            </label>

            <label className="rc-wide">
              Responsibilities and assessment criteria
              <textarea
                name="requirements"
                minLength={10}
                maxLength={6000}
                defaultValue={job?.requirements || ""}
                placeholder="Describe the work, essential skills and evidence to assess consistently."
                required
              />
            </label>
          </div>

          <small>
            Open vacancies accept candidates. Closing a vacancy
            preserves its records and pauses candidate changes.
          </small>

          <div className="rc-actions">
            <button className="rc-primary" type="submit">
              {busy ? "Saving…" : "Save vacancy"}
            </button>
            <button
              className="rc-outline"
              type="button"
              onClick={onCancel}
            >
              Cancel
            </button>
          </div>
        </fieldset>
      </form>
    </section>
  );
}

function CandidateForm({ busy, onSave, onCancel }) {
  return (
    <section className="rc-panel">
      <h3>Add an application</h3>

      <form
        onSubmit={event => {
          event.preventDefault();

          const form = new FormData(event.currentTarget);

          void onSave(
            Object.fromEntries(
              [
                "full_name",
                "email",
                "phone",
                "source",
                "cv_url",
                "note",
              ].map(key => [
                key,
                String(form.get(key) || "").trim(),
              ])
            )
          );
        }}
      >
        <fieldset disabled={busy}>
          <div className="rc-fields">
            <label className="rc-wide">
              Candidate name
              <input
                name="full_name"
                maxLength={160}
                autoComplete="name"
                required
              />
            </label>

            <label>
              Email address
              <input
                name="email"
                type="email"
                maxLength={254}
                autoComplete="email"
              />
            </label>

            <label>
              Phone number
              <input
                name="phone"
                type="tel"
                maxLength={60}
                autoComplete="tel"
              />
            </label>

            <label>
              Application source
              <select name="source" defaultValue="email">
                {options(sources)}
              </select>
            </label>

            <label>
              CV or portfolio link (optional)
              <input
                name="cv_url"
                type="url"
                maxLength={2000}
                pattern="https://.*"
                placeholder="https://…"
              />
            </label>

            <label className="rc-wide">
              Initial notes (optional)
              <textarea
                name="note"
                maxLength={2000}
                placeholder="Relevant experience, application context or first follow-up."
              />
            </label>
          </div>

          <small>
            Provide an email address or phone number. Add a CV link
            only if the hiring team has permission to access it.
          </small>

          <div className="rc-actions">
            <button className="rc-primary" type="submit">
              {busy ? "Saving…" : "Add candidate"}
            </button>
            <button
              className="rc-outline"
              type="button"
              onClick={onCancel}
            >
              Cancel
            </button>
          </div>
        </fieldset>
      </form>
    </section>
  );
}

export default function RecruitingWorkspace({
  employees = [],
  userId,
  role = "employee",
}) {
  const [jobs, setJobs] = useState([]);
  const [jobId, setJobId] = useState("");
  const [candidates, setCandidates] = useState([]);
  const [candidateId, setCandidateId] = useState("");
  const [events, setEvents] = useState([]);
  const [historyFor, setHistoryFor] = useState("");
  const [historyError, setHistoryError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("active");
  const [jobEditor, setJobEditor] = useState("");
  const [adding, setAdding] = useState(false);
  const [loading, setLoading] = useState(true);
  const [candidateLoading, setCandidateLoading] = useState(false);
  const [candidatesFor, setCandidatesFor] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [jobLimit, setJobLimit] = useState(100);
  const [candidateLimit, setCandidateLimit] = useState(200);

  const locked = useRef(false);
  const jobAttempt = useRef(null);
  const candidateAttempt = useRef(null);

  const authorised = ["manager", "admin"].includes(role);

  const job = jobs.find(row => row.id === jobId) || jobs[0];

  const ready =
    !!job &&
    candidatesFor === `${job.id}:${job.version}` &&
    !candidateLoading;

  const rows = ready ? candidates : [];

  const shown = rows.filter(row => {
    const matchesStatus =
      filter === "all" ||
      (filter === "active"
        ? row.disposition === "active" && row.stage !== "hired"
        : filter === "hired"
          ? row.stage === "hired"
          : row.disposition === filter);

    const matchesSearch =
      `${row.full_name} ${row.email} ${row.phone}`
        .toLowerCase()
        .includes(query.toLowerCase());

    return matchesStatus && matchesSearch;
  });

  const candidate = shown.find(row => row.id === candidateId);

  const personName = id =>
    employees.find(person => person.id === id)?.display_name ||
    "Hiring team member";

  useEffect(() => {
    const abort = new AbortController();

    setLoading(true);
    setError("");

    if (!authorised || !supabase) {
      setJobs([]);
      setLoading(false);
      return () => abort.abort();
    }

    supabase
      .from("td_hiring_jobs")
      .select("*")
      .order("updated_at", { ascending: false })
      .order("id")
      .limit(jobLimit)
      .abortSignal(abort.signal)
      .then(({ data, error: failure }) => {
        if (abort.signal.aborted) return;

        if (failure) {
          throw new Error(
            ["42P01", "PGRST205"].includes(failure.code)
              ? "Run recruiting.sql in the Supabase SQL Editor first."
              : "Could not load vacancies. Refresh to try again."
          );
        }

        setJobs(data || []);
      })
      .catch(failure => {
        if (!abort.signal.aborted) {
          setError(failure.message);
        }
      })
      .finally(() => {
        if (!abort.signal.aborted) {
          setLoading(false);
        }
      });

    return () => abort.abort();
  }, [userId, role, jobLimit, refresh]);

  useEffect(() => {
    const abort = new AbortController();

    setCandidates([]);
    setCandidatesFor("");
    setCandidateLoading(true);

    if (!job || !authorised) {
      setCandidateLoading(false);
      return () => abort.abort();
    }

    supabase
      .from("td_hiring_candidates")
      .select("*")
      .eq("job_id", job.id)
      .order("created_at", { ascending: false })
      .order("id")
      .limit(candidateLimit)
      .abortSignal(abort.signal)
      .then(({ data, error: failure }) => {
        if (abort.signal.aborted) return;

        if (failure) {
          throw new Error(
            "Could not load applications. Refresh to try again."
          );
        }

        setCandidates(data || []);
        setCandidatesFor(`${job.id}:${job.version}`);
      })
      .catch(failure => {
        if (!abort.signal.aborted) {
          setError(failure.message);
        }
      })
      .finally(() => {
        if (!abort.signal.aborted) {
          setCandidateLoading(false);
        }
      });

    return () => abort.abort();
  }, [
    job?.id,
    job?.version,
    candidateLimit,
    refresh,
    authorised,
  ]);

  useEffect(() => {
    const abort = new AbortController();

    setEvents([]);
    setHistoryFor("");
    setHistoryError("");

    if (!candidate) return () => abort.abort();

    supabase
      .from("td_hiring_events")
      .select("*")
      .eq("candidate_id", candidate.id)
      .order("id", { ascending: false })
      .limit(20)
      .abortSignal(abort.signal)
      .then(({ data, error: failure }) => {
        if (abort.signal.aborted) return;

        if (failure) {
          throw new Error(
            "Could not load candidate history. Refresh to try again."
          );
        }

        setEvents(data || []);
        setHistoryFor(`${candidate.id}:${candidate.version}`);
      })
      .catch(failure => {
        if (!abort.signal.aborted) {
          setHistoryError(failure.message);
        }
      });

    return () => abort.abort();
  }, [candidate?.id, candidate?.version, refresh]);

  async function act(rpc, body, message) {
    if (locked.current) return false;

    locked.current = true;
    setBusy(true);
    setError("");
    setNotice("");

    try {
      const { data, error: failure } = await supabase.rpc(rpc, body);

      if (failure) throw new Error(failure.message);

      setNotice(message);
      setRefresh(value => value + 1);

      return data || true;
    } catch (failure) {
      setError(failure.message);
      return false;
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }

  async function saveJob(data) {
    const editing = jobEditor === "edit";
    const signature = JSON.stringify(data);

    if (
      !editing &&
      jobAttempt.current?.signature !== signature
    ) {
      jobAttempt.current = {
        signature,
        id: crypto.randomUUID(),
      };
    }

    const id = await act(
      "td_hiring_job_save",
      {
        p_id: editing ? job.id : jobAttempt.current.id,
        p_data: data,
        p_version: editing ? job.version : null,
      },
      "Vacancy saved."
    );

    if (id) {
      jobAttempt.current = null;
      setJobEditor("");
      setJobId(id);
      setCandidateId("");
      setAdding(false);
    }
  }

  async function addCandidate(data) {
    const signature = JSON.stringify([job.id, data]);

    if (candidateAttempt.current?.signature !== signature) {
      candidateAttempt.current = {
        signature,
        id: crypto.randomUUID(),
      };
    }

    const id = await act(
      "td_hiring_candidate_create",
      {
        p_id: candidateAttempt.current.id,
        p_job: job.id,
        p_data: data,
      },
      "Application added."
    );

    if (id) {
      candidateAttempt.current = null;
      setAdding(false);
      setQuery("");
      setFilter("active");
      setCandidateId(id);
    }
  }

  if (!authorised) {
    return (
      <section className="td-recruiting">
        <p>Recruiting is available to managers and admins.</p>
      </section>
    );
  }

  return (
    <section className="td-recruiting">
      <header className="rc-hero">
        <div>
          <p className="rc-kicker">
            <BriefcaseBusiness size={17} />
            PEOPLE &amp; TALENT
          </p>
          <h2>Build your next team</h2>
          <p>
            Clear vacancies. Focused conversations.
            Hiring decisions with a record.
          </p>
        </div>

        <button
          type="button"
          className="rc-primary"
          disabled={busy || loading}
          onClick={() => {
            jobAttempt.current = null;
            setJobEditor("new");
            setAdding(false);
          }}
        >
          <Plus size={16} />
          New vacancy
        </button>
      </header>

      {error && (
        <p className="rc-error" role="alert">{error}</p>
      )}

      {notice && (
        <p className="rc-success" role="status">{notice}</p>
      )}

      <div className="rc-toolbar">
        <label>
          Vacancy
          <select
            name="recruitingVacancy"
            value={job?.id || ""}
            disabled={busy || loading}
            onChange={event => {
              setJobId(event.target.value);
              setCandidateId("");
              setJobEditor("");
              setAdding(false);
              setQuery("");
              setCandidateLimit(200);
            }}
          >
            <option value="" disabled>Choose a vacancy</option>
            {jobs.map(row => (
              <option key={row.id} value={row.id}>
                {row.title} · {row.status}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          className="rc-outline"
          disabled={busy || loading || candidateLoading}
          onClick={() => setRefresh(value => value + 1)}
        >
          <RefreshCw size={16} />
          Refresh
        </button>
      </div>

      {loading && <p role="status">Loading vacancies…</p>}

      {(jobEditor === "new" ||
        (jobEditor === "edit" && job)) && (
        <VacancyForm
          key={
            jobEditor === "edit"
              ? job.id + job.version
              : "new"
          }
          job={jobEditor === "edit" ? job : null}
          employees={employees}
          userId={userId}
          role={role}
          busy={busy || loading}
          onSave={saveJob}
          onCancel={() => setJobEditor("")}
        />
      )}

      {!loading && !jobs.length && !jobEditor && (
        <div className="rc-panel rc-empty">
          <BriefcaseBusiness size={32} />
          <h3>Start with the role you need to fill</h3>
          <p>
            Create a vacancy, name its hiring owner and define
            the requirements before adding applications.
          </p>
        </div>
      )}

      {job && (
        <>
          <section className="rc-panel">
            <div className="rc-toolbar">
              <div>
                <p className="rc-kicker">
                  {job.status.toUpperCase()} VACANCY
                </p>
                <h3>{job.title}</h3>
                <p>
                  {job.location} · {modes[job.work_mode]} ·{" "}
                  {employment[job.employment]}
                </p>
              </div>

              <div className="rc-actions">
                <button
                  type="button"
                  className="rc-outline"
                  disabled={busy || loading}
                  onClick={() => {
                    setJobEditor("edit");
                    setAdding(false);
                  }}
                >
                  Edit vacancy
                </button>

                <button
                  type="button"
                  className="rc-primary"
                  disabled={
                    busy || loading || job.status !== "open"
                  }
                  onClick={() => {
                    candidateAttempt.current = null;
                    setAdding(true);
                    setJobEditor("");
                  }}
                >
                  <Plus size={16} />
                  Add candidate
                </button>
              </div>
            </div>

            <div className="rc-owner">
              <EmployeeAvatar
                employeeId={job.owner_id}
                interactive={false}
              />
              <span>
                Hiring owner:{" "}
                <strong>{personName(job.owner_id)}</strong>
              </span>
            </div>

            <details>
              <summary>
                Responsibilities &amp; assessment criteria
              </summary>
              <p>{job.requirements}</p>
            </details>

            <small>
              Private hiring records · visible to the vacancy owner
              and admins. Applications are entered by the hiring team.
            </small>

            {job.status !== "open" && (
              <p>
                Set this vacancy to Open to add or update candidates.
              </p>
            )}
          </section>

          <div className="rc-stats">
            <div className="rc-panel">
              <span>Active applications</span>
              <strong>
                {ready
                  ? rows.filter(
                      row =>
                        row.disposition === "active" &&
                        row.stage !== "hired"
                    ).length
                  : "—"}
              </strong>
            </div>

            <div className="rc-panel">
              <span>Confirmed hires</span>
              <strong>
                {ready
                  ? rows.filter(row => row.stage === "hired").length
                  : "—"}
              </strong>
            </div>

            <div className="rc-panel">
              <span>Follow-ups overdue</span>
              <strong>
                {ready
                  ? rows.filter(
                      row =>
                        row.disposition === "active" &&
                        row.stage !== "hired" &&
                        row.follow_on &&
                        row.follow_on < today()
                    ).length
                  : "—"}
              </strong>
            </div>
          </div>

          {adding && (
            <CandidateForm
              key={job.id}
              busy={busy || loading}
              onSave={addCandidate}
              onCancel={() => setAdding(false)}
            />
          )}

          <div className="rc-toolbar">
            <label className="rc-search">
              <span>
                <Search size={14} />
                Find an application
              </span>
              <input
                name="candidateSearch"
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="Name, email or phone"
              />
            </label>

            <label>
              Show
              <select
                name="candidateFilter"
                value={filter}
                onChange={event => setFilter(event.target.value)}
              >
                <option value="active">Active applications</option>
                <option value="hired">Hired</option>
                <option value="rejected">Rejected</option>
                <option value="withdrawn">Withdrawn</option>
                <option value="all">All applications</option>
              </select>
            </label>
          </div>

          <small>
            Counts and search cover the applications loaded for this
            vacancy. Select a candidate card to review or update it.
          </small>

          {candidateLoading && (
            <p role="status">Loading applications…</p>
          )}

          {ready && !shown.length && (
            <div className="rc-panel rc-empty">
              <h3>No applications in this view</h3>
              <p>
                Add a candidate to an open vacancy, or change
                your search and filter.
              </p>
            </div>
          )}

          {ready && !!shown.length && (
            <div
              className="rc-board"
              role="region"
              aria-label="Candidate pipeline"
              tabIndex={0}
            >
              {Object.entries(stages).map(([key, title]) => (
                <section className="rc-column" key={key}>
                  <header>
                    <h4>{title}</h4>
                    <span>
                      {shown.filter(row => row.stage === key).length}
                    </span>
                  </header>

                  {shown
                    .filter(row => row.stage === key)
                    .map(row => (
                      <button
                        type="button"
                        className="rc-candidate"
                        key={row.id}
                        aria-pressed={candidateId === row.id}
                        disabled={busy || loading}
                        onClick={() => setCandidateId(row.id)}
                      >
                        <strong>{row.full_name}</strong>
                        <small>{sources[row.source]}</small>
                        <span className="rc-badge">
                          {label(row)}
                        </span>

                        {row.next_action && (
                          <p>{row.next_action}</p>
                        )}

                        {row.follow_on && (
                          <small
                            className={
                              row.follow_on < today()
                                ? "rc-overdue"
                                : ""
                            }
                          >
                            Follow up {date(row.follow_on)}
                          </small>
                        )}
                      </button>
                    ))}
                </section>
              ))}
            </div>
          )}

          {candidate && (
            <section className="rc-panel">
              <div className="rc-toolbar">
                <div>
                  <p className="rc-kicker">CANDIDATE DETAILS</p>
                  <h3>{candidate.full_name}</h3>
                </div>
                <span className="rc-badge">
                  {label(candidate)}
                </span>
              </div>

              <div className="rc-contact">
                {candidate.email && <p>{candidate.email}</p>}
                {candidate.phone && <p>{candidate.phone}</p>}

                {safeLink(candidate.cv_url) && (
                  <a
                    href={safeLink(candidate.cv_url)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open CV / portfolio
                    <ExternalLink size={13} />
                  </a>
                )}
              </div>

              {candidate.stage !== "hired" &&
                job.status === "open" && (
                  <form
                    key={candidate.id + candidate.version}
                    onSubmit={event => {
                      event.preventDefault();

                      const fields = new FormData(
                        event.currentTarget
                      );

                      void act(
                        "td_hiring_candidate_update",
                        {
                          p_id: candidate.id,
                          p_stage: fields.get("stage"),
                          p_disposition: fields.get("disposition"),
                          p_next_action:
                            fields.get("next_action") || "",
                          p_follow_on:
                            fields.get("follow_on") || null,
                          p_note: fields.get("note"),
                          p_version: candidate.version,
                        },
                        "Candidate updated. Decision note added to the history."
                      );
                    }}
                  >
                    <fieldset
                      disabled={busy || loading || candidateLoading}
                    >
                      <div className="rc-fields">
                        <label>
                          Pipeline stage
                          <select
                            name="stage"
                            defaultValue={candidate.stage}
                          >
                            {options(stages)}
                          </select>
                        </label>

                        <label>
                          Application status
                          <select
                            name="disposition"
                            defaultValue={candidate.disposition}
                          >
                            <option value="active">Active</option>
                            <option value="rejected">Rejected</option>
                            <option value="withdrawn">Withdrawn</option>
                          </select>
                        </label>

                        <label>
                          Next action (optional)
                          <input
                            name="next_action"
                            maxLength={300}
                            defaultValue={candidate.next_action}
                            placeholder="For example: Arrange technical interview"
                          />
                        </label>

                        <label>
                          Follow-up date (optional)
                          <input
                            name="follow_on"
                            type="date"
                            defaultValue={candidate.follow_on || ""}
                          />
                        </label>

                        <label className="rc-wide">
                          Evaluation / decision note
                          <textarea
                            name="note"
                            minLength={10}
                            maxLength={2000}
                            placeholder="Record evidence against the role criteria, the decision and any agreed next steps."
                            required
                          />
                        </label>
                      </div>

                      <small>
                        When rejecting or withdrawing, keep the
                        current stage. Only active candidates at
                        Offer can be confirmed as hired. Record a
                        confirmed hire only after acceptance; this
                        does not create an employee account or
                        send an offer.
                      </small>

                      <button
                        className="rc-primary"
                        type="submit"
                      >
                        {busy ? "Saving…" : "Save candidate update"}
                      </button>
                    </fieldset>
                  </form>
                )}

              <h4>Latest candidate history</h4>

              {historyError ? (
                <p className="rc-error" role="alert">
                  {historyError}
                </p>
              ) : historyFor !==
                `${candidate.id}:${candidate.version}` ? (
                <p role="status">Loading history…</p>
              ) : (
                <ol className="rc-history">
                  {events.map(event => (
                    <li key={event.id}>
                      <strong>
                        {label(event)} · {date(event.created_at)}
                      </strong>
                      <small>{personName(event.actor_id)}</small>
                      <p>{event.note}</p>
                    </li>
                  ))}
                </ol>
              )}

              <small>
                Showing the latest 20 entries.
                Earlier history remains stored.
              </small>
            </section>
          )}

          {rows.length >= candidateLimit && (
            <button
              type="button"
              className="rc-outline"
              disabled={busy || candidateLoading}
              onClick={() =>
                setCandidateLimit(value => value + 200)
              }
            >
              Load more applications
            </button>
          )}
        </>
      )}

      {jobs.length >= jobLimit && (
        <button
          type="button"
          className="rc-outline"
          disabled={busy || loading}
          onClick={() => setJobLimit(value => value + 100)}
        >
          Load more vacancies
        </button>
      )}
    </section>
  );
}