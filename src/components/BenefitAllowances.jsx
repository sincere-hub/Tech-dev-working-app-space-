import { useEffect, useRef, useState } from "react";
import { Wallet, RefreshCw } from "lucide-react";
import { supabase } from "../lib/supabase.js";
import EmployeeAvatar from "./EmployeeAvatar.jsx";

const money = cents =>
  new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
  }).format(Number(cents) / 100);

const available = row =>
  Number(row.budget_cents) -
  Number(row.pending_cents) -
  Number(row.approved_cents);

const today = () => {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Africa/Johannesburg",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const part = name =>
    parts.find(item => item.type === name).value;

  return `${part("year")}-${part("month")}-${part("day")}`;
};

function UseAllowance({ allocation, disabled, busy, onSend }) {
  const id = useRef(null);

  return (
    <details>
      <summary>Request support from this allowance</summary>

      <form
        onSubmit={async event => {
          event.preventDefault();

          const form = event.currentTarget;
          const fields = new FormData(form);

          if (!id.current) id.current = crypto.randomUUID();

          const saved = await onSend({
            p_id: id.current,
            p_allowance: allocation.id,
            p_amount: fields.get("amount"),
            p_reason: fields.get("reason"),
          });

          if (saved) {
            id.current = null;
            form.reset();
          }
        }}
      >
        <fieldset disabled={disabled || busy}>
          <label>
            Amount requested (ZAR)
            <input
              name="amount"
              type="number"
              min="0.01"
              step="0.01"
              max={available(allocation) / 100}
              required
            />
          </label>

          <label>
            What will this support?
            <textarea name="reason" maxLength={1500} required />
          </label>

          <button className="bf-primary" type="submit">
            {busy ? "Sending…" : "Submit for approval"}
          </button>
        </fieldset>
      </form>
    </details>
  );
}

