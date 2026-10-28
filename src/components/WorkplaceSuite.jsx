import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Boxes,
  BriefcaseBusiness,
  Building2,
  Check,
  Code2,
  Database,
  ExternalLink,
  HeartHandshake,
  LayoutDashboard,
  MessageSquare,
  Network,
  Plus,
  Search,
  Shield,
  Trash2,
  Users,
} from "lucide-react";
import RecordInteraction from "./RecordInteraction.jsx";
import { safeExternalUrl } from "../lib/reporting.js";
import {workplaceModules,canAccessWorkplaceModule,getWorkplaceGroupsForRole,} from "../lib/workplaceModules.js";
import EmployeeAvatar from "./EmployeeAvatar.jsx";
import InternalChat from "./InternalChat.jsx";
import DocsWorkspace from "./DocsWorkspace.jsx";
import OkrWorkspace from "./OkrWorkspace.jsx";
import MeetingWorkspace from "./MeetingWorkspace.jsx";
import DesignWorkroom from "./DesignWorkroom.jsx";

const groupIcons = {
  platform: Code2,
  collaboration: MessageSquare,
  people: Users,
  security: Shield,
  data: Database,
  culture: HeartHandshake,
};

const statusOptions = ["open", "in_progress", "blocked", "pending_approval", "approved", "rejected", "done", "published", "archived"];

function displayStatus(status) {
  return status.replaceAll("_", " ").replace(/\b\w/g, letter => letter.toUpperCase());
}

