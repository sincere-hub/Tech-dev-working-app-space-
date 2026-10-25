import { useEffect, useRef, useState } from "react";
import {
  Layers3,
  Plus,
  Search,
  Pencil,
  X,
  Copy,
  ExternalLink,
  Sun,
  Moon,
} from "lucide-react";
import { safeExternalUrl } from "../lib/reporting.js";

const kinds = {
  buttons: "Buttons",
  forms: "Form fields",
  cards: "Cards",
  badges: "Status badges",
  colors: "Colour tokens",
  typography: "Typography",
  spacing: "Spacing",
};

const hexPattern = /^#[0-9a-f]{6}$/i;

function safeAccent(value) {
  return hexPattern.test(String(value))
    ? String(value).toUpperCase()
    : "#8B9EFF";
}

function accentInk(hex) {
  const color = safeAccent(hex).slice(1);

  const [r, g, b] = [0, 2, 4].map(index => {
    const value =
      parseInt(color.slice(index, index + 2), 16) / 255;

    return value <= 0.04045
      ? value / 12.92
      : ((value + 0.055) / 1.055) ** 2.4;
  });

  const luminance =
    0.2126 * r + 0.7152 * g + 0.0722 * b;

  const blackContrast = (luminance + 0.05) / 0.05;
  const whiteContrast = 1.05 / (luminance + 0.05);

  return blackContrast >= whiteContrast
    ? "#000000"
    : "#FFFFFF";
}

function parseTokens(value) {
  const lines = value
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  if (!lines.length || lines.length > 12) {
    throw new Error(
      "Add between one and twelve colour tokens.",
    );
  }

  const names = new Set();

  return lines.map(line => {
    const match =
      /^([a-z][a-z0-9-]{0,39})\s*:\s*(#[0-9a-f]{6})$/i.exec(
        line,
      );

    if (!match) {
      throw new Error(
        "Write each colour as name: #112233, for example primary: #8B9EFF.",
      );
    }

    const name = match[1].toLowerCase();

    if (names.has(name)) {
      throw new Error(
        `The colour token “${name}” is repeated.`,
      );
    }

    names.add(name);

    return {
      name,
      value: match[2].toUpperCase(),
    };
  });
}

function designData(record) {
  const data = record?.metadata?.design_system || {};

  return {
    kind: Object.hasOwn(kinds, data.kind)
      ? data.kind
      : "cards",
    version:
      typeof data.version === "string"
        ? data.version
        : "1.0.0",
    accent: safeAccent(data.accent),
    accessibility:
      typeof data.accessibility === "string"
        ? data.accessibility
        : "",
    tokens: Array.isArray(data.tokens)
      ? data.tokens.filter(token =>
          token &&
          typeof token.name === "string" &&
          /^[a-z][a-z0-9-]{0,39}$/i.test(token.name) &&
          hexPattern.test(String(token.value)),
        )
      : [],
  };
}

function statusLabel(value) {
  return {
    published: "Published",
    in_progress: "Draft",
    archived: "Deprecated",
  }[value] || "Draft";
}

