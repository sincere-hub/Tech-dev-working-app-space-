import { useEffect, useRef, useState } from "react";
import { ClipboardCheck, Plus, RefreshCw } from "lucide-react";
import { supabase } from "../lib/supabase.js";
import EmployeeAvatar from "./EmployeeAvatar.jsx";
import "./performance-reviews.css";

const questions = {
  self: {
    achievements: "What did you deliver? Include specific examples.",
    challenges: "What challenges affected your work?",
    support: "What support or learning would help you?",
    goals: "What should your next priorities be?",
  },
  manager: {
    strengths: "Strengths and contributions, with examples",
    development: "Development areas and constructive feedback",
    support: "Support or learning the company will provide",
    goals: "Next goals, success measures and check-in dates",
  },
};

const ratings = {
  1: "Needs substantial improvement",
  2: "Developing towards expectations",
  3: "Meets expectations",
  4: "Exceeds expectations",
  5: "Exceptional contribution",
};

const date = value =>
  new Date(
    value.length === 10 ? value + "T12:00:00+02:00" : value
  ).toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Africa/Johannesburg",
  });

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

const stage = row =>
  row.acknowledged_at
    ? "Acknowledged"
    : row.published_at
      ? "Feedback shared"
      : row.self_submitted_at
        ? "Manager review"
        : "Self-assessment";

function AssessmentForm({
  kind,
  saved,
  busy,
  canPublish,
  onSave,
}) {
  return (
    <form
      onSubmit={event => {
        event.preventDefault();

        const fields = new FormData(event.currentTarget);

        const answers = Object.fromEntries(
          Object.keys(questions[kind]).map(key => [
            key,
            String(fields.get(key) || "").trim(),
          ])
        );

        const rating =
          kind === "manager" && fields.get("rating")
            ? Number(fields.get("rating"))
            : null;

        const submit =
          event.nativeEvent.submitter?.value === "submit";

        void onSave(kind, answers, rating, submit);
      }}
    >
      <fieldset disabled={busy}>
        {Object.entries(questions[kind]).map(([key, label]) => (
          <label key={key}>
            {label}
            <textarea
              name={key}
              maxLength={3000}
              defaultValue={saved?.answers?.[key] || ""}
              required
            />
          </label>
        ))}

        {kind === "manager" && (
          <label>
            Overall assessment
            <select
              name="rating"
              defaultValue={saved?.rating || ""}
              required
            >
              <option value="">Choose a rating</option>
              {Object.entries(ratings).map(([key, label]) => (
                <option key={key} value={key}>
                  {key} · {label}
                </option>
              ))}
            </select>
            <small>
              Use evidence from this review period and the
              expectations for the employee’s role.
            </small>
          </label>
        )}

        <div className="pr-actions">
          <button
            className="pr-outline"
            type="submit"
            value="draft"
            formNoValidate
          >
            Save draft
          </button>

          <button
            className="pr-primary"
            type="submit"
            value="submit"
            disabled={kind === "manager" && !canPublish}
          >
            {busy
              ? "Saving…"
              : kind === "self"
                ? "Submit self-assessment"
                : "Publish feedback to employee"}
          </button>
        </div>

        <small>
          {kind === "self"
            ? "Your draft is private to you. Submission shares it with your reviewer and admins and locks your answers."
            : "Manager drafts are visible to the reviewer and authorised admins. Publishing shares the final feedback and locks it."}
        </small>

        {kind === "manager" && !canPublish && (
          <p>
            The employee must submit their self-assessment before
            feedback can be published. You can save a draft now.
          </p>
        )}
      </fieldset>
    </form>
  );
}

function Answers({ kind, saved }) {
  if (!saved) {
    return <p>No submitted assessment is available yet.</p>;
  }

  return (
    <div className="pr-answers">
      {Object.entries(questions[kind]).map(([key, label]) => (
        <div key={key}>
          <h4>{label}</h4>
          <p>{saved.answers?.[key] || "Not provided yet."}</p>
        </div>
      ))}

      {saved.rating && (
        <div className="pr-rating">
          <strong>{saved.rating} / 5</strong>
          <span>{ratings[saved.rating]}</span>
        </div>
      )}
    </div>
  );
}

