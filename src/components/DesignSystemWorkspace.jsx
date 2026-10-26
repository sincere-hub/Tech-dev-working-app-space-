import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Boxes,
  Copy,
  ExternalLink,
  Layers3,
  Link2,
  LoaderCircle,
  Moon,
  Palette,
  Pencil,
  Plus,
  Search,
  Sun,
  X,
} from "lucide-react";

import "./design-system-workspace.css";

const MODULE = "collaboration.design-system";

const categories = {
  buttons: "Button",
  forms: "Text field",
  badges: "Status badge",
  cards: "Content card",
  avatars: "Avatar",
  dialogs: "Dialog",
  colors: "Colour tokens",
  typography: "Typography",
  spacing: "Spacing",
};

const foundations = new Set([
  "colors",
  "typography",
  "spacing",
]);

const phases = {
  in_progress: "Draft",
  pending_approval: "In review",
  published: "Published",
  archived: "Deprecated",
};

const text = value =>
  typeof value === "string" ? value : "";

const hex = /^#[a-f0-9]{6}$/i;

export function safeLink(value) {
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

export function designData(record) {
  const data = record?.metadata?.design_system || {};

  return {
    ...data,

    kind: Object.hasOwn(categories, data.kind)
      ? data.kind
      : "cards",

    version: text(data.version) || "1.0.0",

    accessibility: text(data.accessibility),

    maintainer_id:
      text(data.maintainer_id) ||
      record?.created_by ||
      "",

    tokens: Array.isArray(data.tokens)
      ? data.tokens.filter(token =>
          /^[a-z][a-z0-9.-]{0,79}$/.test(
            token?.name || "",
          ) &&
          hex.test(token?.value || "")
        )
      : [],
  };
}

export function parseTokens(value) {
  const lines = value
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  if (!lines.length || lines.length > 24) {
    throw new Error(
      "Add between 1 and 24 colour tokens.",
    );
  }

  const names = new Set();

  return lines.map(line => {
    const match =
      /^([a-z][a-z0-9.-]{0,79})\s*:\s*(#[a-f0-9]{6})$/i.exec(
        line,
      );

    if (!match) {
      throw new Error(
        "Write each token as color.text.primary: #F3F7FF.",
      );
    }

    const name = match[1].toLowerCase();
    const cssName = name.replaceAll(".", "-");

    if (names.has(cssName)) {
      throw new Error(
        `The token ${name} produces a repeated CSS name.`,
      );
    }

    names.add(cssName);

    return {
      name,
      value: match[2].toUpperCase(),
    };
  });
}

function tokenCSS(tokens) {
  return `:root {
${tokens.map(token =>
  `  --${token.name.replaceAll(".", "-")}: ${token.value};`
).join("\n")}
}`;
}

function excerpt(value) {
  const chars = Array.from(
    text(value).replace(/\s+/g, " ").trim(),
  );

  return chars.length > 140
    ? `${chars.slice(0, 140).join("")}…`
    : chars.join("");
}

function formatDate(value) {
  const parsed = new Date(value);

  return value && !Number.isNaN(parsed.getTime())
    ? parsed.toLocaleDateString("en-ZA", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "Africa/Johannesburg",
      })
    : "Date unavailable";
}

/*
 * These exports are the actual components used
 * by the interactive playground.
 */

export function DesignButton({
  children = "Continue",
  variant = "primary",
  size = "regular",
  loading = false,
  disabled = false,
  onClick,
}) {
  const appearance =
    variant === "secondary"
      ? "secondary"
      : "primary";

  const sizing =
    size === "small" ? "small" : "regular";

  return (
    <button
      type="button"
      className={
        `tdkit-button tdkit-${appearance} ` +
        `tdkit-${sizing}`
      }
      disabled={disabled || loading}
      aria-busy={loading}
      onClick={onClick}
    >
      {loading && (
        <LoaderCircle
          size={16}
          className="tdkit-spin"
          aria-hidden="true"
        />
      )}

      {children}
    </button>
  );
}

