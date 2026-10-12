import { ArrowDownToLine } from "lucide-react";
import { downloadCsv } from "../lib/reporting.js";

export default function InsightsView({ data, isManager }) {
  const states = [{ id: "todo", label: "To do" }, { id: "in_progress", label: "In progress" }, { id: "done", label: "Completed" }];
  const completed = data.tasks.filter(task => task.status === "done").length;
  const closedHours = data.timeEntries.filter(entry => entry.clocked_out_at).reduce((sum, entry) => sum + Math.max(0, (new Date(entry.clocked_out_at) - new Date(entry.clocked_in_at)) / 3600000), 0);
  const pending = data.leaveRequests.filter(item => item.status === "pending").length + data.shiftRequests.filter(item => item.status === "pending").length;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const overdue = data.tasks.filter(task => task.status !== "done" && task.due_date && new Date(`${task.due_date}T23:59:59`) < today).length;
  const nameFor = id => data.employees.find(employee => employee.id === id)?.display_name || "Unassigned";
  return <section className="insights-view">
    <div className="page-heading"><div><p className="eyebrow">WORKSPACE INSIGHTS</p><h1>{isManager ? "Team overview" : "My overview"}</h1><p className="page-description">Based on the latest loaded records you have permission to see.</p></div><button className="outline-button" onClick={() => downloadCsv("legion-tasks.csv", [["Task", "Owner", "Status", "Due date"], ...data.tasks.map(task => [task.title, nameFor(task.assignee_id), task.status, task.due_date])])}><ArrowDownToLine size={16} /> Export tasks</button></div>
    <div className="insights-stats">{[["Tasks completed", `${completed}/${data.tasks.length}`], ["Recorded hours", closedHours.toFixed(1)], ["Pending requests", pending], ["Overdue tasks", overdue]].map(([label, value]) => <article className="card insight-stat" key={label}><span>{label}</span><strong>{value}</strong></article>)}</div>
    <div className="insights-panels"><article className="card panel-card"><h2>Task progress</h2><p className="muted-copy">Status across your visible task board.</p><div className="metric-bars">{states.map(state => { const count = data.tasks.filter(task => task.status === state.id).length; return <div key={state.id}><span>{state.label}</span><strong>{count}</strong><meter min="0" max={Math.max(1, data.tasks.length)} value={count} aria-label={`${state.label}: ${count} tasks`} /></div>; })}</div></article>
      <article className="card panel-card"><h2>Attendance report</h2><p className="muted-copy">Export the loaded clock records, with hours for completed shifts.</p><button className="outline-button" onClick={() => downloadCsv("legion-attendance.csv", [["Employee", "Clock in", "Clock out", "Hours"], ...data.timeEntries.map(entry => [nameFor(entry.employee_id), entry.clocked_in_at, entry.clocked_out_at || "Open", entry.clocked_out_at ? Math.max(0, (new Date(entry.clocked_out_at) - new Date(entry.clocked_in_at)) / 3600000).toFixed(2) : ""])])}><ArrowDownToLine size={16} /> Export attendance</button><p className="muted-copy report-scope">{data.timeEntries.length} loaded records. Open shifts are excluded from the recorded-hours total.</p></article></div>
  </section>;
}
