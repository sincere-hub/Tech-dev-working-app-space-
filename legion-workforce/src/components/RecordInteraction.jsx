import { useState } from "react";
import { Check, MessageSquare, ChevronDown } from "lucide-react";

const trainingModules = ["people.learning", "people.onboarding", "security.training"];
export default function RecordInteraction({ record, interactions, employees, userId, isManager, onInteract }) {
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const entries = interactions.filter(item => item.record_id === record.id);
  const comments = entries.filter(item => item.kind === "comment").sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  const rating = entries.find(item => item.kind === "rating" && item.employee_id === userId);
  const complete = entries.some(item => item.kind === "completion" && item.employee_id === userId);
  const ratings = entries.filter(item => item.kind === "rating");
  const active = !["archived", "done", "rejected"].includes(record.status);
  async function save(kind, body = "", value = null, form) {
    if (busy) return;
    setBusy(true);
    try { const result = await onInteract(record.id, kind, body, value); if (result) form?.reset(); }
    finally { setBusy(false); }
  }
  return <div className="record-interaction">
    {trainingModules.includes(record.module_id) && <div className="completion-line"><button className="outline-button" disabled={busy || complete || !active} onClick={() => save("completion")}><Check size={15} />{complete ? "Completed by you" : "Mark my step complete"}</button>{isManager && <small>{entries.filter(item => item.kind === "completion").length} recorded completions</small>}</div>}
    {record.module_id === "culture.surveys" && <div className="survey-response"><p>Rate this statement from 1 (strongly disagree) to 5 (strongly agree). Responses are identifiable and visible to managers.</p><form onSubmit={event => { event.preventDefault(); const form = event.currentTarget, fields = new FormData(form); save("rating", String(fields.get("body") || "").trim(), Number(fields.get("rating")), form); }}><label>My rating<select name="rating" defaultValue={rating?.value || 3} disabled={!active || busy}>{[1,2,3,4,5].map(value => <option value={value} key={value}>{value}</option>)}</select></label><label>Optional feedback<textarea name="body" maxLength={2000} defaultValue={rating?.body || ""} disabled={!active || busy} /></label><button className="primary-button" disabled={!active || busy}>{rating ? "Update my response" : "Submit response"}</button></form>{isManager && <p className="survey-summary">{ratings.length} loaded responses{ratings.length ? ` · Average ${(ratings.reduce((sum, item) => sum + item.value, 0) / ratings.length).toFixed(1)}/5` : ""}</p>}</div>}
    <button className="discussion-toggle" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}><MessageSquare size={15} />Discussion · {comments.length}<ChevronDown size={15} /></button>
    {expanded && <div className="record-discussion"><div className="comment-list">{comments.map(comment => <article key={comment.id}><strong>{employees.find(person => person.id === comment.employee_id)?.display_name || "Employee"}</strong><time>{new Date(comment.created_at).toLocaleString()}</time><p>{comment.body}</p></article>)}{!comments.length && <p className="muted-copy">Start the conversation.</p>}</div>{active && <form onSubmit={event => { event.preventDefault(); const form = event.currentTarget; save("comment", String(new FormData(form).get("body") || "").trim(), null, form); }}><label className="field"><span>Reply</span><textarea name="body" required maxLength={2000} disabled={busy} placeholder="Write a reply" /></label><button className="primary-button" disabled={busy}>Post reply</button></form>}</div>}
  </div>;
}
