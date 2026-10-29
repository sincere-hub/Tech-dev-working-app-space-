import {
  createElement as h,
  useEffect,
  useRef,
  useState,
} from "react";
import { Ban, ArrowLeft } from "lucide-react";

import EmployeeAvatar from "./EmployeeAvatar.jsx";
import { accessRequest } from "../lib/employeeAccess.js";

import "./admin-roles.css";
import "./employee-access.css";

export default function AdminBans({
  userId,
  onBack,
  onChanged,
}) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [bannedOnly, setBannedOnly] = useState(false);
  const [rows, setRows] = useState([]);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [message, setMessage] = useState("");
  const [revision, setRevision] = useState(0);

  const alive = useRef(true);
  const lock = useRef(false);
  const request = useRef(null);

  useEffect(() => {
    alive.current = true;

    return () => {
      alive.current = false;
      request.current?.abort();
    };
  }, [userId]);

  useEffect(() => {
    let live = true;
    let timer;

    const controller = new AbortController();

    setRows([]);
    setMore(false);
    setLoading(true);
    setLoadError("");

    const delay = setTimeout(async () => {
      timer = setTimeout(() => controller.abort(), 15000);

      try {
        const data = await accessRequest(
          userId,
          "admin_list_employee_access",
          {
            p_search: query.trim(),
            p_page: page,
            p_banned_only: bannedOnly,
          },
          controller.signal
        );

        if (!Array.isArray(data)) {
          throw new Error("The employee list was not returned.");
        }

        if (live) {
          setRows(data.slice(0, 50));
          setMore(data.length > 50);
        }
      } catch (failure) {
        if (live) {
          setLoadError(
            failure.message || "Employees could not be loaded."
          );
        }
      } finally {
        clearTimeout(timer);
        if (live) setLoading(false);
      }
    }, query.trim() ? 300 : 0);

    return () => {
      live = false;
      clearTimeout(delay);
      clearTimeout(timer);
      controller.abort();
    };
  }, [userId, query, page, bannedOnly, revision]);

  async function change(person) {
    if (
      lock.current ||
      loading ||
      person.id === userId
    ) return;

    const banned = person.access_pending
      ? person.access_target_banned
      : !person.is_banned;

    if (!window.confirm(
      `${banned ? "Ban" : "Unban"} ${person.display_name}?\n\n` +
      (banned
        ? "They will be signed out and blocked from the app."
        : "They will be able to sign in again.")
    )) return;

    lock.current = true;
    setBusy(person.id);
    setError("");
    setMessage("");

    const controller = new AbortController();
    request.current = controller;

    const timer = setTimeout(
      () => controller.abort(),
      45000
    );

    try {
      const data = await accessRequest(
        userId,
        "employee-access",
        {
          action: banned ? "ban" : "unban",
          employeeId: person.id,
          version: Number(person.access_version),
        },
        controller.signal,
        true
      );

      if (
        data?.employeeId !== person.id ||
        data.is_banned !== banned
      ) {
        throw new Error(
          "The access change was not confirmed. Refresh before retrying."
        );
      }

      if (alive.current) {
        setMessage(banned
          ? `${person.display_name} has been banned.`
          : `${person.display_name} has been unbanned and can sign in again.`
        );
      }
    } catch (failure) {
      if (alive.current) {
        setError(
          failure.message ||
          "The access change could not finish."
        );
      }
    } finally {
      clearTimeout(timer);
      lock.current = false;
      request.current = null;

      if (alive.current) {
        setBusy("");
        setRevision(value => value + 1);

        try {
          await onChanged?.();
        } catch {}
      }
    }
  }

  return h(
    "section",
    { className: "ar-tool ab-page" },

    h(
      "button",
      {
        type: "button",
        disabled: Boolean(busy),
        onClick: onBack,
      },
      h(ArrowLeft, { size: 16, "aria-hidden": true }),
      "Back to role management"
    ),

    h(
      "header",
      { className: "ar-header ab-heading" },
      h(
        "span",
        { className: "ar-emblem" },
        h(Ban, { size: 25, "aria-hidden": true })
      ),
      h(
        "div",
        null,
        h("p", { className: "ar-eyebrow" }, "EMPLOYEE ACCESS"),
        h("h2", null, "Ban employees"),
        h(
          "p",
          null,
          "Find an employee, block their access or restore it. Their records are kept."
        )
      )
    ),

    h(
      "div",
      { className: "ar-toolbar" },
      h(
        "label",
        { className: "ar-search" },
        h("input", {
          value: query,
          maxLength: 120,
          disabled: Boolean(busy),
          placeholder: "Search name, job title or employee ID…",
          "aria-label": "Search employees to ban",
          onChange: event => {
            setQuery(event.target.value);
            setPage(0);
          },
        })
      ),
      h(
        "button",
        {
          type: "button",
          disabled: loading || Boolean(busy),
          onClick: () => setRevision(value => value + 1),
        },
        "Refresh"
      )
    ),

    h(
      "label",
      { className: "ab-filter" },
      h("input", {
        type: "checkbox",
        checked: bannedOnly,
        disabled: Boolean(busy),
        onChange: event => {
          setBannedOnly(event.target.checked);
          setPage(0);
        },
      }),
      "Show banned employees only"
    ),

    message && h(
      "p",
      { className: "ar-success", role: "status" },
      message
    ),

    (error || loadError) && h(
      "p",
      { className: "ar-error", role: "alert" },
      error || loadError
    ),

    loading && h(
      "p",
      { className: "ar-empty", role: "status" },
      "Loading employees…"
    ),

    h(
      "div",
      { className: "ar-people" },
      rows.map(person => h(
        "article",
        {
          className: "ar-person ab-person",
          key: person.id,
        },
        h(
          "span",
          { className: "ar-avatar" },
 h(EmployeeAvatar, {
  employeeId: person.id,
  banned: person.is_banned,
})
        ),
        h(
          "div",
          { className: "ar-person-copy" },
          h("strong", null, person.display_name),
          h("span", null, person.job_title || "Employee"),
          h(
            "small",
            null,
            person.id === userId
              ? "Your administrator account is protected"
              : person.access_pending
                ? "Access blocked · synchronization needs completion"
                : person.is_banned
                  ? "Banned"
                  : "Active"
          )
        ),
        h(
          "button",
          {
            type: "button",
            className:
              person.is_banned && !person.access_pending
                ? "ab-unban"
                : "ab-ban",
            disabled:
              loading ||
              Boolean(busy) ||
              person.id === userId,
            onClick: () => change(person),
          },
          busy === person.id
            ? "Saving…"
            : person.access_pending
              ? "Retry access change"
              : person.is_banned
                ? "Unban employee"
                : "Ban employee"
        )
      ))
    ),

    !loading && !loadError && !rows.length && h(
      "p",
      { className: "ar-empty" },
      "No employees match this search."
    ),

    h(
      "footer",
      { className: "ar-footer" },
      h("span", null, `Page ${page + 1}`),
      h(
        "div",
        null,
        h(
          "button",
          {
            type: "button",
            disabled: page === 0 || loading || Boolean(busy),
            onClick: () => setPage(value => value - 1),
          },
          "Previous"
        ),
        h(
          "button",
          {
            type: "button",
            disabled: !more || loading || Boolean(busy),
            onClick: () => setPage(value => value + 1),
          },
          "Next"
        )
      )
    )
  );
}