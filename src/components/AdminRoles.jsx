import {
  createElement as h,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

import {
  ShieldCheck,
  Search,
  RefreshCw,
} from "lucide-react";

import { supabase } from "../lib/supabase.js";
import EmployeeAvatar from "./EmployeeAvatar.jsx";
import "./admin-roles.css";

const roles = {
  employee: "Employee",
  manager: "Manager",
  admin: "Admin",
};

async function waitFor(promise, signal) {
  let cancel;

  const stopped = new Promise((_, reject) => {
    cancel = () =>
      reject(
        new Error(
          "The request stopped or timed out. Refresh roles before retrying.",
        ),
      );

    if (signal.aborted) cancel();
    else {
      signal.addEventListener("abort", cancel, {
        once: true,
      });
    }
  });

  try {
    return await Promise.race([promise, stopped]);
  } finally {
    signal.removeEventListener("abort", cancel);
  }
}

export async function roleRequest(
  userId,
  functionName,
  args,
  signal,
) {
  async function session() {
    const result = await waitFor(
      supabase.auth.getSession(),
      signal,
    );

    if (result.error) throw result.error;

    if (
      signal.aborted ||
      !userId ||
      result.data.session?.user.id !== userId
    ) {
      throw new Error(
        "Your account changed. Reopen Manager tools.",
      );
    }

    return result.data.session.access_token;
  }

  const token = await session();

  const result = await waitFor(
    supabase
      .rpc(functionName, args)
      .setHeader("Authorization", `Bearer ${token}`)
      .abortSignal(signal),
    signal,
  );

  if (result.error) {
    throw new Error(
      result.error.message ||
        "Roles could not be loaded.",
    );
  }

  await session();

  return result.data;
}

function RoleRow({
  person,
  userId,
  disabled,
  saving,
  onSave,
}) {
  const [choice, setChoice] = useState(person.role);
  const own = person.id === userId;

  return h(
    "article",
    { className: "ar-person" },

    h(
      "span",
      { className: "ar-avatar" },
      h(EmployeeAvatar, {
        employeeId: person.id,
      }),
    ),

    h(
      "div",
      { className: "ar-person-copy" },

      h("strong", null, person.display_name),

      h(
        "span",
        null,
        person.job_title || "Employee",
      ),

      h(
        "small",
        null,
        own
          ? "You · your admin role is protected"
          : `Current role: ${
              roles[person.role] || person.role
            }`,
      ),
    ),

    h(
      "select",
      {
        value: choice,
        disabled: disabled || own,
        "aria-label": `Role for ${person.display_name}`,

        onChange: event =>
          setChoice(event.target.value),
      },

      Object.entries(roles).map(([value, label]) =>
        h("option", { key: value, value }, label),
      ),
    ),

    h(
      "button",
      {
        type: "button",
        className: "ar-save",

        disabled:
          disabled ||
          own ||
          choice === person.role,

        onClick: () => onSave(person, choice),
      },

      saving ? "Saving…" : "Save role",
    ),
  );
}

export default function AdminRoles({
  userId,
  onChanged,
}) {
  const headingId = useId();

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState([]);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState("");

  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState("");
  const [refresh, setRefresh] = useState(0);

  const alive = useRef(true);
  const lock = useRef(false);
  const mutation = useRef(null);

  useEffect(() => {
    alive.current = true;

    return () => {
      alive.current = false;
      mutation.current?.abort();
    };
  }, [userId]);

  useEffect(() => {
    let live = true;
    let timeout;

    const controller = new AbortController();

    setRows([]);
    setMore(false);
    setLoading(true);
    setLoadError("");

    const delay = setTimeout(
      async () => {
        timeout = setTimeout(
          () => controller.abort(),
          15000,
        );

        try {
          const data = await roleRequest(
            userId,
            "admin_list_employee_roles",
            {
              p_search: search.trim(),
              p_page: page,
            },
            controller.signal,
          );

          if (!Array.isArray(data)) {
            throw new Error(
              "The employee list was not returned. Refresh roles.",
            );
          }

          if (live) {
            setRows(data.slice(0, 50));
            setMore(data.length > 50);
          }
        } catch (failure) {
          if (live) {
            setLoadError(
              failure.message ||
                "Could not load employee roles.",
            );
          }
        } finally {
          clearTimeout(timeout);

          if (live) setLoading(false);
        }
      },

      search.trim() ? 300 : 0,
    );

    return () => {
      live = false;
      clearTimeout(delay);
      clearTimeout(timeout);
      controller.abort();
    };
  }, [userId, search, page, refresh]);

  async function save(person, nextRole) {
    if (
      lock.current ||
      loading ||
      person.id === userId ||
      !Object.hasOwn(roles, nextRole) ||
      person.role === nextRole
    ) {
      return;
    }

    if (!navigator.onLine) {
      setError(
        "Connect to the internet to change roles.",
      );
      return;
    }

    if (
      !window.confirm(
        `Change ${person.display_name} from ` +
          `${roles[person.role]} to ${roles[nextRole]}?\n\n` +
          "Their workspace permissions will change.",
      )
    ) {
      return;
    }

    lock.current = true;
    setSaving(person.id);
    setError("");
    setNotice("");

    const controller = new AbortController();
    mutation.current = controller;

    const timer = setTimeout(
      () => controller.abort(),
      15000,
    );

    try {
      const result = await roleRequest(
        userId,
        "admin_set_employee_role",
        {
          p_employee_id: person.id,
          p_role: nextRole,
          p_expected_role: person.role,
        },
        controller.signal,
      );

      clearTimeout(timer);

      if (
        result?.employee_id !== person.id ||
        result?.role !== nextRole
      ) {
        throw new Error(
          "The change was not confirmed. Refresh roles before retrying.",
        );
      }

      if (!alive.current) return;

      setNotice(
        `${person.display_name} is now ${roles[nextRole]}. ` +
          "Ask them to refresh their app to update the menu.",
      );

      setRefresh(value => value + 1);

      try {
        const updated = await onChanged?.();

        if (updated === false && alive.current) {
          setError(
            "Role saved. Refresh the workspace to update its other screens.",
          );
        }
      } catch {
        if (alive.current) {
          setError(
            "Role saved. Refresh the workspace to update its other screens.",
          );
        }
      }
    } catch (failure) {
      if (alive.current) {
        setError(
          failure.message ||
            "Could not change this role. Refresh before retrying.",
        );

        setRefresh(value => value + 1);
      }
    } finally {
      clearTimeout(timer);
      lock.current = false;

      if (mutation.current === controller) {
        mutation.current = null;
      }

      if (alive.current) setSaving("");
    }
  }

  return h(
    "section",
    {
      className: "ar-tool",
      "aria-labelledby": headingId,
    },

    h(
      "header",
      { className: "ar-header" },

      h(
        "span",
        { className: "ar-emblem" },
        h(ShieldCheck, {
          size: 25,
          "aria-hidden": true,
        }),
      ),

      h(
        "div",
        null,

        h(
          "p",
          { className: "ar-eyebrow" },
          "ADMINISTRATION",
        ),

        h(
          "h2",
          { id: headingId },
          "Role management",
        ),

        h(
          "p",
          null,
          "Choose who can manage the company and who needs standard employee access.",
        ),
      ),

      h(
        "span",
        { className: "ar-badge" },
        "Admin only",
      ),
    ),

    h(
      "div",
      { className: "ar-guide" },

      h(
        "p",
        null,
        h("strong", null, "Employee"),
        "Standard staff access.",
      ),

      h(
        "p",
        null,
        h("strong", null, "Manager"),
        "Team management and reviews.",
      ),

      h(
        "p",
        null,
        h("strong", null, "Admin"),
        "Company administration and role management.",
      ),
    ),

    h(
      "div",
      { className: "ar-toolbar" },

      h(
        "label",
        { className: "ar-search" },

        h(Search, {
          size: 18,
          "aria-hidden": true,
        }),

        h("input", {
          value: search,
          maxLength: 120,
          disabled: Boolean(saving),

          placeholder:
            "Search name, job title or employee ID…",

          "aria-label": "Search employee roles",

          onChange: event => {
            setSearch(event.target.value);
            setPage(0);
          },
        }),
      ),

      h(
        "button",
        {
          type: "button",
          disabled: loading || Boolean(saving),

          onClick: () =>
            setRefresh(value => value + 1),
        },

        h(RefreshCw, {
          size: 16,
          "aria-hidden": true,
        }),

        "Refresh roles",
      ),
    ),

    notice &&
      h(
        "p",
        {
          className: "ar-success",
          role: "status",
        },
        notice,
      ),

    (error || loadError) &&
      h(
        "p",
        {
          className: "ar-error",
          role: "alert",
        },
        error || loadError,
      ),

    loading &&
      h(
        "p",
        {
          className: "ar-empty",
          role: "status",
        },
        "Loading employee roles…",
      ),

    h(
      "div",
      {
        className: "ar-people",
        "aria-busy": loading,
      },

      rows.map(person =>
        h(RoleRow, {
          key: `${person.id}:${person.role}`,
          person,
          userId,
          disabled: loading || Boolean(saving),
          saving: saving === person.id,
          onSave: save,
        }),
      ),
    ),

    !loading &&
      !error &&
      !loadError &&
      !rows.length &&
      h(
        "p",
        { className: "ar-empty" },
        "No employees match this search.",
      ),

    h(
      "footer",
      { className: "ar-footer" },

      h(
        "span",
        null,
        `Page ${page + 1} · up to 50 employees per page`,
      ),

      h(
        "div",
        null,

        h(
          "button",
          {
            type: "button",

            disabled:
              page === 0 ||
              loading ||
              Boolean(saving),

            onClick: () =>
              setPage(value => value - 1),
          },
          "Previous",
        ),

        h(
          "button",
          {
            type: "button",

            disabled:
              !more ||
              loading ||
              Boolean(saving),

            onClick: () =>
              setPage(value => value + 1),
          },
          "Next",
        ),
      ),
    ),
  );
}