export default function WorkplaceSuite({
  records,
  interactions,
  onInteract,
  initialModuleId = "",
  employees,
  tasks,
  announcements,
  isManager,
  role = "employee",
  userId,
  onCreate,
  onSaveOkr,
  onSaveMeeting,
  onSaveDesignReference,
  onRefreshDesign,
  onStatus,
  onDelete,
  onNavigate,
}) {
  const moduleId = initialModuleId;
  const [query, setQuery] = useState("");
  const selectedModule = workplaceModules.find(module => module.id === moduleId);
  const visibleGroups = getWorkplaceGroupsForRole(role);

  function openModule(module) {
    if (module.nativeView && !["directory", "search"].includes(module.nativeView)) {
      onNavigate(module.nativeView);
      return;
    }
    setQuery("");
   onNavigate("suite", module.id);
  }
if (
  selectedModule &&
  !canAccessWorkplaceModule(selectedModule.id, role)
) {
  return (
    <section className="card panel-card">
      <h2>Tool unavailable</h2>
      <p>This tool is not available for your role.</p>
    </section>
  );
}
  if (!selectedModule) {
    return (
      <>
        <div className="suite-intro">
          <p className="eyebrow">LEGION WORKPLACE</p>
          <h1>Workplace tools</h1>
          <p>Choose an area, then open the tool you need.</p>
          <div className="suite-connection-note">
            <Network size={17} />
            <span>Legion records and workflows are stored in your Supabase workspace. External service connections are identified in each module and are not represented as live integrations.</span>
          </div>
        </div>
        <div className="suite-groups">
          {visibleGroups.map(group => {
            const Icon = groupIcons[group.id] || Boxes;
            return (
              <details className="suite-group card" key={group.id}>
                <summary className="suite-group-heading">
                  <span className={`suite-group-icon suite-${group.id}`}><Icon size={19} /></span>
                  <div><h2>{group.label}</h2><p>{group.description}</p></div>
                  <span className="suite-count">{group.modules.length} modules</span>
                </summary>
                <div className="suite-module-grid">
                  {group.modules.map(module => {
                    const moduleRecords = records.filter(record => record.module_id === module.id);
                    return (
                      <button className="suite-module-card" key={module.id} onClick={() => openModule(module)}>
                        <span className="suite-module-top">
                          <strong>{module.title}</strong>
                          {module.provider ? <ExternalLink size={14} aria-label="Provider connection needed" /> : <ArrowRight size={15} />}
                        </span>
                        <span className="suite-module-description">{module.description}</span>
                        <span className="suite-module-meta">
                          {module.provider ? <span className="provider-needed">Provider setup needed</span> : <span>{module.nativeView ? "Connected workspace module" : "Supabase-backed records"}</span>}
                          <span>{module.nativeView === "directory" ? employees.length : module.nativeView === "tasks" ? tasks.length : moduleRecords.length} records</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </details>
            );
          })}
        </div>
      </>
    );
  }

  if (selectedModule.nativeView === "directory") {
    const matches = employees.filter(employee =>
      `${employee.display_name} ${employee.job_title} ${employee.role}`.toLowerCase().includes(query.toLowerCase()),
    );
    return (
      <section className="suite-detail">
        <SuiteModuleHeading module={selectedModule} />
        <label className="suite-search"><Search size={16} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search employees" /></label>
        <div className="suite-directory-grid">
          {matches.map(employee => (
            <article className="suite-directory-card card" key={employee.id}>
              <EmployeeAvatar employeeId={employee.id} />
              <strong>{employee.display_name}</strong>
              <span>{employee.job_title}</span>
              <small>{displayStatus(employee.role)}</small>
            </article>
          ))}
          {!matches.length && <SuiteEmpty title="No employees found" text="Try a different name, title, or role." />}
        </div>
      </section>
    );
  }

  if (selectedModule.nativeView === "search") {
    const searchable = [
      ...employees.map(item => ({ type: "Employee", title: item.display_name, description: item.job_title, key: `employee-${item.id}` })),
      ...tasks.map(item => ({ type: "Task", title: item.title, description: item.description, key: `task-${item.id}` })),
      ...announcements.map(item => ({ type: "Company notice", title: item.title, description: item.body, key: `notice-${item.id}` })),
      ...records.map(item => ({ type: workplaceModules.find(module => module.id === item.module_id)?.title || "Workspace record", title: item.title, description: item.description, key: `record-${item.id}` })),
    ];
    const matches = searchable.filter(item => `${item.type} ${item.title} ${item.description}`.toLowerCase().includes(query.toLowerCase()));
    return (
      <section className="suite-detail">
        <SuiteModuleHeading module={selectedModule} />
        <label className="suite-search"><Search size={16} /><input autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder="Search workspace records" /></label>
        <div className="suite-search-results">
          {query && matches.map(item => <article className="suite-search-result card" key={item.key}><span>{item.type}</span><strong>{item.title}</strong><p>{item.description}</p></article>)}
          {query && !matches.length && <SuiteEmpty title="No results" text="Try another search phrase." />}
          {!query && <SuiteEmpty title="Search your workspace" text="Search employees, tasks, company notices, and records you have permission to view." />}
        </div>
      </section>
    );
  }
if (selectedModule.id === "collaboration.chat") {
  return (
    <InternalChat
      key={userId}
      module={selectedModule}
      records={records}
      interactions={interactions}
      employees={employees}
      userId={userId}
      isManager={isManager}
      onCreate={onCreate}
      onInteract={onInteract}
      onDelete={onDelete}
    />
  );
}

if (selectedModule.id === "collaboration.docs") {
  return (
    <DocsWorkspace
      key={userId}
      module={selectedModule}
      records={records}
      employees={employees}
      interactions={interactions}
      userId={userId}
      isManager={isManager}
      onCreate={onCreate}
      onStatus={onStatus}
      onDelete={onDelete}
      onInteract={onInteract}
    />
  );
}

if (selectedModule.id === "collaboration.okrs") {
  return (
    <OkrWorkspace
      key={userId}
      records={records}
      employees={employees}
      interactions={interactions}
      userId={userId}
      isManager={isManager}
      onSave={onSaveOkr}
      onInteract={onInteract}
    />
  );
}
if (selectedModule.id === "collaboration.meetings") {
  return (
    <MeetingWorkspace
      key={userId}
      records={records}
      employees={employees}
      interactions={interactions}
      userId={userId}
      isManager={isManager}
      onSave={onSaveMeeting}
      onInteract={onInteract}
    />
  );
}
if (
  selectedModule.id === "collaboration.design-system"
) {
  return (
    <DesignWorkroom
      key={userId}
      records={records}
      interactions={interactions}
      employees={employees}
      userId={userId}
      isManager={isManager}
      onSave={onSaveDesignReference}
      onRefresh={onRefreshDesign}
      onInteract={onInteract}
    />
  );
}
  const canCreate = isManager || selectedModule.employeeCreate;
  const recordStatusOptions = selectedModule.reviewRequired
    ? statusOptions
    : statusOptions.filter(status => !["pending_approval", "approved", "rejected"].includes(status));
  const createStatusOptions = selectedModule.reviewRequired && !isManager ? ["pending_approval"] : statusOptions;
  const createVisibilityOptions = selectedModule.reviewRequired && !isManager ? ["private"] : ["company", "private"];
  const moduleRecords = records.filter(record => record.module_id === selectedModule.id)
    .filter(record => `${record.title} ${record.description}`.toLowerCase().includes(query.toLowerCase()));

  return (
    <section className="suite-detail">
      <SuiteModuleHeading module={selectedModule} />
      {selectedModule.provider && (
        <div className="suite-provider-note"><ExternalLink size={16} /><span><strong>External provider not connected</strong>{selectedModule.provider} This module stores internal tracking records only; it does not control or sync the external service.</span></div>
      )}
      {canCreate && (
        <details className="card panel-card suite-create-card">
          <summary className="create-summary"><Plus size={17} />{selectedModule.action || "Add record"}</summary>
          <form className="form-grid" onSubmit={event => onCreate(selectedModule, event)}>
            <label className="field"><span>Title</span><input name="title" required maxLength={180} placeholder="Add a clear title" /></label>
            <label className="field"><span>Status</span><select name="status" defaultValue={selectedModule.reviewRequired ? "pending_approval" : "open"}>{createStatusOptions.map(status => <option value={status} key={status}>{displayStatus(status)}</option>)}</select></label>
            <label className="field wide-field"><span>Details</span><textarea name="description" maxLength={5000} placeholder="Add useful context, notes, or a link (do not enter secrets)." /></label>
            {selectedModule.valueLabel && <label className="field"><span>{selectedModule.valueLabel}</span><input name="module_value" type={selectedModule.valueType || "text"} min={selectedModule.valueType === "number" ? "0" : undefined} step={selectedModule.valueType === "number" ? "0.01" : undefined} placeholder={selectedModule.valuePlaceholder || ""} /></label>}
            <label className="field wide-field"><span>Resource or service link (optional)</span><input name="resource_url" type="url" maxLength={2000} placeholder="https://" /></label>
            <label className="field"><span>Due date (optional)</span><input name="due_date" type="date" /></label>
            <label className="field"><span>Visibility</span><select name="visibility" defaultValue={selectedModule.reviewRequired && !isManager || selectedModule.privateByDefault ? "private" : "company"}>{createVisibilityOptions.map(visibility => <option value={visibility} key={visibility}>{visibility === "private" ? "Only me and managers" : "Shared with the company"}</option>)}</select></label>
            <button className="primary-button form-action" type="submit"><Plus size={15} /> Save record</button>
          </form>
        </details>
      )}
      {!canCreate && <div className="suite-read-only"><Shield size={16} /><span>This module is manager-managed. You can view shared records here.</span></div>}
      <section className="card panel-card suite-records-card">
        <div className="panel-heading">
          <div><h2>{selectedModule.title}</h2><p>{moduleRecords.length} visible {moduleRecords.length === 1 ? "record" : "records"}</p></div>
          <label className="suite-inline-search"><Search size={14} /><input value={query} onChange={event => setQuery(event.target.value)} aria-label={`Search ${selectedModule.title}`} placeholder="Filter records" /></label>
        </div>
        {moduleRecords.length ? (
          <div className="suite-record-list">
            {moduleRecords.map(record => {
              const canUpdate = isManager || record.created_by === userId;
              return (
                <div id={`workplace-${record.id}`}className="suite-entry"key={record.id}><article className="suite-record-row">
                  <span className="suite-record-icon">{selectedModule.id.startsWith("collaboration.docs") ? <BookOpen size={16} /> : selectedModule.id.startsWith("collaboration") ? <MessageSquare size={16} /> : selectedModule.id.startsWith("people") ? <BriefcaseBusiness size={16} /> : selectedModule.id.startsWith("platform") ? <Code2 size={16} /> : selectedModule.id.startsWith("security") ? <Shield size={16} /> : selectedModule.id.startsWith("data") ? <LayoutDashboard size={16} /> : <HeartHandshake size={16} />}</span>
                  <div className="suite-record-copy"><strong>{record.title}</strong>{record.description && <p>{record.description}</p>}{record.metadata?.field_value && <p><strong>{selectedModule.valueLabel || "Reference"}:</strong> {safeExternalUrl(record.metadata.field_value) ? <a href={safeExternalUrl(record.metadata.field_value)} target="_blank" rel="noopener noreferrer">Open resource <ExternalLink size={12} /></a> : record.metadata.field_value}</p>}{safeExternalUrl(record.metadata?.resource_url) && <p><a href={safeExternalUrl(record.metadata.resource_url)} target="_blank" rel="noopener noreferrer">Open linked resource <ExternalLink size={12} /></a></p>}<small>{record.visibility === "private" ? "Private · " : ""}{record.due_date ? `Due ${record.due_date} · ` : ""}{new Date(record.created_at).toLocaleDateString()}</small></div>
                  <select aria-label={`Status for ${record.title}`} value={record.status} disabled={!canUpdate || (selectedModule.reviewRequired && !isManager)} onChange={event => onStatus(record, event.target.value)}>{recordStatusOptions.map(status => <option value={status} key={status}>{displayStatus(status)}</option>)}</select>
                  {isManager && <button className="icon-quiet suite-delete" title={`Delete ${record.title}`} aria-label={`Delete ${record.title}`} onClick={() => onDelete(record)}><Trash2 size={15} /></button>}
                </article><RecordInteraction record={record} interactions={interactions} employees={employees} userId={userId} isManager={isManager} onInteract={onInteract} /></div>
              );
            })}
          </div>
        ) : <SuiteEmpty title="Nothing here yet" text={query ? "No records match your filter." : "Create the first record to get this module moving."} />}
      </section>
    </section>
  );
}

function SuiteModuleHeading({ module }) {
  return (
    <header className="suite-module-heading">
      <p className="eyebrow">{module.groupLabel}</p>
      <h1>{module.title}</h1>
      <p>{module.description}</p>
      <span className="suite-module-status"><Check size={14} /> Legion workspace module</span>
    </header>
  );
}

function SuiteEmpty({ title, text }) {
  return <div className="suite-empty"><span><Building2 size={18} /></span><strong>{title}</strong><p>{text}</p></div>;
}