export default function BenefitAllowances({
  offers,
  employees,
  userId,
  isManager,
}) {
  const [allocations, setAllocations] = useState([]);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const assignmentId = useRef(null);

  const name = id =>
    employees.find(row => row.id === id)?.display_name || "Employee";

  const published = offers.filter(row => row.active);

  async function load(signal) {
    const results = await Promise.all([
      supabase
        .from("td_benefit_allowances")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200)
        .abortSignal(signal),

      supabase
        .from("td_benefit_support")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200)
        .abortSignal(signal),
    ]);

    const failure = results.find(result => result.error)?.error;

    if (failure) {
      throw new Error(
        ["42P01", "PGRST205"].includes(failure.code)
          ? "Run benefit-allowances.sql to enable balances and support approvals."
          : "Could not load allowances. Try Refresh balances.",
      );
    }

    if (!signal.aborted) {
      setAllocations(results[0].data || []);
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

  async function action(rpc, body, message) {
    if (busy) return false;

    setBusy(true);
    setError("");
    setNotice("");

    try {
      const { error: failure } = await supabase.rpc(rpc, body);

      if (failure) throw new Error(failure.message);

      setNotice(message);

      try {
        await load(new AbortController().signal);
      } catch (failure) {
        setError(failure.message);
      }

      return true;
    } catch (failure) {
      setError(failure.message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function allocate(event) {
    event.preventDefault();

    const form = event.currentTarget;
    const fields = new FormData(form);

    if (!assignmentId.current) {
      assignmentId.current = crypto.randomUUID();
    }

    const saved = await action(
      "td_benefit_allocate",
      {
        p_id: assignmentId.current,
        p_employee: fields.get("employee"),
        p_benefit: fields.get("benefit"),
        p_start: fields.get("start"),
        p_end: fields.get("end"),
        p_budget: fields.get("budget"),
      },
      "Allowance assigned. The employee can now see their available support.",
    );

    if (saved) {
      assignmentId.current = null;
      form.reset();
    }
  }

  const pending = requests.filter(row => row.status === "pending");

  return (
    <section className="bf-panel bf-allowances">
      <header className="bf-toolbar">
        <div>
          <p className="bf-eyebrow">
            <Wallet size={17} aria-hidden="true" />
            ALLOWANCES &amp; SUPPORT
          </p>
          <h3>
            {isManager
              ? "Turn benefits into real support."
              : "Know what support is yours."}
          </h3>
        </div>

        <button
          className="bf-outline"
          type="button"
          disabled={busy || loading}
          onClick={refresh}
        >
          <RefreshCw size={15} aria-hidden="true" />
          Refresh balances
        </button>
      </header>

      <p>
        Pending requests reserve allowance. Approval records authorised
        support; payment is handled separately.
      </p>

      {error && <p className="bf-error" role="alert">{error}</p>}
      {notice && <p className="bf-notice" role="status">{notice}</p>}

      {isManager && (
        <details>
          <summary>Assign an allowance</summary>

          <form onSubmit={allocate}>
            <fieldset disabled={busy}>
              <div className="bf-fields">
                <label>
                  Employee
                  <select name="employee" defaultValue="" required>
                    <option value="">Choose an employee</option>
                    {employees
                      .filter(row => !row.is_banned)
                      .map(row => (
                        <option value={row.id} key={row.id}>
                          {row.display_name}
                        </option>
                      ))}
                  </select>
                </label>

                <label>
                  Published benefit
                  <select name="benefit" defaultValue="" required disabled={!published.length}>
                  <option value=""> {published.length ? "Choose a benefit" : "Publish a benefit first"} </option>
                    <option value="">Choose a benefit</option>
                    {published.map(row => (
                      <option value={row.id} key={row.id}>
                        {row.title}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Starts (SAST)
                  <input name="start" type="date" required />
                </label>

                <label>
                  Ends (SAST)
                  <input name="end" type="date" required />
                </label>

                <label>
                  Approved period budget (ZAR)
                  <input
                    name="budget"
                    type="number"
                    min="0.01"
                    max="1000000"
                    step="0.01"
                    required
                  />
                </label>
              </div>

              <button className="bf-primary" type="submit" disabled={busy || !published.length}>
               {busy ? "Saving…" : "Assign allowance"}
            </button>
            </fieldset>
          </form>

          {!published.length && (
            <p>
              Publish the benefit in the catalogue before assigning
              an allowance.
            </p>
          )}
        </details>
      )}

      {loading && <p role="status">Loading balances…</p>}

      {!loading && !allocations.length && (
        <p>
          {isManager
            ? "Assign a budget to a colleague for an approved benefit, such as learning support."
            : "You have no assigned monetary allowances yet. The catalogue may also include benefits without an allowance."}
        </p>
      )}

      <div className="bf-grid">
        {allocations.map(row => {
          const current =
            row.starts_on <= today() && today() <= row.ends_on;

          const open =
            current &&
            published.some(offer => offer.id === row.benefit_id);

          return (
            <article
              className="bf-panel bf-allowance-card"
              key={row.id}
            >
              {isManager && (
                <div className="bf-person">
                  <EmployeeAvatar
                    employeeId={row.employee_id}
                    interactive={false}
                  />
                  <strong>{name(row.employee_id)}</strong>
                </div>
              )}

              <h4>{row.benefit_title}</h4>
              <small>
                {row.starts_on} → {row.ends_on} · SAST
              </small>

              <div className="bf-balance">
                <span>Available to request</span>
                <strong>{money(available(row))}</strong>
              </div>

              <div className="bf-balance-breakdown">
                <span>
                  Budget <b>{money(row.budget_cents)}</b>
                </span>
                <span>
                  Pending <b>{money(row.pending_cents)}</b>
                </span>
                <span>
                  Approved <b>{money(row.approved_cents)}</b>
                </span>
              </div>

              {!current && (
                <small>
                  Requests open only within the dates above.
                </small>
              )}

              {current && !open && (
                <small>
                  This benefit is paused or unavailable for new requests.
                </small>
              )}

              {row.employee_id === userId &&
                open &&
                available(row) > 0 && (
                  <UseAllowance
                    allocation={row}
                    busy={busy}
                    onSend={body =>
                      action(
                        "td_benefit_use",
                        body,
                        "Request sent. Its amount is reserved while HR reviews it.",
                      )
                    }
                  />
                )}
            </article>
          );
        })}
      </div>

      <h4>
        {isManager ? "Support requests" : "My support requests"}
        {" · "}{pending.length} pending in this view
      </h4>

      {requests.map(request => (
        <article
          className="bf-panel bf-support-request"
          key={request.id}
        >
          <header className="bf-toolbar">
            <strong>
              {isManager ? `${name(request.employee_id)} · ` : ""}
              {money(request.amount_cents)}
            </strong>
            <span className="bf-pill" data-state={request.status}>
              {request.status}
            </span>
          </header>

          <small>
            {allocations.find(row => row.id === request.allowance_id)
              ?.benefit_title || "Benefit support"}
          </small>

          <p>{request.reason}</p>

          {request.reply && (
            <div className="bf-reply">
              <strong>
                {request.status === "cancelled"
                  ? "Withdrawn"
                  : `HR decision · ${name(request.reviewed_by)}`}
              </strong>
              <p>{request.reply}</p>
            </div>
          )}

          {request.status === "pending" &&
            request.employee_id === userId && (
              <button
                className="bf-outline"
                type="button"
                disabled={busy}
                onClick={() =>
                  action(
                    "td_benefit_decide",
                    {
                      p_id: request.id,
                      p_decision: "cancelled",
                      p_reply: "Withdrawn by employee",
                    },
                    "Request withdrawn. Reserved allowance released.",
                  )
                }
              >
                Withdraw request
              </button>
            )}

          {request.status === "pending" &&
            isManager &&
            request.employee_id !== userId && (
              <form
                onSubmit={event => {
                  event.preventDefault();
                  const fields = new FormData(event.currentTarget);

                  void action(
                    "td_benefit_decide",
                    {
                      p_id: request.id,
                      p_decision: fields.get("decision"),
                      p_reply: fields.get("reply"),
                    },
                    "Decision saved. The allowance balance has been updated.",
                  );
                }}
              >
                <fieldset disabled={busy}>
                  <label>
                    Decision
                    <select name="decision">
                      <option value="approved">Approve support</option>
                      <option value="declined">Decline</option>
                    </select>
                  </label>

                  <label>
                    Response to employee
                    <textarea name="reply" maxLength={1500} required />
                  </label>

                  <button className="bf-primary" type="submit">
                    Save decision
                  </button>
                </fieldset>
              </form>
            )}
        </article>
      ))}

      {(allocations.length === 200 || requests.length === 200) && (
        <small>
          Showing up to 200 recent allocations and requests. Balances
          include all recorded approvals and reservations.
        </small>
      )}
    </section>
  );
}