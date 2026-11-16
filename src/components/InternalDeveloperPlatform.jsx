import { useId, useRef, useState } from "react";
import {
  Check, ChevronDown, ExternalLink, Layers3, Search,
  Server, Terminal, Trash2, UserRound,
} from "lucide-react";
import EmployeeAvatar from "./EmployeeAvatar.jsx";
import "./internal-developer-platform.css";
import DeveloperToolHeading from "./DeveloperToolHeading.jsx";
import RecordInteraction from "./RecordInteraction.jsx";
import { safeExternalUrl } from "../lib/reporting.js";
import StagingPreview from "./StagingPreview.jsx";
import DeveloperCatalog from "./DeveloperCatalog.jsx";

const types = ["Service", "Environment request", "Scaffolding template"];
const statuses = {
  open: "Open",
  in_progress: "In progress",
  blocked: "Blocked",
  pending_approval: "Pending approval",
  approved: "Approved",
  rejected: "Rejected",
  done: "Completed",
  published: "Published",
  archived: "Archived",
};

const platformActions = [
  {
    type: "Service",
    label: "Register a service",
    hint: "List an app or API with its owner and link.",
    Icon: Server,
  },
  {
    type: "Environment request",
    label: "Request an environment",
    hint: "Track a development, staging, or production request.",
    Icon: Layers3,
  },
  {
    type: "Scaffolding template",
    label: "Add a starter template",
    hint: "Save a reusable project starter for the team.",
    Icon: Terminal,
  },
];