export function DesignField({
  label = "Work email",
  hint = "Use your company email.",
  error = "",
  disabled = false,
}) {
  const id = useId();

  return (
    <div className="tdkit-field">
      <label htmlFor={id}>{label}</label>

      <input
        id={id}
        disabled={disabled}
        aria-invalid={Boolean(error)}
        aria-describedby={`${id}-hint`}
      />

      <p
        id={`${id}-hint`}
        className={error ? "tdkit-error" : ""}
      >
        {error || hint}
      </p>
    </div>
  );
}

export function DesignBadge({
  tone = "info",
  children = "In progress",
}) {
  const appearance =
    ["success", "warning"].includes(tone)
      ? tone
      : "info";

  return (
    <span
      className={`tdkit-badge tdkit-${appearance}`}
    >
      {children}
    </span>
  );
}

export function DesignCard({
  title = "Project brief",
  children =
    "Keep the context and next action together.",
  onClick,
}) {
  return (
    <article className="tdkit-card">
      <h3>{title}</h3>
      <p>{children}</p>

      <DesignButton
        variant="secondary"
        onClick={onClick}
      >
        View brief
      </DesignButton>
    </article>
  );
}

export function DesignAvatar({
  name = "Alex Morgan",
}) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(part => Array.from(part)[0])
    .join("")
    .toUpperCase();

  return (
    <span
      className="tdkit-avatar"
      role="img"
      aria-label={name}
    >
      {initials}
    </span>
  );
}

export function DesignDialog() {
  const dialog = useRef(null);
  const trigger = useRef(null);
  const id = useId();

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="tdkit-button tdkit-primary"
        onClick={() => dialog.current?.showModal()}
      >
        Open example dialog
      </button>

      <dialog
        ref={dialog}
        className="tdkit-dialog"
        aria-labelledby={id}
        onClose={() => trigger.current?.focus()}
      >
        <h3 id={id}>Review changes</h3>

        <p>
          This example does not change any
          workplace data.
        </p>

        <button
          type="button"
          className="tdkit-button tdkit-secondary"
          onClick={() => dialog.current?.close()}
        >
          Close dialog
        </button>
      </dialog>
    </>
  );
}