function Preview({ data, light }) {
  const [message, setMessage] = useState("");
  const [value, setValue] = useState("");

  return (
    <div
      className={`ds-preview${light ? " ds-light" : ""}`}
      style={{
        "--ds-accent": data.accent,
        "--ds-ink": accentInk(data.accent),
      }}
    >
      <span className="ds-preview-label">
        EXAMPLE PREVIEW
      </span>

      {data.kind === "buttons" && (
        <>
          <div className="ds-demo-row">
            <button
              type="button"
              className="ds-demo-primary"
              onClick={() =>
                setMessage(
                  "Primary button preview clicked.",
                )
              }
            >
              Primary action
            </button>

            <button
              type="button"
              className="ds-demo-secondary"
              onClick={() =>
                setMessage(
                  "Secondary button preview clicked.",
                )
              }
            >
              Secondary
            </button>

            <button
              type="button"
              className="ds-demo-primary"
              disabled
            >
              Disabled
            </button>
          </div>

          <p className="ds-demo-caption" role="status">
            {message ||
              "Try the enabled buttons to inspect their interaction."}
          </p>
        </>
      )}

      {data.kind === "forms" && (
        <label className="ds-demo-field">
          Example text field
          <input
            value={value}
            onChange={event =>
              setValue(event.target.value)
            }
            placeholder="Type to test this field"
          />
          <span>
            Use a visible label and useful supporting text.
          </span>
        </label>
      )}

      {data.kind === "cards" && (
        <article className="ds-demo-card">
          <span>EXAMPLE CARD</span>
          <h3>Keep related information together</h3>
          <p>
            A clear title, useful context, and one primary
            action.
          </p>

          <button
            type="button"
            className="ds-demo-primary"
            onClick={() =>
              setMessage("Card action preview clicked.")
            }
          >
            View details
          </button>

          <p className="ds-demo-caption" role="status">
            {message}
          </p>
        </article>
      )}

      {data.kind === "badges" && (
        <div className="ds-demo-row">
          <span className="ds-demo-badge">
            In progress
          </span>
          <span className="ds-demo-badge ds-badge-success">
            Completed
          </span>
          <span className="ds-demo-badge ds-badge-warning">
            Needs attention
          </span>
        </div>
      )}

      {data.kind === "colors" && (
        <div className="ds-swatches">
          {data.tokens.map(token => (
            <div key={token.name}>
              <span
                className="ds-swatch"
                style={{
                  backgroundColor: safeAccent(token.value),
                }}
              />
              <strong>{token.name}</strong>
              <code>{safeAccent(token.value)}</code>
            </div>
          ))}

          {!data.tokens.length && (
            <p>
              Add colour tokens when editing this reference.
            </p>
          )}
        </div>
      )}

      {data.kind === "typography" && (
        <div className="ds-type">
          <p style={{ fontSize: 28 }}>A clear heading</p>
          <p style={{ fontSize: 18 }}>
            A useful section title
          </p>
          <p style={{ fontSize: 14 }}>
            Readable body text with enough room to breathe.
          </p>
          <span>
            Example scale: 28 / 18 / 14 px. Record your actual
            type rules in the usage guidance.
          </span>
        </div>
      )}

      {data.kind === "spacing" && (
        <div className="ds-spacing">
          {[8, 16, 24, 32].map(size => (
            <div key={size}>
              <span>{size}px</span>
              <i style={{ width: size * 4 }} />
            </div>
          ))}
          <p>
            Example spacing scale. Record the approved
            spacing rules in the usage guidance.
          </p>
        </div>
      )}
    </div>
  );
}

