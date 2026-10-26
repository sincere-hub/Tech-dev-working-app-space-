import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  CalendarDays,
  CheckCircle2,
  RefreshCw,
  UserRound,
} from "lucide-react";

import { supabase } from "../lib/supabase.js";
import "./wiki-review-panel.css";

function todayInZA(value = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Johannesburg",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

function dateLabel(value) {
  if (!value) return "Not scheduled";

  return new Date(
    `${value}T12:00:00Z`
  ).toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Africa/Johannesburg",
  });
}

function reviewStatus(row, revision, today) {
  if (!row?.reviewed_revision) {
    return ["pending", "Not yet reviewed"];
  }

  if (
    Number(row.reviewed_revision) !== Number(revision)
  ) {
    return [
      "pending",
      "Content changed · review needed",
    ];
  }

  if (
    !row.next_review_on ||
    row.next_review_on <= today
  ) {
    return ["due", "Review due"];
  }

  return ["current", "Current version reviewed"];
}

export default function WikiReviewPanel({
  record,
  userId,
  isManager,
  employees = [],
  onSaved,
}) {
  const [details, setDetails] = useState(null);
  const [owner, setOwner] = useState("");
  const [due, setDue] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [today, setToday] = useState(
    () => todayInZA()
  );

  const sequence = useRef(0);
  const controller = useRef(null);
  const lock = useRef(false);

  const key =
    `${userId}:${record.id}:` +
    `${record.wiki_revision}:` +
    `${record.status}:${record.visibility}`;

  const activeKey = useRef(key);
  activeKey.current = key;

  const ready = details?.key === key;
  const row = ready ? details.row : null;

  const ownerId =
    row?.owner_id || record.created_by || "";

  const canManage = Boolean(
    isManager || record.created_by === userId
  );

  const canReview = Boolean(
    isManager || ownerId === userId
  );

  const editable =
    ready &&
    !loading &&
    !busy &&
    record.status !== "archived";

  const name = id =>
    employees.find(person => person.id === id)
      ?.display_name || "Employee";

  const [tone, label] = reviewStatus(
    row,
    record.wiki_revision,
    today
  );

  const request = useCallback(
    async (query, signal) => {
      async function checkAccount() {
        const { data, error } =
          await supabase.auth.getSession();

        if (error) throw error;

        if (data.session?.user.id !== userId) {
          throw new Error(
            "Your account changed. Reopen the wiki."
          );
        }
      }

      await checkAccount();

      const { data, error } =
        await query.abortSignal(signal);

      if (error) throw error;

      await checkAccount();
      return data;
    },
    [userId]
  );

  const load = useCallback(async () => {
    const ticket = ++sequence.current;

    controller.current?.abort();

    const aborter = new AbortController();
    controller.current = aborter;

    const timer = setTimeout(
      () => aborter.abort(),
      15000
    );

    setLoading(true);
    setError("");
    setNotice("");

    try {
      const data = await request(
        supabase
          .from("td_wiki_reviews")
          .select("*")
          .eq("article_id", record.id)
          .maybeSingle(),
        aborter.signal
      );

      if (
        ticket !== sequence.current ||
        activeKey.current !== key
      ) {
        return;
      }

      setDetails({ key, row: data });
      setOwner(
        data?.owner_id || record.created_by || ""
      );
      setDue(data?.next_review_on || "");
    } catch (failure) {
      if (
        ticket === sequence.current &&
        activeKey.current === key
      ) {
        setDetails(null);
        setError(
          failure.message ||
          "Could not load review details."
        );
      }
    } finally {
      clearTimeout(timer);

      if (
        ticket === sequence.current &&
        activeKey.current === key
      ) {
        setLoading(false);
      }
    }
  }, [key, record.id, record.created_by, request]);

  useEffect(() => {
    load();

    return () => {
      sequence.current++;
      controller.current?.abort();
    };
  }, [load]);

  useEffect(() => {
    const timer = setInterval(
      () => setToday(todayInZA()),
      60000
    );

    return () => clearInterval(timer);
  }, []);

  async function save(markReviewed) {
    if (
      lock.current ||
      !editable ||
      !(markReviewed ? canReview : canManage)
    ) {
      return;
    }

    if (!navigator.onLine) {
      setError(
        "Connect to the internet to save review details."
      );
      return;
    }

    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");

    const ticket = ++sequence.current;
    const aborter = new AbortController();

    controller.current = aborter;

    const timer = setTimeout(
      () => aborter.abort(),
      15000
    );

    try {
      const data = await request(
        supabase.rpc("td_wiki_set_review", {
          p_article_id: record.id,
          p_article_revision: record.wiki_revision,
          p_expected_version: row?.version || 0,
          p_owner_id: markReviewed ? ownerId : owner,
          p_next_review_on: due || null,
          p_mark_reviewed: markReviewed,
        }),
        aborter.signal
      );

      if (
        ticket !== sequence.current ||
        activeKey.current !== key
      ) {
        return;
      }

      setDetails({ key, row: data });
      setOwner(
        data.owner_id || record.created_by || ""
      );
      setDue(data.next_review_on || "");

      setNotice(
        markReviewed
          ? "This article version has been marked reviewed."
          : "Maintainer and review schedule saved."
      );
      onSaved?.(data);
    } catch (failure) {
      if (
        ticket === sequence.current &&
        activeKey.current === key
      ) {
        setError(
          failure.message ||
          "Could not save. Reload details before trying again."
        );
      }
    } finally {
      clearTimeout(timer);
      lock.current = false;

      if (
        ticket === sequence.current &&
        activeKey.current === key
      ) {
        setBusy(false);
      }
    }
  }

  const people = employees.filter(person =>
    record.visibility === "company" ||
    person.id === record.created_by ||
    ["manager", "admin"].includes(person.role)
  );

  return (
    <section
      className="td-wiki-review"
      aria-label="Article ownership and review"
    >
      <header>
        <div>
          <span className="td-wr-eyebrow">
            ARTICLE CARE
          </span>
          <h3>Ownership & review</h3>
        </div>

        <button
          type="button"
          className="ld-secondary"
          disabled={loading || busy}
          onClick={load}
        >
          <RefreshCw size={15} />
          Reload details
        </button>
      </header>

      {loading && (
        <p role="status">
          Loading review details…
        </p>
      )}

      {ready && (
        <>
          <span
            className="td-wr-status"
            data-tone={tone}
          >
            {label}
          </span>

          <dl>
            <div>
              <dt>
                <UserRound size={15} />
                Maintainer
              </dt>
              <dd>
                {ownerId ? name(ownerId) : "Unassigned"}
              </dd>
            </div>

            <div>
              <dt>
                <CalendarDays size={15} />
                Next review
              </dt>
              <dd>
                {dateLabel(row?.next_review_on)}
              </dd>
            </div>
          </dl>

          {row?.reviewed_at && (
            <p className="td-wr-note">
              Version {row.reviewed_revision} reviewed
              by {name(row.reviewed_by)} on{" "}
              {dateLabel(
                todayInZA(new Date(row.reviewed_at))
              )}.
            </p>
          )}

          {(canManage || canReview) &&
            record.status !== "archived" && (
              <>
                <div className="td-wr-fields">
                  {canManage && (
                    <label>
                      Maintainer

                      <select
                        value={owner}
                        disabled={!editable}
                        onChange={event =>
                          setOwner(event.target.value)
                        }
                      >
                        <option value="" disabled>
                          Choose an employee
                        </option>

                        {owner &&
                          !people.some(
                            person => person.id === owner
                          ) && (
                            <option value={owner}>
                              {name(owner)}
                            </option>
                          )}

                        {people.map(person => (
                          <option
                            key={person.id}
                            value={person.id}
                          >
                            {person.display_name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}

                  <label>
                    Next review date

                    <input
                      type="date"
                      value={due}
                      min={today}
                      disabled={!editable}
                      onChange={event =>
                        setDue(event.target.value)
                      }
                    />
                  </label>
                </div>

                <p className="td-wr-note">
                  The maintainer is responsible for
                  checking this guide. Existing editing
                  and reading permissions still apply.
                </p>

                <div className="td-wr-actions">
                  {canManage && (
                    <button
                      type="button"
                      className="ld-secondary"
                      disabled={!editable || !owner}
                      onClick={() => save(false)}
                    >
                      Save owner & date
                    </button>
                  )}

                  {canReview &&
                    record.status === "published" && (
                      <button
                        type="button"
                        className="ld-primary"
                        disabled={
                          !editable ||
                          !due ||
                          due <= today ||
                          (canManage && owner !== ownerId)
                        }
                        onClick={() => save(true)}
                      >
                        <CheckCircle2 size={16} />
                        Mark reviewed
                      </button>
                    )}
                </div>

                {canReview &&
                  record.status === "published" && (
                    <p className="td-wr-note">
                      Mark reviewed confirms you checked
                      version {record.wiki_revision}.
                      Choose a future date for its next
                      review.
                    </p>
                  )}
              </>
            )}
        </>
      )}

      {notice && <p role="status">{notice}</p>}

      {error && (
        <p className="ld-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}