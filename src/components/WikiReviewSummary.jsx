import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { supabase } from "../lib/supabase.js";

function todayInZA() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Johannesburg",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function useWikiReviewSummaries({
  userId,
  records,
}) {
  const ids = [
    ...new Set(records.map(record => record.id)),
  ].sort();

  const key = JSON.stringify([userId, ids]);

  const activeKey = useRef(key);
  activeKey.current = key;

  const sequence = useRef(0);
  const controller = useRef(null);

  const [state, setState] = useState({
    key: "",
    rows: {},
    loading: true,
    error: "",
  });

  const [today, setToday] = useState(
    () => todayInZA()
  );

  const refresh = useCallback(async () => {
    if (activeKey.current !== key) return;

    const turn = ++sequence.current;

    controller.current?.abort();

    const aborter = new AbortController();
    controller.current = aborter;

    const timer = setTimeout(
      () => aborter.abort(),
      15000
    );

    const current = () =>
      turn === sequence.current &&
      activeKey.current === key;

    setState({
      key,
      rows: {},
      loading: true,
      error: "",
    });

    try {
      if (!userId) {
        throw new Error(
          "Sign in to load review details."
        );
      }

      async function checkAccount() {
        const { data, error } =
          await supabase.auth.getSession();

        if (error) throw error;

        if (data.session?.user.id !== userId) {
          throw new Error(
            "Your account changed. Reopen the wiki."
          );
        }

        if (aborter.signal.aborted) {
          throw new Error(
            "Review details could not load. Please retry."
          );
        }
      }

      await checkAccount();

      const rows = {};

      for (
        let start = 0;
        start < ids.length;
        start += 50
      ) {
        const page = ids.slice(start, start + 50);

        const { data, error } = await supabase
          .from("td_wiki_reviews")
          .select(
            "article_id,owner_id," +
            "next_review_on,reviewed_revision"
          )
          .in("article_id", page)
          .limit(page.length)
          .abortSignal(aborter.signal);

        if (error) throw error;
        if (!current()) return;

        for (const row of data || []) {
          rows[row.article_id] = row;
        }
      }

      await checkAccount();

      if (current()) {
        setState({
          key,
          rows,
          loading: false,
          error: "",
        });
      }
    } catch (failure) {
      if (current()) {
        setState({
          key,
          rows: {},
          loading: false,
          error:
            failure.message ||
            "Could not load article review details.",
        });
      }
    } finally {
      clearTimeout(timer);
    }
  }, [key]);

  useEffect(() => {
    refresh();

    return () => {
      sequence.current++;
      controller.current?.abort();
    };
  }, [refresh]);

  useEffect(() => {
    const timer = setInterval(
      () => setToday(todayInZA()),
      60000
    );

    return () => clearInterval(timer);
  }, []);

  return {
    reviews: state.key === key ? state.rows : {},
    loading: state.key !== key || state.loading,
    error: state.key === key ? state.error : "",
    refresh,
    today,
  };
}

function summaryStatus(record, review, today) {
  if (record.status === "archived") {
    return ["archived", "Archived"];
  }

  if (!review?.reviewed_revision) {
    return ["pending", "Not yet reviewed"];
  }

  if (
    Number(review.reviewed_revision) !==
    Number(record.wiki_revision)
  ) {
    return ["pending", "Changed since review"];
  }

  if (
    !review.next_review_on ||
    review.next_review_on <= today
  ) {
    return ["due", "Review due"];
  }

  return ["current", "Current version reviewed"];
}

export default function WikiReviewSummary({
  record,
  review,
  employees = [],
  loading,
  error,
  today,
}) {
  if (loading) {
    return (
      <div className="td-wiki-summary">
        <small>Loading review details…</small>
      </div>
    );
  }

  if (error) {
    return (
      <div className="td-wiki-summary">
        <small>Review details unavailable</small>
      </div>
    );
  }

  const [tone, label] = summaryStatus(
    record,
    review,
    today
  );

  const owner =
    review?.owner_id || record.created_by;

  const person = employees.find(
    employee => employee.id === owner
  );

  const due = review?.next_review_on;

  return (
    <div className="td-wiki-summary">
      <span
        className="td-wrs-status"
        data-tone={tone}
      >
        {label}
      </span>

      <span>
        <strong>Maintainer:</strong>{" "}
        {person?.display_name ||
          (owner ? "Employee" : "Unassigned")}
      </span>

      <span>
        <strong>Next review:</strong>{" "}
        {due
          ? new Date(
              `${due}T12:00:00Z`
            ).toLocaleDateString("en-ZA", {
              day: "numeric",
              month: "short",
              year: "numeric",
              timeZone: "Africa/Johannesburg",
            })
          : "Not scheduled"}
      </span>
    </div>
  );
}