function Playground({ kind, tokens }) {
  const [light, setLight] = useState(false);
  const [size, setSize] = useState("regular");
  const [variant, setVariant] = useState("primary");
  const [state, setState] = useState("default");
  const [notice, setNotice] = useState("");

  const names = {
    buttons: "DesignButton",
    forms: "DesignField",
    badges: "DesignBadge",
    cards: "DesignCard",
    avatars: "DesignAvatar",
    dialogs: "DesignDialog",
  };

  const snippets = {
    buttons:
      `<DesignButton variant="${variant}" size="${size}"` +
      `${state === "loading" ? " loading" : ""}` +
      `${state === "disabled" ? " disabled" : ""}` +
      `>Continue</DesignButton>`,

    forms:
      `<DesignField label="Work email"` +
      `${state === "error"
        ? ' error="Enter a valid work email."'
        : ""}` +
      `${state === "disabled" ? " disabled" : ""}` +
      ` />`,

    badges:
      '<DesignBadge tone="info">In progress</DesignBadge>',

    cards:
      '<DesignCard title="Project brief">' +
      "Keep the context and next action together." +
      "</DesignCard>",

    avatars:
      '<DesignAvatar name="Alex Morgan" />',

    dialogs: "<DesignDialog />",
  };

  const code = names[kind]
    ? (
        `import { ${names[kind]} } from ` +
        `"./components/DesignSystemWorkspace.jsx";\n\n` +
        snippets[kind]
      )
    : kind === "colors"
      ? tokenCSS(tokens)
      : kind === "spacing"
        ? `:root {
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-6: 24px;
  --space-8: 32px;
}`
        : `/* Example type scale */
.heading {
  font-size: 1.75rem;
  line-height: 1.25;
}

.body {
  font-size: 1rem;
  line-height: 1.6;
}

.caption {
  font-size: 0.875rem;
  line-height: 1.5;
}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setNotice("Example copied.");
    } catch {
      setNotice(
        "Copy unavailable. Select and copy the code below.",
      );
    }
  }

  return (
    <div className="tds-playground">
      <div className="tds-toolbar">
        <span>Built-in React example</span>

        <button
          type="button"
          className="tds-button"
          aria-pressed={light}
          onClick={() => setLight(value => !value)}
        >
          {light
            ? <Moon size={16} />
            : <Sun size={16} />}

          {light ? "Dark canvas" : "Light canvas"}
        </button>
      </div>

      <div
        className={
          `tds-canvas${light ? " tds-canvas-light" : ""}`
        }
      >
        {kind === "buttons" && (
          <DesignButton
            size={size}
            variant={variant}
            disabled={state === "disabled"}
            loading={state === "loading"}
            onClick={() => setNotice(
              "Example action activated. No workplace data changed.",
            )}
          />
        )}

        {kind === "forms" && (
          <DesignField
            disabled={state === "disabled"}
            error={
              state === "error"
                ? "Enter a valid work email."
                : ""
            }
          />
        )}

        {kind === "badges" && (
          <div className="tds-wrap">
            <DesignBadge>In progress</DesignBadge>

            <DesignBadge tone="success">
              Complete
            </DesignBadge>

            <DesignBadge tone="warning">
              Needs attention
            </DesignBadge>
          </div>
        )}

        {kind === "cards" && (
          <DesignCard
            onClick={() => setNotice(
              "Example brief opened. No workplace data changed.",
            )}
          />
        )}

        {kind === "avatars" && <DesignAvatar />}

        {kind === "dialogs" && <DesignDialog />}

        {kind === "colors" && (
          <div className="tds-swatches">
            {tokens.map(token => (
              <div key={`swatch:${token.name}`}>
                <i
                  style={{
                    backgroundColor: token.value,
                  }}
                />

                <strong>{token.name}</strong>
                <code>{token.value}</code>
              </div>
            ))}

            {!tokens.length && (
              <p>
                No colour tokens recorded. Edit this
                foundation to add them.
              </p>
            )}
          </div>
        )}

        {kind === "typography" && (
          <div className="tds-types">
            <h2>A clear heading</h2>

            <p>
              Readable text helps people finish
              their work.
            </p>

            <small>
              A supporting detail with useful context.
            </small>
          </div>
        )}

        {kind === "spacing" && (
          <div className="tds-space">
            {[4, 8, 12, 16, 24, 32].map(value => (
              <div key={`space:${value}`}>
                <code>{value}px</code>
                <i style={{ width: value * 5 }} />
              </div>
            ))}
          </div>
        )}
      </div>

      {["buttons", "forms"].includes(kind) && (
        <div className="tds-controls">
          {kind === "buttons" && (
            <>
              <label>
                Appearance

                <select
                  value={variant}
                  onChange={event =>
                    setVariant(event.target.value)
                  }
                >
                  <option value="primary">
                    Primary
                  </option>

                  <option value="secondary">
                    Secondary
                  </option>
                </select>
              </label>

              <label>
                Size

                <select
                  value={size}
                  onChange={event =>
                    setSize(event.target.value)
                  }
                >
                  <option value="regular">
                    Regular
                  </option>

                  <option value="small">
                    Compact
                  </option>
                </select>
              </label>
            </>
          )}

          <label>
            State

            <select
              value={state}
              onChange={event =>
                setState(event.target.value)
              }
            >
              <option value="default">Default</option>
              <option value="disabled">Disabled</option>

              {kind === "buttons"
                ? (
                    <option value="loading">
                      Loading
                    </option>
                  )
                : (
                    <option value="error">
                      Error
                    </option>
                  )}
            </select>
          </label>
        </div>
      )}

      <p className="tds-muted">
        Hover and use Tab to inspect interaction and
        keyboard focus. Typography and spacing previews
        use the example scale shown below; document your
        company rules in Usage.
      </p>

      <div className="tds-toolbar">
        <h3>
          {kind === "colors"
            ? "CSS tokens"
            : "Example code"}
        </h3>

        <button
          type="button"
          className="tds-button"
          onClick={copy}
        >
          <Copy size={15} />
          Copy example
        </button>
      </div>

      <pre tabIndex={0} aria-label="Example code">
        <code>{code}</code>
      </pre>

      <p className="tds-feedback" role="status">
        {notice}
      </p>
    </div>
  );
}

function ReferenceEditor({
  record,
  userId,
  employees,
  onSave,
  onClose,
  onSaved,
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const lock = useRef(false);
  const alive = useRef(true);

  const data = designData(record);

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

    const value = name =>
      String(form.get(name) || "").trim();

    setError("");

    try {
      if (!navigator.onLine) {
        throw new Error(
          "Connect to the internet to save. Your draft is still here.",
        );
      }

      if (typeof onSave !== "function") {
        throw new Error(
          "The design save handler is missing. Check the WorkplaceSuite connection.",
        );
      }

      if (
        !value("title") ||
        !value("description")
      ) {
        throw new Error(
          "Add a name and usage guidance.",
        );
      }

      if (
        !/^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/i.test(
          value("version"),
        )
      ) {
        throw new Error(
          "Use a version such as 1.0.0 or 1.0.0-beta.1.",
        );
      }

      const links = [
        "figma_url",
        "source_url",
        "resource_url",
      ];

      if (
        links.some(name =>
          value(name) && !safeLink(value(name))
        )
      ) {
        throw new Error(
          "Resource links must use HTTPS and contain no embedded username or password.",
        );
      }

      const tokens = value("kind") === "colors"
        ? parseTokens(value("tokens"))
        : data.tokens;

      const payload = {
        title: value("title"),
        description: value("description"),
        status: value("status"),
        visibility: value("visibility"),

        metadata: {
          ...record?.metadata,

          resource_url: value("resource_url"),

          design_system: {
            ...data,
            kind: value("kind"),
            version: value("version"),
            maintainer_id: value("maintainer_id"),
            accessibility: value("accessibility"),
            figma_url: value("figma_url"),
            source_url: value("source_url"),
            tokens,
          },
        },
      };

      lock.current = true;
      setBusy(true);

      const result = await onSave(record, payload);

      if (!result) {
        throw new Error(
          "Saving was not confirmed. Check the workspace error and retry.",
        );
      }

      if (alive.current) {
        onSaved(result.id || record?.id);
      }
    } catch (failure) {
      if (alive.current) {
        setError(
          failure.message ||
          "Could not save this reference.",
        );
      }
    } finally {
      lock.current = false;

      if (alive.current) {
        setBusy(false);
      }
    }
  }

  const personOptions = [
    ...new Map(
      employees.map(person => [person.id, person]),
    ).values(),
  ];

  const owner = data.maintainer_id || userId;

  if (
    owner &&
    !personOptions.some(person => person.id === owner)
  ) {
    personOptions.push({
      id: owner,
      display_name: "Current maintainer",
    });
  }

  return (
    <form className="tds-editor" onSubmit={submit}>
      <header className="tds-toolbar">
        <div>
          <p className="tds-eyebrow">
            LIBRARY MANAGEMENT
          </p>

          <h2>
            {record
              ? "Edit reference"
              : "New reference"}
          </h2>
        </div>

        <button
          type="button"
          className="tds-button"
          disabled={busy}
          onClick={() => {
            if (
              window.confirm(
                "Discard unsaved reference changes?",
              )
            ) {
              onClose();
            }
          }}
        >
          <X size={16} />
          Close
        </button>
      </header>

      <fieldset disabled={busy}>
        <label className="tds-wide">
          Name

          <input
            name="title"
            required
            maxLength={180}
            defaultValue={record?.title || ""}
            autoFocus
          />
        </label>

        <label>
          Category

          <select
            name="kind"
            defaultValue={data.kind}
          >
            {Object.entries(categories).map(
              ([id, label]) => (
                <option
                  key={`kind:${id}`}
                  value={id}
                >
                  {label}
                </option>
              ),
            )}
          </select>
        </label>

        <label>
          Version

          <input
            name="version"
            required
            maxLength={30}
            defaultValue={data.version}
          />
        </label>

        <label>
          Status

          <select
            name="status"
            defaultValue={
              Object.hasOwn(phases, record?.status)
                ? record.status
                : "in_progress"
            }
          >
            {Object.entries(phases).map(
              ([id, label]) => (
                <option
                  key={`phase:${id}`}
                  value={id}
                >
                  {label}
                </option>
              ),
            )}
          </select>
        </label>

        <label>
          Maintainer

          <select
            name="maintainer_id"
            defaultValue={owner}
          >
            {personOptions.map(person => (
              <option
                key={`person:${person.id}`}
                value={person.id}
              >
                {person.display_name || "Employee"}
              </option>
            ))}
          </select>
        </label>

        <label>
          Visibility

          <select
            name="visibility"
            defaultValue={
              record?.visibility || "company"
            }
          >
            <option value="company">
              Company employees
            </option>

            <option value="private">
              Creator and managers
            </option>
          </select>
        </label>

        <label>
          Documentation link

          <input
            name="resource_url"
            type="url"
            maxLength={2000}
            defaultValue={
              record?.metadata?.resource_url || ""
            }
            placeholder="https://"
          />
        </label>

        <label>
          Figma link

          <input
            name="figma_url"
            type="url"
            maxLength={2000}
            defaultValue={text(data.figma_url)}
            placeholder="https://"
          />
        </label>

        <label>
          Source code link

          <input
            name="source_url"
            type="url"
            maxLength={2000}
            defaultValue={text(data.source_url)}
            placeholder="https://"
          />
        </label>

        <label className="tds-wide">
          Usage guidance

          <textarea
            name="description"
            required
            rows={5}
            maxLength={5000}
            defaultValue={record?.description || ""}
            placeholder="Describe its purpose, when to use it, variants and situations to avoid."
          />
        </label>

        <label className="tds-wide">
          Accessibility notes and test evidence

          <textarea
            name="accessibility"
            rows={3}
            maxLength={3000}
            defaultValue={data.accessibility}
            placeholder="Record keyboard and screen-reader behaviour, test date, version and any known issues."
          />
        </label>

        <label className="tds-wide">
          Colour tokens · required for the
          Colour tokens category

          <textarea
            name="tokens"
            rows={3}
            maxLength={4000}
            defaultValue={
              data.tokens.map(token =>
                `${token.name}: ${token.value}`
              ).join("\n")
            }
            placeholder={
              "color.text.primary: #F3F7FF\n" +
              "color.surface.panel: #122138"
            }
          />
        </label>
      </fieldset>

      <p className="tds-muted">
        Status and test notes are maintained by your
        team. Assigning a maintainer does not change
        editing permissions.
      </p>

      {error && (
        <p className="tds-error" role="alert">
          {error}
        </p>
      )}

      <button
        type="submit"
        className="tds-button tds-primary"
        disabled={busy}
      >
        {busy
          ? (
              <LoaderCircle
                className="tdkit-spin"
                size={16}
              />
            )
          : <Plus size={16} />}

        {busy ? "Saving…" : "Save reference"}
      </button>
    </form>
  );
}

export default function DesignSystemWorkspace({
  records = [],
  employees = [],
  userId,
  isManager,
  onSave,
}) {
  const [area, setArea] = useState("overview");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [selectedId, setSelectedId] = useState("");
  const [tab, setTab] = useState("preview");
  const [editor, setEditor] = useState(null);
  const [notice, setNotice] = useState("");

  const root = useRef(null);
  const reader = useRef(null);

  const entries = useMemo(
    () => [
      ...new Map(
        records
          .filter(record =>
            record.module_id === MODULE
          )
          .map(record => [record.id, record]),
      ).values(),
    ],
    [records],
  );

  const byId = new Map(
    employees.map(person => [person.id, person]),
  );

  const selected = entries.find(
    record => record.id === selectedId,
  );

  const data = designData(selected);

  const ownerName = id =>
    byId.get(id)?.display_name ||
    (id === userId ? "You" : "Employee unavailable");

  const resources = entries.flatMap(record =>
    [
      ["Figma", designData(record).figma_url],
      ["Source code", designData(record).source_url],
      ["Documentation", record.metadata?.resource_url],
    ]
      .filter(([, url]) => safeLink(url))
      .map(([label, url]) => ({
        record,
        label,
        url: safeLink(url),
      })),
  );

  const search = query.trim().toLowerCase();

  const matches = entries
    .filter(record => {
      const info = designData(record);

      return (
        (
          area !== "foundations" ||
          foundations.has(info.kind)
        ) &&
        (
          area !== "components" ||
          !foundations.has(info.kind)
        ) &&
        (
          status === "all" ||
          record.status === status
        ) &&
        [
          record.title,
          record.description,
          categories[info.kind],
          ownerName(info.maintainer_id),
        ]
          .join(" ")
          .toLowerCase()
          .includes(search)
      );
    })
    .sort((a, b) =>
      a.title.localeCompare(b.title) ||
      a.id.localeCompare(b.id)
    );

  function open(record) {
    setSelectedId(record.id);
    setTab("preview");
    setEditor(null);
  }

  function navigate(next) {
    setArea(next);
    setSelectedId("");
    setQuery("");
    setStatus("all");
    setEditor(null);
    setNotice("");
  }

  useEffect(() => {
    if (selectedId) {
      reader.current?.focus({
        preventScroll: true,
      });
    }
  }, [selectedId]);

  useEffect(() => {
    const observer = new MutationObserver(changes => {
      for (const change of changes) {
        if (
          change.target.dataset.activityTarget ===
            "true" &&
          change.target.dataset.designId
        ) {
          setSelectedId(
            change.target.dataset.designId,
          );

          setEditor(null);
          setTab("preview");
        }
      }
    });

    if (root.current) {
      observer.observe(root.current, {
        subtree: true,
        attributes: true,
        attributeFilter: ["data-activity-target"],
      });
    }

    return () => observer.disconnect();
  }, []);

  const nav = [
    ["overview", "Overview", Layers3],
    ["components", "Components", Boxes],
    ["foundations", "Foundations", Palette],
    ["resources", "Resources", Link2],
  ];

  const phase = record =>
    phases[record.status] || "Draft";

  function cards(items) {
    return (
      <div className="tds-grid">
        {items.map(record => {
          const info = designData(record);

          return (
            <button
              type="button"
              className="tds-reference"
              key={`reference:${record.id}`}
              onClick={() => open(record)}
            >
              <span
                className={
                  `tds-mini tds-mini-${info.kind}`
                }
                aria-hidden="true"
              >
                {info.kind === "buttons"
                  ? <span>Continue →</span>
                  : info.kind === "colors"
                    ? <><i /><i /><i /></>
                    : info.kind === "avatars"
                      ? <b>AM</b>
                      : <BookOpen size={28} />}
              </span>

              <span className="tds-toolbar">
                <small>{categories[info.kind]}</small>

                <span
                  className={
                    `tds-status ` +
                    `tds-status-${record.status}`
                  }
                >
                  {phase(record)}
                </span>
              </span>

              <strong>{record.title}</strong>

              <span className="tds-excerpt">
                {excerpt(record.description)}
              </span>

              <span className="tds-card-footer">
                <span>
                  v{info.version}
                  {" · "}
                  {ownerName(info.maintainer_id)}
                </span>

                <ArrowRight size={16} />
              </span>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <section
      className="tds-hub"
      ref={root}
      aria-label="Design system and components"
    >
      {entries.map(record => (
        <span
          hidden
          key={`activity:${record.id}`}
          id={`workplace-${record.id}`}
          data-design-id={record.id}
        />
      ))}

      <header className="tds-hero">
        <div className="tds-brand">
          <span className="tds-emblem">
            <Layers3 size={25} />
          </span>

          <div>
            <p className="tds-eyebrow">
              TECH DEV · DESIGN LIBRARY
            </p>

            <h1>Design system & components</h1>

            <p>
              Find a shared standard. Explore its
              behaviour. Build with confidence.
            </p>
          </div>
        </div>

        {isManager && (
          <button
            type="button"
            className="tds-button tds-primary"
            disabled={Boolean(editor)}
            onClick={() => {
              setEditor({ record: null });
              setNotice("");
            }}
          >
            <Plus size={17} />
            New reference
          </button>
        )}
      </header>

      <div className="tds-layout">
        <aside className="tds-sidebar">
          <p className="tds-eyebrow">LIBRARY</p>

          <nav aria-label="Design library">
            {nav.map(([id, label, Icon]) => (
              <button
                key={`nav:${id}`}
                type="button"
                disabled={Boolean(editor)}
                aria-current={
                  area === id ? "page" : undefined
                }
                onClick={() => navigate(id)}
              >
                <Icon size={18} />
                {label}
              </button>
            ))}
          </nav>

          <div className="tds-sidebar-note">
            <BookOpen size={19} />

            <strong>One place to start</strong>

            <p>
              Use shared references across company
              projects. Check the source and recorded
              test evidence before adopting a component.
            </p>
          </div>
        </aside>

        <div className="tds-main">
          {notice && (
            <p className="tds-feedback" role="status">
              {notice}
            </p>
          )}

          {editor ? (
            <ReferenceEditor
              key={
                `editor:${userId}:` +
                `${editor.record?.id || "new"}`
              }
              record={editor.record}
              userId={userId}
              employees={employees}
              onSave={onSave}
              onClose={() => setEditor(null)}
              onSaved={id => {
                setEditor(null);
                setSelectedId(id || "");
                setNotice("Reference saved.");
              }}
            />
          ) : selected ? (
            <article
              className="tds-reader"
              tabIndex={-1}
              ref={reader}
            >
              <button
                type="button"
                className="tds-button"
                onClick={() => setSelectedId("")}
              >
                <ArrowLeft size={16} />
                Back to library
              </button>

              <header className="tds-detail-header">
                <div>
                  <span
                    className={
                      `tds-status ` +
                      `tds-status-${selected.status}`
                    }
                  >
                    {phase(selected)}
                  </span>

                  <h2>{selected.title}</h2>

                  <p>
                    {categories[data.kind]}
                    {" · "}v{data.version}
                    {" · "}
                    {selected.visibility === "private"
                      ? "Private reference"
                      : "Company reference"}
                  </p>
                </div>

                {isManager && (
                  <button
                    type="button"
                    className="tds-button"
                    onClick={() =>
                      setEditor({ record: selected })
                    }
                  >
                    <Pencil size={15} />
                    Edit reference
                  </button>
                )}
              </header>

              {selected.status === "archived" && (
                <p className="tds-warning">
                  Deprecated reference. Check its usage
                  guidance for a replacement before
                  starting new work.
                </p>
              )}

              <div className="tds-metadata">
                <span>
                  Maintainer

                  <strong>
                    {ownerName(data.maintainer_id)}
                  </strong>
                </span>

                <span>
                  Last updated

                  <strong>
                    {formatDate(
                      selected.updated_at ||
                      selected.created_at,
                    )}
                  </strong>
                </span>

                <span>
                  Implementation
                  <strong>React examples</strong>
                </span>
              </div>

              <div
                className="tds-tabs"
                role="group"
                aria-label="Reference sections"
              >
                {[
                  ["preview", "Preview & code"],
                  ["usage", "Usage"],
                  ["accessibility", "Accessibility"],
                  ["links", "Design & source"],
                ].map(([id, label]) => (
                  <button
                    key={`detail:${id}`}
                    type="button"
                    aria-pressed={tab === id}
                    onClick={() => setTab(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {tab === "preview" && (
                <Playground
                  key={
                    `playground:${selected.id}:` +
                    data.kind
                  }
                  kind={data.kind}
                  tokens={data.tokens}
                />
              )}

              {tab === "usage" && (
                <section className="tds-prose">
                  <h3>Usage guidance</h3>

                  <p>
                    {selected.description ||
                      "No usage guidance recorded."}
                  </p>
                </section>
              )}

              {tab === "accessibility" && (
                <section className="tds-prose">
                  <h3>Recorded notes and evidence</h3>

                  <p>
                    {data.accessibility ||
                      "No accessibility test results have been recorded for this reference."}
                  </p>

                  <h3>What to verify</h3>

                  <ul>
                    <li>
                      Keyboard operation and a visible
                      focus indicator.
                    </li>

                    <li>
                      Useful labels, error messages and
                      screen-reader announcements.
                    </li>

                    <li>
                      Readable contrast and behaviour
                      at browser zoom.
                    </li>

                    <li>
                      Phone layout, touch targets and
                      reduced-motion preferences.
                    </li>
                  </ul>

                  <p className="tds-muted">
                    Publishing a reference does not
                    automatically certify accessibility.
                    Record the tested version, date,
                    method and known issues.
                  </p>
                </section>
              )}

              {tab === "links" && (
                <section className="tds-prose">
                  <h3>Connected resources</h3>

                  <div className="tds-resource-list">
                    {resources
                      .filter(item =>
                        item.record.id === selected.id
                      )
                      .map(item => (
                        <a
                          key={
                            `detail-link:${item.label}`
                          }
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {item.label}
                          <ExternalLink size={16} />
                        </a>
                      ))}
                  </div>

                  {!resources.some(item =>
                    item.record.id === selected.id
                  ) && (
                    <p>
                      No design or source links recorded.
                      A manager can add them through
                      Edit reference.
                    </p>
                  )}
                </section>
              )}
            </article>
          ) : (
            <>
              <header className="tds-page-header">
                <p className="tds-eyebrow">
                  {area === "overview"
                    ? "START HERE"
                    : "BROWSE THE LIBRARY"}
                </p>

                <h2>
                  {nav.find(item =>
                    item[0] === area
                  )?.[1]}
                </h2>

                <p>
                  {area === "components"
                    ? "Reusable interface controls, with behaviour and usage guidance."
                    : area === "foundations"
                      ? "Shared colour, type and spacing decisions."
                      : area === "resources"
                        ? "Figma files, source code and documentation linked to your references."
                        : "Explore the references maintained by your company."}
                </p>
              </header>

              {area === "overview" ? (
                <>
                  <div className="tds-metrics">
                    <div>
                      <strong>{entries.length}</strong>
                      <span>Loaded references</span>
                    </div>

                    <div>
                      <strong>
                        {entries.filter(item =>
                          item.status === "published"
                        ).length}
                      </strong>

                      <span>Published</span>
                    </div>

                    <div>
                      <strong>
                        {entries.filter(item =>
                          item.status ===
                            "pending_approval"
                        ).length}
                      </strong>

                      <span>Marked for review</span>
                    </div>
                  </div>

                  <div className="tds-toolbar">
                    <h3>Recently updated</h3>

                    <button
                      type="button"
                      className="tds-button"
                      onClick={() =>
                        navigate("components")
                      }
                    >
                      Browse components
                      <ArrowRight size={15} />
                    </button>
                  </div>

                  {cards(
                    [...entries]
                      .sort((a, b) =>
                        (
                          new Date(
                            b.updated_at ||
                            b.created_at,
                          ).getTime() || 0
                        ) -
                        (
                          new Date(
                            a.updated_at ||
                            a.created_at,
                          ).getTime() || 0
                        )
                      )
                      .slice(0, 6),
                  )}
                </>
              ) : area === "resources" ? (
                <div className="tds-resource-list">
                  {resources.map(item => (
                    <a
                      key={
                        `resource:${item.record.id}:` +
                        item.label
                      }
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <span>
                        <strong>
                          {item.record.title}
                        </strong>

                        <small>{item.label}</small>
                      </span>

                      <ExternalLink size={17} />
                    </a>
                  ))}

                  {!resources.length && (
                    <p>
                      No resource links recorded yet.
                    </p>
                  )}
                </div>
              ) : (
                <>
                  <div className="tds-filters">
                    <label className="tds-search">
                      <Search size={18} />

                      <input
                        aria-label="Search loaded design references"
                        placeholder="Search names, guidance or maintainers…"
                        value={query}
                        onChange={event =>
                          setQuery(event.target.value)
                        }
                      />
                    </label>

                    <select
                      aria-label="Filter status"
                      value={status}
                      onChange={event =>
                        setStatus(event.target.value)
                      }
                    >
                      <option value="all">
                        All statuses
                      </option>

                      {Object.entries(phases).map(
                        ([id, label]) => (
                          <option
                            key={`filter:${id}`}
                            value={id}
                          >
                            {label}
                          </option>
                        ),
                      )}
                    </select>
                  </div>

                  <p className="tds-muted">
                    {matches.length} matching references
                    in the loaded workspace.
                  </p>

                  {cards(matches)}

                  {!matches.length &&
                    entries.length > 0 && (
                      <p className="tds-empty">
                        No matching references.
                        Try another search or status.
                      </p>
                    )}
                </>
              )}

              {!entries.length && (
                <div className="tds-empty">
                  <Layers3 size={32} />

                  <h3>
                    Your shared library starts here
                  </h3>

                  <p>
                    {isManager
                      ? "Use New reference to add a component or foundation with its usage guidance."
                      : "Company references will appear here when a manager adds them."}
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}