export default function PerformanceReviews({
  employees = [],
  userId,
  role = "employee",
  records = [],
}) {
  const [reviews, setReviews] = useState([]);
  const [assessments, setAssessments] = useState([]);
  const [selected, setSelected] = useState("");
  const [scope, setScope] = useState("mine");
  const [loading, setLoading] = useState(true);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsFor, setDetailsFor] = useState("");
  const [detailsError, setDetailsError] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editor, setEditor] = useState(false);
  const [employeeChoice, setEmployeeChoice] = useState("");
  const [limit, setLimit] = useState(100);
  const [refreshKey, setRefreshKey] = useState(0);

  const locked = useRef(false);
  const createAttempt = useRef(null);

  const manager = ["manager", "admin"].includes(role);

  const name = id =>
    employees.find(person => person.id === id)?.display_name ||
    "Employee";

  const visible = reviews.filter(row =>
    scope === "all"
      ? true
      : scope === "lead"
        ? row.reviewer_id === userId
        : row.employee_id === userId
  );

  const review =
    visible.find(row => row.id === selected) || visible[0];

  const self = assessments.find(row => row.kind === "self");
  const feedback = assessments.find(row => row.kind === "manager");

  const legacy = records.filter(
    row => row.module_id === "people.performance"
  );

  async function load(signal) {
    if (!supabase) {
      throw new Error("Supabase is not configured.");
    }

    const { data, error: failure } = await supabase
      .from("td_performance_reviews")
      .select("*")
      .order("due_on", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit)
      .abortSignal(signal);

    if (failure) {
      throw new Error(
        ["42P01", "PGRST205"].includes(failure.code)
          ? "Run performance-reviews.sql in your Supabase SQL Editor to enable reviews."
          : "Could not load reviews. Check your connection and refresh."
      );
    }

    if (!signal.aborted) {
      setReviews(data || []);
    }
  }

  useEffect(() => {
    const abort = new AbortController();

    setLoading(true);
    setError("");

    load(abort.signal)
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
  }, [userId, limit, refreshKey]);

  useEffect(() => {
    const abort = new AbortController();

    setAssessments([]);
    setDetailsFor("");
    setDetailsError("");

    if (!review) {
      setDetailsLoading(false);
      return () => abort.abort();
    }

    setDetailsLoading(true);

    supabase
      .from("td_performance_assessments")
      .select("*")
      .eq("review_id", review.id)
      .abortSignal(abort.signal)
      .then(({ data, error: failure }) => {
        if (abort.signal.aborted) return;

        if (failure) {
          throw new Error(
            "Could not load assessment details. Refresh to try again."
          );
        }

        setAssessments(data || []);
        setDetailsFor(`${review.id}:${review.version}`);
      })
      .catch(failure => {
        if (!abort.signal.aborted) {
          setDetailsError(failure.message);
        }
      })
      .finally(() => {
        if (!abort.signal.aborted) {
          setDetailsLoading(false);
        }
      });

    return () => abort.abort();
  }, [review?.id, review?.version, refreshKey]);

  async function act(rpc, body, message) {
    if (locked.current) return false;

    locked.current = true;
    setBusy(true);
    setError("");
    setNotice("");

    try {
      const { data, error: failure } = await supabase.rpc(rpc, body);

      if (failure) {
        throw new Error(failure.message);
      }

      setNotice(message);
      setRefreshKey(value => value + 1);

      return data || true;
    } catch (failure) {
      setError(failure.message);
      return false;
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }

  async function create(event) {
    event.preventDefault();

    const fields = new FormData(event.currentTarget);

    const body = {
      p_employee: fields.get("employee"),
      p_reviewer: fields.get("reviewer"),
      p_title: fields.get("title"),
      p_start: fields.get("start"),
      p_end: fields.get("end"),
      p_due: fields.get("due"),
    };

    const signature = JSON.stringify(body);

    if (
      !createAttempt.current ||
      createAttempt.current.signature !== signature
    ) {
      createAttempt.current = {
        signature,
        id: crypto.randomUUID(),
      };
    }

    const id = await act(
      "td_review_create",
      {
        ...body,
        p_id: createAttempt.current.id,
      },
      "Review opened. The employee can complete their self-assessment."
    );

    if (id) {
      createAttempt.current = null;
      setEditor(false);
      setEmployeeChoice("");
      setScope(body.p_reviewer === userId ? "lead" : "all");
      setSelected(id);
    }
  }

  async function save(kind, answers, rating, submit) {
    return act(
      "td_review_save",
      {
        p_review: review.id,
        p_kind: kind,
        p_answers: answers,
        p_rating: rating,
        p_submit: submit,
        p_version: review.version,
      },
      !submit
        ? "Draft saved."
        : kind === "self"
          ? "Self-assessment submitted to your reviewer."
          : "Feedback published. The employee can read and acknowledge it."
    );
  }

  const outstanding = reviews.filter(
    row => !row.acknowledged_at
  ).length;

  const overdue = reviews.filter(
    row => !row.published_at && row.due_on < today()
  ).length;

  return (
    <section className="td-reviews">
      <header className="pr-hero">
        <div>
          <p className="pr-eyebrow">
            <ClipboardCheck size={17} />
            PEOPLE &amp; DEVELOPMENT
          </p>
          <h2>Performance &amp; growth</h2>
          <p>
            Reflect on the work. Share useful feedback.
            Agree on what comes next.
          </p>
        </div>

        {manager && (
          <button
            className="pr-primary"
            type="button"
            disabled={busy}
            onClick={() => {
              createAttempt.current = null;
              setEditor(true);
            }}
          >
            <Plus size={16} />
            Open a review
          </button>
        )}
      </header>

      {error && (
        <p className="pr-error" role="alert">{error}</p>
      )}

      {notice && (
        <p className="pr-success" role="status">{notice}</p>
      )}

      <div className="pr-stats">
        <div className="pr-panel">
          <span>Reviews you can access</span>
          <strong>{loading ? "—" : reviews.length}</strong>
        </div>
        <div className="pr-panel">
          <span>Awaiting completion or acknowledgement</span>
          <strong>{loading ? "—" : outstanding}</strong>
        </div>
        <div className="pr-panel">
          <span>Feedback overdue</span>
          <strong>{loading ? "—" : overdue}</strong>
        </div>
      </div>

      <small>
        Counts cover the loaded reviews. Assessments stay private
        according to your role and review assignment.
      </small>

      {manager && editor && (
        <section className="pr-panel">
          <h3>Open a performance review</h3>

          <form onSubmit={create}>
            <fieldset disabled={busy}>
              <div className="pr-fields">
                <label>
                  Employee
                  <select
                    name="employee"
                    value={employeeChoice}
                    onChange={event =>
                      setEmployeeChoice(event.target.value)
                    }
                    required
                  >
                    <option value="">Choose an employee</option>
                    {employees
                      .filter(
                        person =>
                          !person.is_banned &&
                          (role === "admin" || person.id !== userId)
                      )
                      .map(person => (
                        <option key={person.id} value={person.id}>
                          {person.display_name}
                        </option>
                      ))}
                  </select>
                </label>

                {role === "admin" ? (
                  <label>
                    Assigned reviewer
                    <select
                      name="reviewer"
                      required
                      defaultValue=""
                    >
                      <option value="">
                        Choose a manager or admin
                      </option>
                      {employees
                        .filter(
                          person =>
                            !person.is_banned &&
                            person.id !== employeeChoice &&
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
                      name="reviewer"
                      type="hidden"
                      value={userId}
                    />
                    <p>You will lead this review.</p>
                  </div>
                )}

                <label className="pr-wide">
                  Review title
                  <input
                    name="title"
                    maxLength={160}
                    placeholder="For example: 2026 year-end review"
                    required
                  />
                </label>

                <label>
                  Period starts
                  <input name="start" type="date" required />
                </label>

                <label>
                  Period ends
                  <input name="end" type="date" required />
                </label>

                <label>
                  Feedback due
                  <input name="due" type="date" required />
                </label>
              </div>

              {employeeChoice && (
                <div className="pr-person">
                  <EmployeeAvatar
                    employeeId={employeeChoice}
                    interactive={false}
                  />
                  <span>{name(employeeChoice)}</span>
                </div>
              )}

              <div className="pr-actions">
                <button className="pr-primary" type="submit">
                  {busy ? "Opening…" : "Create review"}
                </button>
                <button
                  className="pr-outline"
                  type="button"
                  onClick={() => setEditor(false)}
                >
                  Cancel
                </button>
              </div>
            </fieldset>
          </form>
        </section>
      )}

      <div className="pr-toolbar">
        <label>
          Review view
          <select
            name="performanceScope"
            value={scope}
            onChange={event => {
              setScope(event.target.value);
              setSelected("");
            }}
          >
            <option value="mine">My reviews</option>
            {manager && (
              <option value="lead">Reviews I lead</option>
            )}
            {role === "admin" && (
              <option value="all">All accessible reviews</option>
            )}
          </select>
        </label>

        <button
          className="pr-outline"
          type="button"
          disabled={busy || loading}
          onClick={() => setRefreshKey(value => value + 1)}
        >
          <RefreshCw size={16} />
          Refresh
        </button>
      </div>

      {loading && (
        <p role="status">Loading review periods…</p>
      )}

      {!loading && !visible.length && (
        <div className="pr-panel pr-empty">
          <ClipboardCheck size={30} />
          <h3>No reviews in this view</h3>
          <p>
            {manager
              ? "Open a review or choose another view to find reviews you lead."
              : "Your assigned reviews will appear here when a manager opens one."}
          </p>
        </div>
      )}

      {!!visible.length && (
        <div className="pr-layout">
          <aside className="pr-list" aria-label="Review periods">
            {visible.map(row => (
              <button
                type="button"
                className="pr-review-choice"
                key={row.id}
                aria-pressed={review?.id === row.id}
                disabled={busy}
                onClick={() => setSelected(row.id)}
              >
                <strong>{row.title}</strong>
                <span>{name(row.employee_id)}</span>
                <small>
                  {stage(row)} · Due {date(row.due_on)}
                </small>
              </button>
            ))}
          </aside>

          {review && (
            <section
              className="pr-detail"
              aria-label="Selected review"
            >
              <section className="pr-panel">
                <div className="pr-toolbar">
                  <div className="pr-person">
                    <EmployeeAvatar
                      employeeId={review.employee_id}
                      interactive={false}
                    />
                    <div>
                      <h3>{name(review.employee_id)}</h3>
                      <small>
                        Reviewer: {name(review.reviewer_id)}
                      </small>
                    </div>
                  </div>
                  <span className="pr-status">
                    {stage(review)}
                  </span>
                </div>

                <h3>{review.title}</h3>
                <p>
                  {date(review.period_start)} –{" "}
                  {date(review.period_end)} · Feedback due{" "}
                  {date(review.due_on)}
                </p>

                <div className="pr-steps">
                  {[
                    ["Self-assessment", review.self_submitted_at],
                    ["Manager feedback", review.published_at],
                    ["Read & acknowledged", review.acknowledged_at],
                  ].map(([label, done]) => (
                    <span key={label} data-done={!!done}>
                      {done ? "✓ " : "○ "}
                      {label}
                    </span>
                  ))}
                </div>
              </section>

              {detailsError ? (
                <p className="pr-error" role="alert">
                  {detailsError}
                </p>
              ) : detailsLoading ||
                detailsFor !== `${review.id}:${review.version}` ? (
                <p role="status">Loading private assessments…</p>
              ) : (
                <>
                  <section className="pr-panel">
                    <h3>Employee self-assessment</h3>

                    {review.employee_id === userId &&
                    !review.self_submitted_at &&
                    !review.published_at ? (
                      <AssessmentForm
                        key={review.id + review.version + "self"}
                        kind="self"
                        saved={self}
                        busy={busy || loading}
                        onSave={save}
                      />
                    ) : review.self_submitted_at ? (
                      <Answers kind="self" saved={self} />
                    ) : (
                      <p>
                        The employee is preparing their
                        self-assessment. Their draft remains private.
                      </p>
                    )}
                  </section>

                  <section className="pr-panel">
                    <h3>Manager feedback &amp; development plan</h3>

                    {review.reviewer_id === userId &&
                    manager &&
                    !review.published_at ? (
                      <AssessmentForm
                        key={review.id + review.version + "manager"}
                        kind="manager"
                        saved={feedback}
                        busy={busy || loading}
                        canPublish={!!review.self_submitted_at}
                        onSave={save}
                      />
                    ) : feedback ? (
                      <>
                        <small>
                          {review.published_at
                            ? "Published feedback"
                            : "Manager draft · not yet shared with the employee"}
                        </small>
                        <Answers kind="manager" saved={feedback} />
                      </>
                    ) : (
                      <p>
                        Your reviewer’s feedback will appear here
                        once it is published.
                      </p>
                    )}
                  </section>

                  {review.published_at && (
                    <section className="pr-panel">
                      <h3>Review acknowledgement</h3>

                      {review.acknowledged_at ? (
                        <>
                          <p>
                            Read and acknowledged on{" "}
                            {date(review.acknowledged_at)}.
                          </p>
                          {review.employee_comment && (
                            <p>{review.employee_comment}</p>
                          )}
                        </>
                      ) : review.employee_id === userId ? (
                        <form
                          onSubmit={event => {
                            event.preventDefault();

                            const fields = new FormData(
                              event.currentTarget
                            );

                            void act(
                              "td_review_acknowledge",
                              {
                                p_review: review.id,
                                p_comment: fields.get("comment") || "",
                                p_version: review.version,
                              },
                              "Acknowledgement recorded."
                            );
                          }}
                        >
                          <fieldset disabled={busy || loading}>
                            <p>
                              Acknowledgement confirms you have
                              read the review. It does not mean you
                              agree with every point.
                            </p>
                            <label>
                              Your response (optional)
                              <textarea
                                name="comment"
                                maxLength={1500}
                              />
                            </label>
                            <button
                              className="pr-primary"
                              type="submit"
                            >
                              I have read this review
                            </button>
                          </fieldset>
                        </form>
                      ) : (
                        <p>
                          Waiting for the employee to read and
                          acknowledge this review.
                        </p>
                      )}
                    </section>
                  )}
                </>
              )}
            </section>
          )}
        </div>
      )}

      {reviews.length >= limit && (
        <button
          className="pr-outline"
          type="button"
          disabled={busy || loading}
          onClick={() => setLimit(value => value + 100)}
        >
          Load more review periods
        </button>
      )}

      {!!legacy.length && (
        <details className="pr-panel">
          <summary>Earlier performance tracking notes</summary>
          {legacy.map(row => (
            <div key={row.id}>
              <h4>{row.title}</h4>
              <p>{row.description}</p>
            </div>
          ))}
        </details>
      )}
    </section>
  );
}