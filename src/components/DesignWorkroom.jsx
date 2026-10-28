import {
  createElement as h,
  useEffect,
  useRef,
  useState,
} from "react";

import { supabase } from "../lib/supabase.js";

import "./design-workroom.css";
import SubmittedWorkPreview from "./SubmittedWorkPreview.jsx";

const MODULE = "collaboration.design-system";
const MARKER = "design_work_brief";

const labels = {
  pending: "Awaiting review",
  approved: "Approved",
  changes_requested: "Changes requested",
};

export function workLink(value) {
  try {
    const url = new URL(value);

    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password
    )
      ? url.href
      : "";
  } catch {
    return "";
  }
}

function date(value) {
  const d = new Date(value);

  return value && !Number.isNaN(d.getTime())
    ? d.toLocaleString("en-ZA", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Africa/Johannesburg",
      })
    : "";
}

function short(value) {
  const text = String(value || "")
    .replace(/\s+/g, " ")
    .trim();

  return text.length > 150
    ? text.slice(0, 150) + "…"
    : text;
}

function untilAbort(promise, signal) {
  let stop;

  const aborted = new Promise((_, reject) => {
    stop = () => reject(
      new Error(
        "The request timed out. Refresh before trying again.",
      ),
    );

    if (signal.aborted) stop();
    else {
      signal.addEventListener("abort", stop, {
        once: true,
      });
    }
  });

  return Promise.race([
    promise,
    aborted,
  ]).finally(() => {
    signal.removeEventListener("abort", stop);
  });
}

function Button({
  children,
  primary = false,
  ...props
}) {
  return h(
    "button",
    {
      type: "button",
      ...props,
      className:
        `dw-button${primary ? " dw-primary" : ""}`,
    },
    children,
  );
}