export default function DesignSystemWorkspace({
  records = [],
  isManager,
  onSave,
}) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("all");
  const [status, setStatus] = useState("all");
  const [selectedId, setSelectedId] = useState("");
  const [light, setLight] = useState(false);
  const [editor, setEditor] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const locked = useRef(false);
  const reader = useRef(null);
  const root = useRef(null);

  const entries = records.filter(
    record =>
      record.module_id === "collaboration.design-system",
  );

  const visible = entries
    .filter(record => {
      const data = designData(record);

      return (
        (kind === "all" || data.kind === kind) &&
        (
          status === "all" ||
          statusLabel(record.status) === status
        ) &&
        `${record.title} ${record.description} ${kinds[data.kind]}`
          .toLowerCase()
          .includes(query.trim().toLowerCase())
      );
    })
    .sort(
      (a, b) =>
        a.title.localeCompare(b.title) ||
        String(a.id).localeCompare(String(b.id)),
    );

  const selected =
    visible.find(record => record.id === selectedId) ||
    visible[0];

  const data = selected ? designData(selected) : null;

  const resource =
    selected &&
    safeExternalUrl(selected.metadata?.resource_url);

  useEffect(() => {
    if (selectedId) {
      reader.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });

      reader.current?.focus({
        preventScroll: true,
      });
    }
  }, [selectedId]);

  useEffect(() => {
    if (!root.current) return;

    const observer = new MutationObserver(changes => {
      for (const change of changes) {
        if (
          change.target.dataset.activityTarget === "true" &&
          change.target.dataset.designId
        ) {
          setQuery("");
          setKind("all");
          setStatus("all");
          setSelectedId(change.target.dataset.designId);
        }
      }
    });

    observer.observe(root.current, {
      subtree: true,
      attributes: true,
      attributeFilter: ["data-activity-target"],
    });

    return () => observer.disconnect();
  }, []);

  function edit(record = null) {
    if (!isManager || locked.current) return;

    const value = designData(record);

    setError("");
    setMessage("");

    setEditor({
      record,
      title: record?.title || "",
      description: record?.description || "",
      kind: value.kind,
      version: value.version,
      accent: value.accent,
      accessibility: value.accessibility,
      resource: record?.metadata?.resource_url || "",
      tokens:
        value.tokens
          .map(token => `${token.name}: ${token.value}`)
          .join("\n") ||
        "primary: #8B9EFF\nsurface: #14243A\ntext: #F1F5FF",
      status:
        record?.status === "published"
          ? "published"
          : record?.status === "archived"
            ? "archived"
            : "in_progress",
      visibility: record?.visibility || "company",
    });
  }

  function change(field, value) {
    setEditor(old => ({
      ...old,
      [field]: value,
    }));
  }

  function closeEditor() {
    if (
      !locked.current &&
      window.confirm(
        "Discard these unsaved design reference changes?",
      )
    ) {
      setEditor(null);
      setError("");
    }
  }

  async function save(event) {
    event.preventDefault();

    if (!isManager || !editor || locked.current) return;

    setError("");

    if (!navigator.onLine) {
      setError(
        "Connect to the internet to save. Your changes are still here.",
      );
      return;
    }

    if (
      !editor.title.trim() ||
      !editor.description.trim() ||
      !editor.version.trim()
    ) {
      setError("Add a name, version, and usage guidance.");
      return;
    }

    if (!hexPattern.test(editor.accent)) {
      setError(
        "Use a six-digit accent colour such as #8B9EFF.",
      );
      return;
    }

    const link = editor.resource.trim();

    if (link && !safeExternalUrl(link)) {
      setError(
        "Use a full HTTPS reference link without embedded credentials.",
      );
      return;
    }

    let tokens;

    try {
      tokens = editor.kind === "colors"
        ? parseTokens(editor.tokens)
        : designData(editor.record).tokens;
    } catch (failure) {
      setError(failure.message);
      return;
    }

    const payload = {
      title: editor.title.trim(),
      description: editor.description.trim(),
      status: editor.status,
      visibility: editor.visibility,
      metadata: {
        ...(editor.record?.metadata || {}),
        resource_url: link,
        design_system: {
          version: editor.version.trim(),
          kind: editor.kind,
          accent: safeAccent(editor.accent),
          accessibility: editor.accessibility.trim(),
          tokens,
        },
      },
    };

    locked.current = true;
    setBusy(true);

    try {
      const result = await onSave(editor.record, payload);

      if (!result) {
        throw new Error(
          "The reference was not saved. Your changes are still here; check the workspace error above.",
        );
      }

      setEditor(null);
      setQuery("");
      setKind("all");
      setStatus("all");

      setSelectedId(
        result.id || editor.record?.id || "",
      );

      setMessage("Design reference saved.");
    } catch (failure) {
      setError(
        failure.message ||
        "Could not save this reference.",
      );
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }

  async function copyReference() {
    if (!selected) return;

    setMessage("");
    setError("");

    const text = data.kind === "colors"
      ? (
          ":root {\n" +
          data.tokens.map(
            token =>
              `  --${token.name}: ${safeAccent(token.value)};`,
          ).join("\n") +
          "\n}"
        )
      : (
          `${selected.title}\n` +
          `Version: ${data.version}\n` +
          `Category: ${kinds[data.kind]}\n\n` +
          `${selected.description}\n\n` +
          "Accessibility notes:\n" +
          `${data.accessibility || "Not documented."}` +
          (resource ? `\n\nReference: ${resource}` : "")
        );

    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard unavailable");
      }

      await navigator.clipboard.writeText(text);

      setMessage(
        data.kind === "colors"
          ? "CSS colour tokens copied."
          : "Reference copied.",
      );
    } catch {
      setError(
        "The browser could not copy this reference. Select the text or colour values and copy them manually.",
      );
    }
  }

  return (
    <section
      className="td-design"
      ref={root}
      aria-label="Design system and components"
    >
      <header className="ds-hero">
        <span className="ds-symbol">
          <Layers3 size={27} />
        </span>

        <div>
          <p className="ds-eyebrow">
            ONE SHARED DESIGN LANGUAGE
          </p>
          <h1>Design system & components</h1>
          <p>
            Reusable patterns. Clear guidance.
            Consistent experiences.
          </p>
        </div>

        {isManager && (
          <button
            type="button"
            className="ds-primary"
            disabled={busy || Boolean(editor)}
            onClick={() => edit()}
          >
            <Plus size={17} />
            New reference
          </button>
        )}
      </header>

      {message && (
        <p className="ds-success" role="status">
          {message}
        </p>
      )}

      {error && (
        <p className="ds-error" role="alert">
          {error}
        </p>
      )}

      {editor && (
        <form className="ds-editor" onSubmit={save}>
          <header>
            <h2>
              {editor.record
                ? "Edit design reference"
                : "Add a design reference"}
            </h2>

            <button
              type="button"
              className="ds-icon"
              disabled={busy}
              onClick={closeEditor}
              aria-label="Close reference editor"
            >
              <X size={20} />
            </button>
          </header>

          <fieldset disabled={busy}>
            <div className="ds-fields">
              <label className="ds-wide">
                Reference name
                <input
                  autoFocus
                  required
                  maxLength={180}
                  value={editor.title}
                  onChange={event =>
                    change("title", event.target.value)
                  }
                  placeholder="For example: Primary action buttons"
                />
              </label>

              <label>
                Category
                <select
                  value={editor.kind}
                  onChange={event =>
                    change("kind", event.target.value)
                  }
                >
                  {Object.entries(kinds).map(
                    ([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ),
                  )}
                </select>
              </label>

              <label>
                Version
                <input
                  required
                  maxLength={30}
                  value={editor.version}
                  onChange={event =>
                    change("version", event.target.value)
                  }
                  placeholder="1.0.0"
                />
              </label>

              <label>
                Status
                <select
                  value={editor.status}
                  onChange={event =>
                    change("status", event.target.value)
                  }
                >
                  <option value="in_progress">Draft</option>
                  <option value="published">Published</option>
                  <option value="archived">Deprecated</option>
                </select>
              </label>

              <label>
                Visibility
                <select
                  value={editor.visibility}
                  onChange={event =>
                    change(
                      "visibility",
                      event.target.value,
                    )
                  }
                >
                  <option value="company">
                    Company employees can view
                  </option>
                  <option value="private">
                    Only creator and managers can view
                  </option>
                </select>
              </label>

              <label>
                Preview accent colour
                <input
                  required
                  pattern="#[0-9a-fA-F]{6}"
                  maxLength={7}
                  value={editor.accent}
                  onChange={event =>
                    change("accent", event.target.value)
                  }
                  placeholder="#8B9EFF"
                />
              </label>

              <label>
                Figma, Storybook, or documentation link
                <input
                  type="url"
                  maxLength={2000}
                  value={editor.resource}
                  onChange={event =>
                    change("resource", event.target.value)
                  }
                  placeholder="https://"
                />
              </label>

              <label className="ds-wide">
                Usage guidance
                <textarea
                  required
                  rows={5}
                  maxLength={5000}
                  value={editor.description}
                  onChange={event =>
                    change(
                      "description",
                      event.target.value,
                    )
                  }
                  placeholder="Explain when to use this pattern, its variants, and when to avoid it."
                />
              </label>

              <label className="ds-wide">
                Accessibility notes
                <textarea
                  rows={3}
                  maxLength={2000}
                  value={editor.accessibility}
                  onChange={event =>
                    change(
                      "accessibility",
                      event.target.value,
                    )
                  }
                  placeholder="Document labels, keyboard behaviour, focus states, and contrast requirements."
                />
              </label>

              {editor.kind === "colors" && (
                <label className="ds-wide">
                  Colour tokens · one per line
                  <textarea
                    required
                    rows={5}
                    maxLength={1000}
                    value={editor.tokens}
                    onChange={event =>
                      change("tokens", event.target.value)
                    }
                    placeholder={
                      "primary: #8B9EFF\nsurface: #14243A"
                    }
                  />
                  <small>
                    Use unique names containing letters,
                    numbers, and hyphens. Maximum 12 tokens.
                  </small>
                </label>
              )}
            </div>

            <footer>
              <span>
                Publishing documents a reference; it does
                not change the rest of the app's styling.
              </span>
              <button
                type="submit"
                className="ds-primary"
              >
                {busy ? "Saving…" : "Save reference"}
              </button>
            </footer>
          </fieldset>
        </form>
      )}

      <div className="ds-toolbar">
        <label className="ds-search">
          <Search size={17} />
          <input
            aria-label="Search loaded design references"
            value={query}
            onChange={event =>
              setQuery(event.target.value)
            }
            placeholder="Search components, patterns, or guidance"
          />
        </label>

        <select
          aria-label="Filter design category"
          value={kind}
          onChange={event =>
            setKind(event.target.value)
          }
        >
          <option value="all">All categories</option>

          {Object.entries(kinds).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>

        <select
          aria-label="Filter reference status"
          value={status}
          onChange={event =>
            setStatus(event.target.value)
          }
        >
          <option value="all">All statuses</option>

          {["Published", "Draft", "Deprecated"].map(value => (
            <option key={value}>{value}</option>
          ))}
        </select>
      </div>

      <p className="ds-hint">
        {visible.length} matching references from your loaded
        workspace. Previews are examples; published guidance
        defines how your team should use them.
      </p>

      <div className="ds-layout">
        <nav
          className="ds-catalog"
          aria-label="Design reference library"
        >
          {visible.map(record => (
            <button
              type="button"
              id={`workplace-${record.id}`}
              data-design-id={record.id}
              key={record.id}
              aria-pressed={selected?.id === record.id}
              onClick={() => {
                setSelectedId(record.id);
                setMessage("");
              }}
            >
              <span>
                {kinds[designData(record).kind]}
              </span>
              <strong>{record.title}</strong>
              <small>
                {statusLabel(record.status)}
                {" · "}
                {designData(record).version}
              </small>
            </button>
          ))}
        </nav>

        {selected ? (
          <article
            className="ds-reader"
            tabIndex={-1}
            ref={reader}
          >
            <header>
              <div>
                <span
                  className={`ds-status ${
                    selected.status === "archived"
                      ? "ds-deprecated"
                      : ""
                  }`}
                >
                  {statusLabel(selected.status)}
                </span>

                <h2>{selected.title}</h2>

                <p>
                  {kinds[data.kind]}
                  {" · "}Version {data.version}
                  {selected.visibility === "private"
                    ? " · Private"
                    : ""}
                </p>
              </div>

              {isManager && (
                <button
                  type="button"
                  className="ds-secondary"
                  disabled={busy || Boolean(editor)}
                  onClick={() => edit(selected)}
                >
                  <Pencil size={15} />
                  Edit reference
                </button>
              )}
            </header>

            {selected.status === "archived" && (
              <p className="ds-warning">
                This reference is deprecated. Check for a
                replacement before using it in new work.
              </p>
            )}

            <div className="ds-preview-toolbar">
              <h3>Preview</h3>

              <button
                type="button"
                className="ds-secondary"
                aria-pressed={light}
                onClick={() =>
                  setLight(value => !value)
                }
              >
                {light
                  ? <Moon size={15} />
                  : <Sun size={15} />}

                {light ? "Dark canvas" : "Light canvas"}
              </button>
            </div>

            <Preview
              key={selected.id}
              data={data}
              light={light}
            />

            <section className="ds-documentation">
              <h3>Usage guidance</h3>
              <p>
                {selected.description ||
                  "No usage guidance documented yet."}
              </p>

              <h3>Accessibility notes</h3>
              <p>
                {data.accessibility ||
                  "No accessibility notes documented yet."}
              </p>
            </section>

            <footer className="ds-reader-actions">
              <button
                type="button"
                className="ds-secondary"
                onClick={copyReference}
              >
                <Copy size={15} />
                {data.kind === "colors"
                  ? "Copy CSS tokens"
                  : "Copy reference"}
              </button>

              {resource && (
                <a
                  href={resource}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ds-secondary"
                >
                  <ExternalLink size={15} />
                  Open source reference
                </a>
              )}
            </footer>
          </article>
        ) : (
          <div className="ds-empty">
            <Layers3 size={34} />

            <h2>
              {entries.length
                ? "No matching references"
                : "Build a consistent design language"}
            </h2>

            <p>
              {entries.length
                ? "Try another search or filter."
                : isManager
                  ? "Add your first component or foundation reference, with clear usage guidance."
                  : "Company references will appear here when a manager adds them."}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}