import { useEffect, useRef, useState } from "react";
import { Gift, RefreshCw, ArrowUpRight } from "lucide-react";
import { supabase } from "../lib/supabase.js";
import { safeExternalUrl } from "../lib/reporting.js";
import EmployeeAvatar from "./EmployeeAvatar.jsx";
import "./benefits-workspace.css";
import BenefitAllowances from "./BenefitAllowances.jsx";

const categories = {
  health: "Health",
  learning: "Learning",
  wellbeing: "Wellbeing",
  retirement: "Retirement",
  other: "Other",
};

const states = {
  open: "Submitted",
  reviewing: "Under review",
  answered: "Answered",
  closed: "Closed",
};

const date = value =>
  new Date(value).toLocaleString("en-ZA", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Johannesburg",
  });

export default function BenefitsWorkspace({
  employees = [],
  userId,
  isManager,
  records = [],
}) {
  const [offers, setOffers] = useState([]);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState("catalogue");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [editing, setEditing] = useState(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [chosen, setChosen] = useState("");

  const offerId = useRef(null);
  const requestId = useRef(null);
  const manager = isManager === true;

  const person = id =>
    employees.find(row => row.id === id)?.display_name || "Employee";

  const active = offers.filter(row => row.active);
  const selected = active.find(row => row.id === chosen) || active[0];

  const visible = offers.filter(row =>
    (category === "all" || category === row.category) &&
    `${row.title} ${row.summary} ${row.eligibility}`
      .toLowerCase()
      .includes(search.trim().toLowerCase()),
  );

  const legacy = records.filter(
    row => row.module_id === "people.benefits",
  );

  async function load(signal) {
    const results = await Promise.all([
      supabase
        .from("td_benefit_offers")
        .select("*")
        .order("updated_at", { ascending: false })
        .limit(100)
        .abortSignal(signal),

      supabase
        .from("td_benefit_requests")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100)
        .abortSignal(signal),
    ]);

    const failure = results.find(result => result.error)?.error;

    if (failure) {
      throw new Error(
        ["42P01", "PGRST205"].includes(failure.code)
          ? "Benefits is not configured yet. Run supabase/benefits.sql in the SQL Editor."
          : "Could not load Benefits. Check your connection and try Refresh.",
      );
    }

    if (!signal.aborted) {
      setOffers(results[0].data || []);
      setRequests(results[1].data || []);
    }
  }

  useEffect(() => {
    const abort = new AbortController();

    load(abort.signal)
      .catch(failure => {
        if (!abort.signal.aborted) setError(failure.message);
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });

    return () => abort.abort();
  }, [userId]);

  async function refresh() {
    setLoading(true);
    setError("");

    try {
      await load(new AbortController().signal);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setLoading(false);
    }
  }

  async function perform(operation) {
    if (busy) return;

    setBusy(true);
    setError("");
    setNotice("");

    try {
      await operation();
      await load(new AbortController().signal);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveOffer(event) {
    event.preventDefault();

    const values = Object.fromEntries(
      new FormData(event.currentTarget),
    );
    values.active = values.active === "on";

    const link = String(values.resource_url || "").trim();

    if (link && !safeExternalUrl(link)) {
      return setError(
        "Use an HTTPS resource link without embedded credentials.",
      );
    }

    values.resource_url = link;

    await perform(async () => {
      if (!offerId.current) {
        offerId.current = crypto.randomUUID();
      }

      const { error: failure } = await supabase.rpc(
        "td_benefit_save",
        {
          p_id: editing?.id || offerId.current,
          p_values: values,
          p_expected: editing?.updated_at || null,
        },
      );

      if (failure) throw new Error(failure.message);

      setEditorOpen(false);
      setEditing(null);
      offerId.current = null;
      setNotice(
        "Benefit saved. Employees can see it when Published is selected.",
      );
    });
  }

  async function submit(event) {
    event.preventDefault();
    if (!selected) return;

    const form = event.currentTarget;
    const values = new FormData(form);

    await perform(async () => {
      if (!requestId.current) {
        requestId.current = crypto.randomUUID();
      }

      const { error: failure } = await supabase.rpc(
        "td_benefit_request",
        {
          p_id: requestId.current,
          p_benefit: selected.id,
          p_kind: values.get("kind"),
          p_message: values.get("message"),
        },
      );

      if (failure) throw new Error(failure.message);

      requestId.current = null;
      form.reset();
      setNotice(
        "Your private request has been sent to HR. Track the reply below.",
      );
    });
  }

  async function review(event, request) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);

    await perform(async () => {
      const { error: failure } = await supabase.rpc(
        "td_benefit_review",
        {
          p_id: request.id,
          p_status: values.get("status"),
          p_reply: values.get("reply"),
          p_expected: request.updated_at,
        },
      );

      if (failure) throw new Error(failure.message);
      setNotice("Review saved. The employee can see your reply.");
    });
  }

  return (
    <section className="td-benefits">
      <header className="bf-hero">
        <div>
          <p className="bf-eyebrow">
            <Gift size={17} aria-hidden="true" />
            PEOPLE &amp; CULTURE
          </p>
          <h2>Benefits, made clear.</h2>
          <p>Understand the support available and get answers from HR.</p>
        </div>

        <button
          className="bf-outline"
          type="button"
          disabled={loading || busy}
          onClick={refresh}
        >
          <RefreshCw size={16} aria-hidden="true" />
          Refresh
        </button>
      </header>
<BenefitAllowances
  offers={offers}
  employees={employees}
  userId={userId}
  isManager={manager}
/>
      {error && <p className="bf-error" role="alert">{error}</p>}
      {notice && <p className="bf-notice" role="status">{notice}</p>}

      <div className="bf-stats">
        <div>
          <span>Published benefits</span>
          <strong>{loading ? "—" : active.length}</strong>
        </div>
        <div>
          <span>
            {manager ? "Open requests in this view" : "My open requests"}
          </span>
          <strong>
            {loading
              ? "—"
              : requests.filter(row =>
                  ["open", "reviewing"].includes(row.status),
                ).length}
          </strong>
        </div>
      </div>

      <nav className="bf-toolbar" aria-label="Benefits views">
        <div className="bf-switch">
          {[
            ["catalogue", "Benefits catalogue"],
            ["requests", manager ? "HR requests" : "My requests"],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-pressed={view === key}
              onClick={() => setView(key)}
            >
              {label}
            </button>
          ))}
        </div>

        {manager && (
          <button
            className="bf-primary"
            type="button"
            disabled={busy}
            onClick={() => {
              setEditing(null);
              offerId.current = null;
              setEditorOpen(true);
            }}
          >
            Publish a benefit
          </button>
        )}
      </nav>

      {manager && editorOpen && (
        <section className="bf-panel">
          <h3>{editing ? "Edit benefit" : "Publish a benefit"}</h3>

          <form key={editing?.id || "new"} onSubmit={saveOffer}>
            <fieldset disabled={busy}>
              <div className="bf-fields">
                <label>
                  Benefit name
                  <input
                    name="title"
                    maxLength={160}
                    defaultValue={editing?.title || ""}
                    required
                  />
                </label>

                <label>
                  Category
                  <select
                    name="category"
                    defaultValue={editing?.category || "other"}
                  >
                    {Object.entries(categories).map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                </label>

                <label className="bf-wide">
                  Short description
                  <textarea
                    name="summary"
                    maxLength={400}
                    defaultValue={editing?.summary || ""}
                    required
                  />
                </label>

                <label className="bf-wide">
                  Who is eligible?
                  <textarea
                    name="eligibility"
                    maxLength={1500}
                    defaultValue={editing?.eligibility || ""}
                    required
                  />
                </label>

                <label className="bf-wide">
                  How to use or request it
                  <textarea
                    name="instructions"
                    maxLength={2000}
                    defaultValue={editing?.instructions || ""}
                    required
                  />
                </label>

                <label className="bf-wide">
                  Official resource link (optional)
                  <input
                    name="resource_url"
                    type="url"
                    maxLength={2000}
                    defaultValue={editing?.resource_url || ""}
                    placeholder="https://…"
                  />
                </label>
              </div>

              <label className="bf-checkbox">
                <input
                  name="active"
                  type="checkbox"
                  defaultChecked={editing?.active ?? true}
                />
                Published — visible to employees
              </label>

              <div className="bf-buttons">
                <button className="bf-primary" type="submit">
                  {busy ? "Saving…" : "Save benefit"}
                </button>
                <button
                  className="bf-outline"
                  type="button"
                  onClick={() => {
                    setEditorOpen(false);
                    setEditing(null);
                  }}
                >
                  Cancel
                </button>
              </div>
            </fieldset>
          </form>
        </section>
      )}

      {loading && (
        <p role="status">Loading benefits and requests…</p>
      )}

      {view === "catalogue" && (
        <>
          <div className="bf-fields bf-panel">
            <label>
              Search benefits
              <input
                type="search"
                value={search}
                placeholder="Search name, support or eligibility…"
                onChange={event => setSearch(event.target.value)}
              />
            </label>

            <label>
              Category
              <select
                value={category}
                onChange={event => setCategory(event.target.value)}
              >
                <option value="all">All categories</option>
                {Object.entries(categories).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </label>
          </div>

          {!loading && !visible.length && (
            <div className="bf-panel bf-empty">
              <Gift size={30} aria-hidden="true" />
              <h3>
                {offers.length
                  ? "No matching benefits"
                  : "Your benefits belong here."}
              </h3>
              <p>
                {offers.length
                  ? "Try another search or category."
                  : manager
                    ? "Publish the benefits TechDev actually offers, with clear eligibility and access instructions."
                    : "HR will publish the company’s benefits here."}
              </p>
            </div>
          )}

          <div className="bf-grid">
            {visible.map(offer => (
              <article className="bf-panel bf-card" key={offer.id}>
                <header>
                  <span className="bf-pill">
                    {categories[offer.category]}
                  </span>
                  {!offer.active && (
                    <span className="bf-pill">Paused</span>
                  )}
                </header>

                <h3>{offer.title}</h3>
                <p>{offer.summary}</p>

                <details>
                  <summary>Eligibility &amp; how to access</summary>
                  <h4>Who it’s for</h4>
                  <p>{offer.eligibility}</p>
                  <h4>How to access it</h4>
                  <p>{offer.instructions}</p>

                  {safeExternalUrl(offer.resource_url) && (
                    <a
                      href={safeExternalUrl(offer.resource_url)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Official resource
                      <ArrowUpRight size={15} aria-hidden="true" />
                    </a>
                  )}
                </details>

                <small>Updated {date(offer.updated_at)}</small>

                <div className="bf-buttons">
                  {offer.active && (
                    <button
                      className="bf-primary"
                      type="button"
                      onClick={() => {
                        setChosen(offer.id);
                        requestId.current = null;
                        setView("requests");
                      }}
                    >
                      Ask HR or request benefit
                    </button>
                  )}

                  {manager && (
                    <button
                      className="bf-outline"
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setEditing(offer);
                        setEditorOpen(true);
                      }}
                    >
                      Edit
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        </>
      )}

      {view === "requests" && (
        <>
          {!!active.length && (
            <details className="bf-panel" open={!!chosen}>
              <summary>Start a private request</summary>

              <form onSubmit={submit}>
                <fieldset disabled={busy}>
                  <div className="bf-fields">
                    <label>
                      Benefit
                      <select
                        value={selected?.id || ""}
                        onChange={event => {
                          setChosen(event.target.value);
                          requestId.current = null;
                        }}
                      >
                        {active.map(offer => (
                          <option key={offer.id} value={offer.id}>
                            {offer.title}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label>
                      What do you need?
                      <select name="kind" defaultValue="question">
                        <option value="question">Ask a question</option>
                        <option value="request">Request this benefit</option>
                      </select>
                    </label>

                    <label className="bf-wide">
                      Message to HR
                      <textarea
                        name="message"
                        maxLength={2000}
                        required
                        placeholder="Tell HR what you need help with."
                      />
                    </label>
                  </div>

                  <button className="bf-primary" type="submit">
                    {busy ? "Sending…" : "Send to HR"}
                  </button>
                </fieldset>
              </form>
            </details>
          )}

          <p className="bf-muted">
            Requests and replies are private between the employee and HR.
            A reply here does not confirm provider enrolment.
          </p>

          {!loading && !requests.length && (
            <div className="bf-panel bf-empty">
              <h3>No requests yet</h3>
              <p>
                Choose a benefit to ask HR a question or submit a request.
              </p>
            </div>
          )}

          {requests.map(request => (
            <article className="bf-panel bf-request" key={request.id}>
              <header>
                <div className="bf-person">
                  <EmployeeAvatar
                    employeeId={request.employee_id}
                    interactive={false}
                  />
                  <div>
                    <strong>{person(request.employee_id)}</strong>
                    <small>{date(request.created_at)}</small>
                  </div>
                </div>

                <span
                  className="bf-pill"
                  data-state={request.status}
                >
                  {states[request.status]}
                </span>
              </header>

              <h3>{request.benefit_title}</h3>
              <small>
                {request.kind === "question" ? "Question" : "Benefit request"}
              </small>
              <p>{request.message}</p>

              {request.reply && (
                <div className="bf-reply">
                  <strong>
                    HR reply · {person(request.reviewed_by)}
                  </strong>
                  <p>{request.reply}</p>
                  <small>{date(request.updated_at)}</small>
                </div>
              )}

              {manager && (
                <details>
                  <summary>Review &amp; reply</summary>

                  <form
                    key={request.updated_at}
                    onSubmit={event => review(event, request)}
                  >
                    <fieldset disabled={busy}>
                      <label>
                        Status
                        <select
                          name="status"
                          defaultValue={request.status}
                        >
                          {Object.entries(states).map(([key, label]) => (
                            <option value={key} key={key}>{label}</option>
                          ))}
                        </select>
                      </label>

                      <label>
                        Reply to employee
                        <textarea
                          name="reply"
                          maxLength={2000}
                          defaultValue={request.reply}
                        />
                      </label>

                      <button className="bf-primary" type="submit">
                        {busy ? "Saving…" : "Save review"}
                      </button>
                    </fieldset>
                  </form>
                </details>
              )}
            </article>
          ))}
        </>
      )}

      {(offers.length === 100 || requests.length === 100) && (
        <small>
          Showing up to 100 recent benefits and 100 recent requests you can access.
        </small>
      )}

      {!!legacy.length && (
        <details className="bf-panel">
          <summary>Earlier benefits notes ({legacy.length})</summary>
          {legacy.map(row => (
            <article key={row.id}>
              <h4>{row.title}</h4>
              <p>{row.description}</p>
            </article>
          ))}
        </details>
      )}
    </section>
  );
}