function InstructionEditor({
  record,
  onSave,
  onClose,
  onSaved,
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const lock = useRef(false);
  const alive = useRef(true);
  const dirty = useRef(false);

  useEffect(() => {
    alive.current = true;

    return () => {
      alive.current = false;
    };
  }, []);

  async function submit(event) {
    event.preventDefault();

    if (lock.current) return;

    const form = new FormData(event.currentTarget);

    const title = String(
      form.get("title") || "",
    ).trim();

    const description = String(
      form.get("description") || "",
    ).trim();

    const url = String(
      form.get("resource_url") || "",
    ).trim();

    setError("");

    if (!title || !description) {
      setError(
        "Add a title and instructions for employees.",
      );
      return;
    }

    if (url && !workLink(url)) {
      setError(
        "Use a full HTTPS tool or reference link.",
      );
      return;
    }

    if (!navigator.onLine) {
      setError(
        "Connect to the internet to post these instructions.",
      );
      return;
    }

    lock.current = true;
    setBusy(true);

    try {
      const result = await onSave(record, {
        title,
        description,
        status: "open",
        visibility:
          record?.visibility || "company",

        metadata: {
          ...record?.metadata,
          field_value: MARKER,
          resource_url:
            url ? workLink(url) : "",
        },
      });

      if (!result) {
        throw new Error(
          "Saving was not confirmed. Your instructions are still here.",
        );
      }

      if (alive.current) {
        onSaved(result.id || record?.id);
      }
    } catch (failure) {
      if (alive.current) {
        setError(
          failure.message ||
          "Could not post the instructions.",
        );
      }
    } finally {
      lock.current = false;

      if (alive.current) {
        setBusy(false);
      }
    }
  }

  return h(
    "form",
    {
      className: "dw-panel dw-form",
      onSubmit: submit,

      onChange: () => {
        dirty.current = true;
      },
    },

    h(
      "div",
      { className: "dw-row" },

      h(
        "h2",
        null,
        record
          ? "Edit instructions"
          : "Write instructions",
      ),

      h(
        Button,
        {
          disabled: busy,

          onClick: () => {
            if (
              !dirty.current ||
              window.confirm(
                "Discard unsaved instructions?",
              )
            ) {
              onClose();
            }
          },
        },
        "Cancel",
      ),
    ),

    h(
      "fieldset",
      { disabled: busy },

      h(
        "label",
        null,
        "Title",

        h("input", {
          name: "title",
          required: true,
          maxLength: 180,
          defaultValue: record?.title || "",
          autoFocus: true,

          placeholder:
            "For example: Tools to use for company designs",
        }),
      ),

      h(
        "label",
        null,
        "Instructions",

        h("textarea", {
          name: "description",
          required: true,
          rows: 6,
          maxLength: 5000,

          defaultValue:
            record?.description || "",

          placeholder:
            "Explain what employees should use, what they should make, and what you will review.",
        }),
      ),

      h(
        "label",
        null,
        "Tool or reference link · optional",

        h("input", {
          name: "resource_url",
          type: "url",
          maxLength: 2000,

          defaultValue:
            record?.metadata?.resource_url || "",

          placeholder:
            "https://www.figma.com/…",
        }),
      ),
    ),

    error &&
      h(
        "p",
        {
          className: "dw-error",
          role: "alert",
        },
        error,
      ),

    h(
      Button,
      {
        type: "submit",
        primary: true,
        disabled: busy,
      },

      busy
        ? "Posting…"
        : record
          ? "Save instructions"
          : "Post instructions",
    ),
  );
}

function WorkForm({
  record,
  work,
  userId,
  run,
  onSaved,
  onCancel,
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const lock = useRef(false);
  const alive = useRef(true);
  const draftId = useRef(null);
  const formRef = useRef(null);

  useEffect(() => {
    alive.current = true;

    if (work) {
      formRef.current?.scrollIntoView({
        block: "center",
      });
    }

    return () => {
      alive.current = false;
    };
  }, []);

  async function submit(event) {
    event.preventDefault();

    if (lock.current) return;

    const form = new FormData(event.currentTarget);

    const url = workLink(
      String(form.get("url") || "").trim(),
    );

    const note = String(
      form.get("note") || "",
    ).trim();

    setError("");

    if (!url) {
      setError(
        "Add a valid HTTPS link to your work.",
      );
      return;
    }

    if (!navigator.onLine) {
      setError(
        "Connect to the internet to submit your work.",
      );
      return;
    }

    lock.current = true;
    setBusy(true);

    try {
      let query;

      if (work) {
        query = supabase
          .from("design_work_submissions")
          .update({
            work_url: url,
            note,
            status: "pending",
          })
          .eq("id", work.id)
          .eq("updated_at", work.updated_at)
          .select("*")
          .single();
      } else {
        draftId.current ||= crypto.randomUUID();

        query = supabase
          .from("design_work_submissions")
          .insert({
            id: draftId.current,
            record_id: record.id,
            employee_id: userId,
            work_url: url,
            note,
          })
          .select("*")
          .single();
      }

      await run(query);

      if (alive.current) {
        await onSaved();
      }
    } catch (failure) {
      if (alive.current) {
        setError(
          failure.message ||
          "Could not submit your work.",
        );
      }
    } finally {
      lock.current = false;

      if (alive.current) {
        setBusy(false);
      }
    }
  }

  return h(
    "form",
    {
      ref: formRef,
      className: "dw-panel dw-form",
      onSubmit: submit,
    },

    h(
      "h3",
      null,

      work
        ? "Update and resubmit your work"
        : "Submit your work",
    ),

    h(
      "p",
      { className: "dw-muted" },

      "Share a Figma, Canva, GitHub or other work link. Make sure your reviewer can open it.",
    ),

    h(
      "fieldset",
      { disabled: busy },

      h(
        "label",
        null,
        "Work link",

        h("input", {
          name: "url",
          type: "url",
          required: true,
          maxLength: 2000,
          defaultValue: work?.work_url || "",
          placeholder: "https://…",
        }),
      ),

      h(
        "label",
        null,
        "Message to your reviewer · optional",

        h("textarea", {
          name: "note",
          rows: 3,
          maxLength: 2000,
          defaultValue: work?.note || "",
        }),
      ),
    ),

    error &&
      h(
        "p",
        {
          className: "dw-error",
          role: "alert",
        },
        error,
      ),

    h(
      "div",
      { className: "dw-actions" },

      h(
        Button,
        {
          type: "submit",
          primary: true,
          disabled: busy,
        },

        busy
          ? "Sending…"
          : work
            ? "Resubmit for review"
            : "Submit work",
      ),

      work &&
        h(
          Button,
          {
            disabled: busy,
            onClick: onCancel,
          },
          "Cancel edit",
        ),
    ),
  );
}

function WorkCard({
  work,
  isManager,
  userId,
  name,
  run,
  onSaved,
  onEdit,
}) {
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [previewOpen, setPreviewOpen] =
    useState(false);

  const lock = useRef(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;

    return () => {
      alive.current = false;
    };
  }, []);

  async function review(status) {
    if (lock.current || !isManager) return;

    setError("");

    if (
      status === "changes_requested" &&
      !feedback.trim()
    ) {
      setError(
        "Explain what the employee needs to change.",
      );
      return;
    }

    lock.current = true;
    setBusy(true);

    try {
      await run(
        supabase
          .from("design_work_submissions")
          .update({
            status,
            feedback: feedback.trim(),
          })
          .eq("id", work.id)
          .eq("updated_at", work.updated_at)
          .select("*")
          .single(),
      );

      if (alive.current) await onSaved();
    } catch (failure) {
      if (alive.current) {
        setError(
          failure.message ||
            "Could not save the review.",
        );
      }
    } finally {
      lock.current = false;

      if (alive.current) setBusy(false);
    }
  }

  const details = h(
    "div",
    { className: "dw-form" },

    h(
      "div",
      { className: "dw-row" },

      h("strong", null, name(work.employee_id)),

      h(
        "span",
        {
          className: `dw-status dw-${work.status}`,
        },
        labels[work.status],
      ),
    ),

    h(
      "small",
      { className: "dw-muted" },
      date(work.updated_at),
    ),

    work.note &&
      h(
        "p",
        { className: "dw-copy" },
        work.note,
      ),

    work.feedback &&
      h(
        "div",
        { className: "dw-feedback" },

        h("strong", null, "Last review feedback"),

        h(
          "p",
          { className: "dw-copy" },
          work.feedback,
        ),

        h(
          "small",
          null,
          `${name(work.reviewed_by)} · ${date(
            work.reviewed_at,
          )}`,
        ),
      ),

    isManager &&
      h(
        "div",
        { className: "dw-form" },

        h(
          "label",
          null,
          "Feedback",

          h("textarea", {
            rows: 4,
            maxLength: 2000,
            value: feedback,
            disabled: busy,

            onChange: event => {
              setFeedback(event.target.value);
              setError("");
            },

            placeholder:
              "Explain your decision or the changes needed.",
          }),
        ),

        h(
          "div",
          { className: "dw-actions" },

          h(
            Button,
            {
              primary: true,
              disabled: busy,
              onClick: () => review("approved"),
            },
            busy ? "Saving…" : "Approve",
          ),

          h(
            Button,
            {
              disabled: busy,

              onClick: () =>
                review("changes_requested"),
            },
            "Request changes",
          ),
        ),
      ),

    !isManager &&
      work.employee_id === userId &&
      h(
        Button,
        {
          onClick: () => {
            setPreviewOpen(false);
            onEdit(work);
          },
        },
        "Edit / resubmit",
      ),

    error &&
      h(
        "p",
        {
          className: "dw-error",
          role: "alert",
        },
        error,
      ),
  );

  return h(
    "article",
    { className: "dw-work-card" },

    h(
      Button,
      {
        primary: true,
        disabled: busy,
        onClick: () => setPreviewOpen(true),
      },

      isManager
        ? "Open & review work"
        : "Preview submitted work",
    ),

    !previewOpen && details,

    previewOpen &&
      h(
        SubmittedWorkPreview,
        {
          url: work.work_url,
          title: `Work by ${name(work.employee_id)}`,
          busy,

          onClose: () => {
            if (!lock.current) {
              setPreviewOpen(false);
            }
          },
        },

        details,
      ),
  );
}

function Questions({
  record,
  interactions,
  userId,
  name,
  onInteract,
}) {
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const lock = useRef(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;

    return () => {
      alive.current = false;
    };
  }, []);

  const messages = [
    ...new Map(
      interactions
        .filter(item =>
          item.record_id === record.id &&
          item.kind === "comment"
        )
        .map(item => [item.id, item]),
    ).values(),
  ].sort((a, b) =>
    new Date(a.created_at) -
      new Date(b.created_at) ||
    a.id.localeCompare(b.id)
  );

  async function send(event) {
    event.preventDefault();

    if (
      lock.current ||
      !question.trim()
    ) {
      return;
    }

    if (!navigator.onLine) {
      setError(
        "Connect to the internet to send your message.",
      );
      return;
    }

    lock.current = true;
    setBusy(true);
    setError("");

    try {
      if (typeof onInteract !== "function") {
        throw new Error(
          "Discussion is not connected. Contact your administrator.",
        );
      }

      const result = await onInteract(
        record.id,
        "comment",
        question.trim(),
      );

      if (!result) {
        throw new Error(
          "Sending was not confirmed. Check the discussion before trying again.",
        );
      }

      if (alive.current) {
        setQuestion("");
      }
    } catch (failure) {
      if (alive.current) {
        setError(
          failure.message ||
          "Could not send your message.",
        );
      }
    } finally {
      lock.current = false;

      if (alive.current) {
        setBusy(false);
      }
    }
  }

  return h(
    "section",
    { className: "dw-panel" },

    h("h3", null, "Questions & replies"),

    h(
      "p",
      { className: "dw-muted" },

      "Ask about these instructions here. Everyone who can view the instructions can read this discussion.",
    ),

    h(
      "div",
      { className: "dw-messages" },

      messages.map(item =>
        h(
          "article",
          {
            key: `message:${item.id}`,

            className:
              "dw-message" +
              (
                item.employee_id === userId
                  ? " dw-own-message"
                  : ""
              ),
          },

          h(
            "div",
            { className: "dw-row" },

            h(
              "strong",
              null,
              name(item.employee_id),
            ),

            h(
              "small",
              null,
              date(item.created_at),
            ),
          ),

          h(
            "p",
            { className: "dw-copy" },
            item.body,
          ),
        )
      ),
    ),

    !messages.length &&
      h(
        "p",
        { className: "dw-muted" },

        "No messages loaded for these instructions yet.",
      ),

    h(
      "form",
      {
        className: "dw-form",
        onSubmit: send,
      },

      h(
        "label",
        null,
        "Your question or reply",

        h("textarea", {
          required: true,
          maxLength: 2000,
          rows: 3,
          value: question,
          disabled: busy,

          onChange: event =>
            setQuestion(event.target.value),

          placeholder:
            "Ask a question or reply to the discussion…",
        }),
      ),

      error &&
        h(
          "p",
          {
            className: "dw-error",
            role: "alert",
          },
          error,
        ),

      h(
        Button,
        {
          type: "submit",
          primary: true,

          disabled:
            busy || !question.trim(),
        },

        busy ? "Sending…" : "Send message",
      ),
    ),
  );
}