function PlatformOwnerPicker({ employees, initialId = "", disabled }) {
  const [ownerId, setOwnerId] = useState(initialId);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const trigger = useRef(null);
  const panelId = useId();

  const owner = employees.find(person => person.id === ownerId);
  const choices = employees.filter(person =>
    !person.is_banned &&
    [person.display_name, person.job_title].join(" ").toLowerCase()
      .includes(query.trim().toLowerCase())
  );

  function choose(id) {
    setOwnerId(id);
    setOpen(false);
    setQuery("");
    trigger.current?.focus();
  }

  return (
    <div
      className="field td-idp-owner"
      onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={event => {
        if (event.key === "Escape" && open) {
          event.stopPropagation();
          setOpen(false);
          trigger.current?.focus();
        }
      }}
    >
      <span>Assigned owner</span>
      <input type="hidden" name="platform_owner" value={ownerId} />

      <button
        ref={trigger}
        type="button"
        className="td-idp-owner-trigger"
        disabled={disabled}
        aria-label={`Assigned owner: ${owner?.display_name || (ownerId ? "Previous owner" : "Unassigned")}`}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => { setOpen(!open); setQuery(""); }}
      >
        {owner ? (
          <EmployeeAvatar employeeId={owner.id} name={owner.display_name} interactive={false} />
        ) : (
          <UserRound size={20} aria-hidden="true" />
        )}
        <span>{owner?.display_name || (ownerId ? "Previous owner" : "Choose an employee")}</span>
        <ChevronDown size={17} aria-hidden="true" />
      </button>

      {open && (
        <div id={panelId} className="td-idp-owner-panel">
          <input
            type="search"
            aria-label="Search employees"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Search by name or job title"
            onKeyDown={event => {
              if (event.key === "Enter") event.preventDefault();
            }}
          />

          <div className="td-idp-owner-list" role="group" aria-label="Available owners">
            <button type="button" className="td-idp-option"
              aria-pressed={!ownerId} onClick={() => choose("")}>
              <UserRound size={20} aria-hidden="true" />
              <span>Unassigned</span>
              {!ownerId && <Check size={17} aria-hidden="true" />}
            </button>

            {choices.map(person => (
              <button key={person.id} type="button" className="td-idp-option"
                aria-pressed={ownerId === person.id} onClick={() => choose(person.id)}>
                <EmployeeAvatar
                  employeeId={person.id}
                  name={person.display_name}
                  interactive={false}
                />
                <span>
                  <strong>{person.display_name}</strong>
                  {person.job_title && <small>{person.job_title}</small>}
                </span>
                {ownerId === person.id && <Check size={17} aria-hidden="true" />}
              </button>
            ))}

            {!choices.length && <p role="status">No matching employees.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
export default function InternalDeveloperPlatform({
  module,
  records,
  employees,
  interactions,
  userId,
  onSave,
  onDelete,
  onInteract,
}) {
  const [form, setForm] = useState(null);
  const [type, setType] = useState(types[0]);
  const [filter, setFilter] = useState("Environment request");
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const rows = records.filter(record => record.module_id === module.id);
  const owners = new Map(employees.map(person => [person.id, person.display_name]));

  const visible = rows.filter(record => {
    const item = record.metadata?.internal_platform;
    const searchable = [
      record.title,
      record.description,
      item?.type,
      item?.environment,
      item?.reference,
      owners.get(item?.owner_id),
      statuses[record.status],
      record.metadata?.field_value,
    ].join(" ").toLowerCase();

    return (!filter || item?.type === filter)
      && searchable.includes(query.trim().toLowerCase());
  });

  const record = form?.record;
  const item = record?.metadata?.internal_platform;
  const referenceLabel = type === "Environment request"
    ? "Service or project"
    : "Technology stack";

    function openEditor(record = null, startType = types[0]) {
    const savedType = record?.metadata?.internal_platform?.type;
    setType(types.includes(savedType) ? savedType : startType);
    setError("");
    setForm({ record });
  }

  async function save(event) {
    event.preventDefault();
    if (saving) return;

    setSaving(true);
    setError("");

    try {
      if (await onSave(event, record)) setForm(null);
      else setError("Save failed. Check the workspace error and try again.");
    } catch (failure) {
      setError(failure.message || "Could not save the item.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="suite-detail td-developer-workspace" data-module-id={module.id}>
      <DeveloperToolHeading module={module} />
      <DeveloperCatalog />
      {form && (!record || rows.some(row => row.id === record.id)) && (
        <section className="card panel-card td-idp-panel td-idp-editor">
        <header className="td-idp-panel-head">
        <span className="td-idp-panel-icon">
        <Terminal size={22} aria-hidden="true" />
         </span>
      <div className="td-idp-panel-copy">
      <p className="td-idp-kicker">PLATFORM WORKSPACE</p>
      <h2>{record ? "Edit platform item" : "New platform item"}</h2>
      <p>{platformActions.find(action => action.type === type)?.hint}</p>
      </div>
     </header>

          <form className="form-grid" key={record?.id || "new"} onSubmit={save}>
            <label className="field">
              <span>Item type</span>
              <select name="platform_type" value={type}
                onChange={event => setType(event.target.value)}>
                {types.map(value => <option key={value}>{value}</option>)}
              </select>
            </label>

            <label className="field">
              <span>Name</span>
              <input autoFocus name="title" required maxLength={180}
                defaultValue={record?.title || ""} placeholder="e.g. Employee Workspace" />
            </label>

            <label className="field">
              <span>Status</span>
              <select name="status" key={type}
                defaultValue={record?.status || (type === "Environment request" ? "pending_approval" : "open")}>
                {Object.entries(statuses).map(([value, label]) =>
                  <option value={value} key={value}>{label}</option>
                )}
              </select>
            </label>

            <PlatformOwnerPicker
              employees={employees}
              initialId={item?.owner_id || ""}
              disabled={saving}
            />

            {type !== "Scaffolding template" && (
              <label className="field">
                <span>Environment</span>
                <select name="platform_environment" key={type} defaultValue={item?.environment || ""}>
                  <option value="">Not specified</option>
                  {["Development", "Staging", "Production"].map(value =>
                    <option key={value}>{value}</option>
                  )}
                </select>
              </label>
            )}

            <label className="field">
              <span>{referenceLabel}</span>
              <input name="platform_reference" key={type} maxLength={180}
                defaultValue={item?.type === type ? item.reference || "" : ""} />
            </label>

            <label className="field">
              <span>Follow-up date</span>
              <input name="due_date" type="date" defaultValue={record?.due_date || ""} />
            </label>

            <label className="field wide-field">
              <span>Resource link (optional)</span>
              <input name="resource_url" type="url" maxLength={2000}
                defaultValue={record?.metadata?.resource_url || ""} placeholder="https://" />
            </label>

            <label className="field wide-field">
              <span>Notes</span>
              <textarea name="description" maxLength={5000} defaultValue={record?.description || ""} />
            </label>

            {error && <p className="wide-field" role="alert">{error}</p>}

<div className="td-idp-form-footer">
  <button
    type="button"
    className="outline-button"
    disabled={saving}
    onClick={() => setForm(null)}
  >
    Cancel
  </button>
  <button type="submit" className="primary-button" disabled={saving}>
    {saving ? "Saving…" : record ? "Save changes" : "Save item"}
  </button>
</div>
          </form>
        </section>
      )}

      <section className="card panel-card suite-records-card td-idp-panel td-idp-catalog">
  <header className="td-idp-panel-head">
    <span className="td-idp-panel-icon">
      <Layers3 size={22} aria-hidden="true" />
    </span>
    <div className="td-idp-panel-copy">
      <p className="td-idp-kicker">PLATFORM WORKSPACE</p>
      <h2>Staging queue and previous records</h2>
      <p>Find a service, check an environment request, or reuse a starter template.</p>
    </div>
    <span className="td-idp-count" role="status">
      {visible.length} of {rows.length} items
    </span>
  </header>

  <div className="td-idp-catalog-tools">
    <label className="suite-inline-search">
      <Search size={16} aria-hidden="true" />
      <input
        type="search"
        aria-label="Search platform items"
        value={query}
        onChange={event => setQuery(event.target.value)}
        placeholder="Search by name, owner or environment"
      />
    </label>

    <label className="field">
      <select
        aria-label="Filter by type"
        value={filter}
        onChange={event => setFilter(event.target.value)}
      >
        <option value="">All item types</option>
        {types.map(value => <option key={value}>{value}</option>)}
      </select>
    </label>
  </div>

        <div className="suite-record-list">
          {visible.map(row => {
            const detail = row.metadata?.internal_platform;
            const resource = safeExternalUrl(row.metadata?.resource_url);

            return (
              <div key={row.id} id={`workplace-${row.id}`} className="suite-entry">
                <article className="suite-record-row">
                  <span className="suite-record-icon"><Server size={18} /></span>

                  <div className="suite-record-copy">
                    <strong>{row.title}</strong>
                    <div className="td-idp-badges">
                    <span className="td-idp-type">{detail?.type || "Existing item"}</span>
                    <span className="td-idp-status" data-status={row.status}>
                    {statuses[row.status] || row.status}
                    </span>
                   </div>
                    {detail?.environment && <p>Environment: {detail.environment}</p>}
                    {detail?.reference && <p>{detail.reference}</p>}
                    {row.metadata?.field_value && <p>{row.metadata.field_value}</p>}
                    <div className="td-idp-saved-owner">
                      {detail?.owner_id && (
                        <EmployeeAvatar
                          employeeId={detail.owner_id}
                          name={owners.get(detail.owner_id)}
                          interactive={false}
                        />
                      )}
                      <small>
                        {owners.get(detail?.owner_id) ||
                          (detail?.owner_id ? "Previous owner" : "Unassigned")}
                        {row.due_date ? ` · Follow up: ${row.due_date}` : ""}
                      </small>
                    </div>
                    {detail?.type === "Environment request" && detail.environment === "Staging" && (
                   <StagingPreview recordId={row.id} approved={row.status === "approved"} pending={row.status === "pending_approval"} onRefresh={onRefresh}/>
                    )}
                    {row.description && <p>{row.description}</p>}
                    {resource && (
                      <a href={resource} target="_blank" rel="noopener noreferrer">
                        Open resource <ExternalLink size={13} />
                      </a>
                    )}
                  </div>

                  <button type="button" className="outline-button" disabled={saving}
                    onClick={() => openEditor(row)}
                    style={{ gridColumn: "2 / -1", gridRow: 2, justifySelf: "start" }}>
                    Edit
                  </button>

                  <button type="button" className="suite-delete" disabled={saving}
                    aria-label={`Delete ${row.title}`} onClick={() => onDelete(row)}
                    style={{ gridColumn: "-2", gridRow: 1 }}>
                    <Trash2 size={15} />
                  </button>
                </article>

                <RecordInteraction record={row} interactions={interactions} employees={employees}
                  userId={userId} isManager onInteract={onInteract} />
              </div>
            );
          })}

          {!visible.length && (
            <div className="suite-empty">
              {rows.length
                ? "No items match your search."
                : "Add a service, environment request, or scaffolding template to get started."}
            </div>
          )}
        </div>
      </section>
    </section>
  );
}