export default function DesignWorkroom({
  records = [],
  interactions = [],
  employees = [],
  userId,
  isManager,
  onSave,
  onRefresh,
  onInteract,
}) {
  const [selectedId, setSelectedId] =
    useState("");

  const [editor, setEditor] = useState(null);
  const [editingWork, setEditingWork] =
    useState(null);

  const [formVersion, setFormVersion] =
    useState(0);

  const [view, setView] = useState({
    key: "",
    rows: [],
    more: false,
  });

  const [loading, setLoading] =
    useState(false);

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const alive = useRef(true);
  const requests = useRef(new Set());
  const generation = useRef(0);
  const loadingLock = useRef(false);
  const root = useRef(null);

  const entries = [
    ...new Map(
      records
        .filter(item =>
          item.module_id === MODULE &&
          item.metadata?.field_value === MARKER
        )
        .map(item => [item.id, item]),
    ).values(),
  ].sort((a, b) =>
    new Date(b.created_at) -
      new Date(a.created_at) ||
    a.id.localeCompare(b.id)
  );

  const selected = entries.find(
    item => item.id === selectedId,
  );

  const scope = `${userId}:${selectedId}`;
  const currentScope = useRef(scope);
  currentScope.current = scope;

  const current = () =>
    alive.current &&
    currentScope.current === scope;

  const works = view.key === scope
    ? view.rows
    : [];

  const byId = new Map(
    employees.map(person => [
      person.id,
      person,
    ]),
  );

  const name = id =>
    byId.get(id)?.display_name ||
    (
      id === userId
        ? "You"
        : "Employee unavailable"
    );

  async function run(query) {
    const aborter = new AbortController();
    requests.current.add(aborter);

    const timer = setTimeout(
      () => aborter.abort(),
      15000,
    );

    async function account() {
      const result = await untilAbort(
        supabase.auth.getSession(),
        aborter.signal,
      );

      if (result.error) {
        throw result.error;
      }

      if (
        !current() ||
        !userId ||
        result.data.session?.user.id !== userId
      ) {
        throw new Error(
          "Your account or instructions changed. Reopen this message.",
        );
      }

      return result.data.session.access_token;
    }

    try {
      const token = await account();

      const result = await untilAbort(
        query
          .setHeader(
            "Authorization",
            `Bearer ${token}`,
          )
          .abortSignal(aborter.signal),
        aborter.signal,
      );

      if (result.error) {
        if (result.error.code === "23505") {
          throw new Error(
            "This work may already have been submitted. Refresh the list before trying again.",
          );
        }

        if (result.error.code === "PGRST116") {
          throw new Error(
            "This work changed or is no longer available. Refresh and reopen it before editing or reviewing.",
          );
        }

        throw new Error(
          result.error.message ||
          "The request could not finish.",
        );
      }

      await account();

      return result.data;
    } finally {
      clearTimeout(timer);
      requests.current.delete(aborter);
    }
  }

  async function load(reset = true) {
    if (
      !selectedId ||
      !current() ||
      (
        !reset &&
        (
          loadingLock.current ||
          !view.more ||
          !works.length
        )
      )
    ) {
      return;
    }

    const request = ++generation.current;

    loadingLock.current = true;
    setLoading(true);
    setError("");

    try {
      let query = supabase
        .from("design_work_submissions")
        .select("*")
        .eq("record_id", selectedId)
        .order("sequence", {
          ascending: false,
        })
        .limit(26);

      if (!reset) {
        query = query.lt(
          "sequence",
          works.at(-1).sequence,
        );
      }

      const rows = await run(query);

      if (
        current() &&
        request === generation.current
      ) {
        setView(previous => ({
          key: scope,

          rows: [
            ...new Map([
              ...(
                !reset &&
                previous.key === scope
                  ? previous.rows
                  : []
              ),

              ...rows.slice(0, 25),
            ].map(item => [
              item.id,
              item,
            ])).values(),
          ],

          more: rows.length > 25,
        }));
      }
    } catch (failure) {
      if (
        current() &&
        request === generation.current
      ) {
        setError(failure.message);
      }
    } finally {
      if (request === generation.current) {
        loadingLock.current = false;

        if (current()) {
          setLoading(false);
        }
      }
    }
  }

  useEffect(() => {
    alive.current = true;
    setEditingWork(null);

    if (selectedId) {
      load(true);
    }

    return () => {
      alive.current = false;
      generation.current += 1;

      requests.current.forEach(item =>
        item.abort()
      );

      requests.current.clear();
    };
  }, [scope]);

  useEffect(() => {
    const observer = new MutationObserver(
      changes => {
        for (const change of changes) {
          if (
            change.target.dataset
              .activityTarget === "true" &&
            change.target.dataset.instructionId
          ) {
            setSelectedId(
              change.target.dataset.instructionId,
            );

            setEditor(null);
            setNotice("");
          }
        }
      },
    );

    if (root.current) {
      observer.observe(root.current, {
        subtree: true,
        attributes: true,

        attributeFilter: [
          "data-activity-target",
        ],
      });
    }

    return () => observer.disconnect();
  }, []);

  async function savedWork() {
    setEditingWork(null);
    setFormVersion(value => value + 1);
    setNotice("Work submitted for review.");

    await load(true);
  }

  async function savedReview() {
    setNotice("Review saved.");
    await load(true);
  }

  async function refresh() {
    try {
      if (onRefresh) {
        await onRefresh();
      }

      if (current()) {
        await load(true);
      }
    } catch (failure) {
      if (current()) {
        setError(
          failure.message ||
          "Could not refresh.",
        );
      }
    }
  }

  return h(
    "section",
    {
      className: "dw-workroom",
      ref: root,
    },

    ...entries.map(item =>
      h("span", {
        hidden: true,
        key: `target:${item.id}`,
        id: `workplace-${item.id}`,
        "data-instruction-id": item.id,
      })
    ),

    h(
      "header",
      { className: "dw-header" },

      h(
        "div",
        null,

        h(
          "p",
          { className: "dw-eyebrow" },
          "DESIGN SYSTEMS & COMPONENTS",
        ),

        h(
          "h1",
          null,
          "Design instructions & work",
        ),

        h(
          "p",
          null,
          "Read the instructions, ask questions and share your work for review.",
        ),
      ),

      isManager &&
        h(
          Button,
          {
            primary: true,
            disabled: Boolean(editor),

            onClick: () =>
              setEditor({ record: null }),
          },
          "Write instructions",
        ),
    ),

    notice &&
      h(
        "p",
        {
          className: "dw-success",
          role: "status",
        },
        notice,
      ),

    editor
      ? h(InstructionEditor, {
          key:
            `editor:${userId}:` +
            `${editor.record?.id || "new"}`,

          record: editor.record,
          onSave,

          onClose: () => setEditor(null),

          onSaved: id => {
            setEditor(null);
            setSelectedId(id || "");
            setNotice("Instructions posted.");
          },
        })

      : !selected
        ? h(
            "div",
            { className: "dw-instructions" },

            entries.map(item =>
              h(
                "button",
                {
                  type: "button",
                  className:
                    "dw-instruction-card",

                  key:
                    `instruction:${item.id}`,

                  onClick: () => {
                    setSelectedId(item.id);
                    setNotice("");
                  },
                },

                h(
                  "strong",
                  null,
                  item.title,
                ),

                h(
                  "span",
                  null,
                  short(item.description),
                ),

                h(
                  "small",
                  null,

                  `${name(item.created_by)} · ` +
                  date(item.created_at),
                ),

                h(
                  "b",
                  null,
                  "Open instructions →",
                ),
              )
            ),

            !entries.length &&
              h(
                "div",
                { className: "dw-panel" },

                h(
                  "h2",
                  null,
                  "No instructions yet",
                ),

                h(
                  "p",
                  { className: "dw-muted" },

                  isManager
                    ? "Post guidance explaining which tools employees should use and what work they should submit."
                    : "Your manager’s design guidance will appear here.",
                ),
              ),
          )

        : h(
            "div",
            null,

            h(
              "div",
              {
                className:
                  "dw-row dw-page-actions",
              },

              h(
                Button,
                {
                  onClick: () =>
                    setSelectedId(""),
                },
                "← All instructions",
              ),

              h(
                Button,
                {
                  disabled: loading,
                  onClick: refresh,
                },
                "Refresh",
              ),
            ),

            h(
              "article",
              {
                className:
                  "dw-panel dw-instruction",
              },

              h(
                "div",
                { className: "dw-row" },

                h(
                  "h2",
                  null,
                  selected.title,
                ),

                isManager &&
                  h(
                    Button,
                    {
                      onClick: () =>
                        setEditor({
                          record: selected,
                        }),
                    },
                    "Edit instructions",
                  ),
              ),

              h(
                "p",
                { className: "dw-muted" },

                `${name(selected.created_by)} · ` +
                date(selected.created_at),
              ),

              h(
                "p",
                { className: "dw-copy" },
                selected.description,
              ),

              workLink(
                selected.metadata?.resource_url,
              ) &&
                h(
                  "a",
                  {
                    className: "dw-tool-link",

                    href: workLink(
                      selected.metadata.resource_url,
                    ),

                    target: "_blank",
                    rel: "noopener noreferrer",
                  },
                  "Open recommended tool / reference ↗",
                ),
            ),

            h(Questions, {
              key: `questions:${scope}`,
              record: selected,
              interactions,
              userId,
              name,
              onInteract,
            }),

            !isManager &&
              h(WorkForm, {
                key:
                  `work-form:${scope}:` +
                  `${editingWork?.id || "new"}:` +
                  (
                    editingWork?.updated_at ||
                    formVersion
                  ),

                record: selected,
                work: editingWork,
                userId,
                run,
                onSaved: savedWork,

                onCancel: () =>
                  setEditingWork(null),
              }),

            h(
              "section",
              { className: "dw-panel" },

              h(
                "h3",
                null,

                isManager
                  ? "Employee work to review"
                  : "Your submitted work",
              ),

              h(
                "p",
                { className: "dw-muted" },

                isManager
                  ? "Open each link, then approve the work or explain the changes needed."
                  : "Your work links and review feedback are visible to you and managers/admins.",
              ),

              loading &&
                h(
                  "p",
                  {
                    className: "dw-muted",
                    role: "status",
                  },
                  "Loading work…",
                ),

              error &&
                h(
                  "p",
                  {
                    className: "dw-error",
                    role: "alert",
                  },
                  error,
                ),

              h(
                "div",
                { className: "dw-work-list" },

                works.map(work =>
                  h(WorkCard, {
                    key:
                      `work:${work.id}:` +
                      work.updated_at,

                    work,
                    isManager,
                    userId,
                    name,
                    run,
                    onSaved: savedReview,

                    onEdit: item => {
                      setEditingWork(item);
                      setNotice("");
                    },
                  })
                ),
              ),

              !loading &&
                !error &&
                !works.length &&
                h(
                  "p",
                  { className: "dw-muted" },

                  "No work submitted under these instructions yet.",
                ),

              view.key === scope &&
                view.more &&
                h(
                  Button,
                  {
                    disabled: loading,

                    onClick: () =>
                      load(false),
                  },
                  "Load more work",
                ),
            ),
          ),
  );
}