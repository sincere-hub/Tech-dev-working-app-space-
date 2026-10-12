import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  Bell,
  CalendarDays,
  Check,
  CheckCheck,
  Clock3,
  FileText,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  Megaphone,
  Menu,
  Plus,
  ShieldCheck,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { supabase, supabaseConfigured } from "./lib/supabase.js";

const navigation = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "tasks", label: "My tasks", icon: CheckCheck },
  { id: "attendance", label: "Time & attendance", icon: Clock3 },
  { id: "leave", label: "Leave & schedule", icon: CalendarDays },
  { id: "payslips", label: "Payslips", icon: FileText },
];
const managerNavigation = { id: "manager", label: "Manager tools", icon: Users };
const requestTypes = {
  annual: "Annual leave",
  personal: "Personal day",
  sick: "Sick leave",
  unpaid: "Unpaid leave",
};
const shiftTemplates = [
  { label: "Morning", start: "08:00", end: "16:00" },
  { label: "Day", start: "09:00", end: "17:00" },
  { label: "Late", start: "10:00", end: "18:00" },
  { label: "Evening", start: "12:00", end: "20:00" },
];

function getErrorMessage(error) {
  return error?.message || "Something went wrong. Please try again.";
}

function dateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDate(value, options = { month: "short", day: "numeric" }) {
  if (!value) return "No date set";
  const date = typeof value === "string" && value.length === 10 ? new Date(`${value}T12:00:00`) : new Date(value);
  return new Intl.DateTimeFormat("en-US", options).format(date);
}

function formatDateRange(start, end) {
  const full = { month: "short", day: "numeric", year: "numeric" };
  return start === end ? formatDate(start, full) : `${formatDate(start, full)} – ${formatDate(end, full)}`;
}

function formatTime(value) {
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function formatDuration(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map(value => String(value).padStart(2, "0")).join(":");
}

function weekdaysBetween(start, end) {
  let days = 0;
  const current = new Date(`${start}T12:00:00`);
  const last = new Date(`${end}T12:00:00`);
  while (current <= last) {
    if (current.getDay() !== 0 && current.getDay() !== 6) days += 1;
    current.setDate(current.getDate() + 1);
  }
  return days;
}

function getWeekRange(date = new Date()) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  return { start, end };
}

function Brand({ compact = false }) {
  return (
    <a className={`brand${compact ? " brand-compact" : ""}`} href="/" aria-label="Legion home">
      <BrandMark />
      <span className="brand-wordmark">Legion<span>Workforce</span></span>
    </a>
  );
}

function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <svg viewBox="0 0 40 40" focusable="false">
        <path d="M8 31H32" fill="none" stroke="#f3ead4" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M12 27V20M20 27V14M28 27V9" fill="none" stroke="#f3ead4" strokeWidth="3.4" strokeLinecap="round" />
        <path d="M20 27V14" fill="none" stroke="#d7ab65" strokeWidth="3.4" strokeLinecap="round" />
      </svg>
    </span>
  );
}

function ConfigScreen() {
  return (
    <main className="setup-screen">
      <section className="setup-card">
        <Brand />
        <span className="setup-icon"><ShieldCheck size={22} /></span>
        <p className="eyebrow">Secure workspace setup</p>
        <h1>Connect your company workspace</h1>
        <p className="body-copy">Add the Supabase project URL and publishable key to your local environment to enable secure sign-in and shared employee data.</p>
        <ol className="setup-steps">
          <li>Copy <code>.env.example</code> to <code>.env.local</code>.</li>
          <li>Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code>.</li>
          <li>Run <code>supabase/schema.sql</code> in the Supabase SQL Editor.</li>
          <li>Restart the Vite development server.</li>
        </ol>
        <p className="security-note">Only use a Supabase publishable/anon key in the browser. Never add a service-role key to a <code>VITE_</code> variable.</p>
      </section>
    </main>
  );
}

function AuthScreen() {
  const [mode, setMode] = useState("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (mode === "signup") {
        const { data, error: authError } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { display_name: name.trim() } },
        });
        if (authError) throw authError;
        if (!data.session) setMessage("Check your work email for a confirmation link to finish creating your account.");
      } else {
        const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
        if (authError) throw authError;
      }
    } catch (authError) {
      setError(getErrorMessage(authError));
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword() {
    if (!email) {
      setError("Enter your work email first so we know where to send the reset link.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
      if (resetError) throw resetError;
      setMessage("If an account exists for that email, a password reset link is on its way.");
    } catch (resetError) {
      setError(getErrorMessage(resetError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-screen">
      <header className="auth-header"><Brand /><span><ShieldCheck size={15} /> Secure employee access</span></header>
      <section className="auth-card">
        <div className="auth-symbol"><BrandMark /></div>
        <p className="eyebrow">{mode === "signup" ? "Welcome to Legion" : "Your work, in good company"}</p>
        <h1>{mode === "signup" ? "Create your account" : "Welcome back"}</h1>
        <p className="body-copy">{mode === "signup" ? "Use an email address you can access to create your employee account." : "Sign in to your secure employee workspace."}</p>
        <form className="form-stack" onSubmit={submit}>
          {mode === "signup" && <label className="field"><span>Full name</span><input required autoComplete="name" value={name} onChange={event => setName(event.target.value)} placeholder="Your name" /></label>}
          <label className="field"><span>Work email</span><input required type="email" autoComplete="username" value={email} onChange={event => setEmail(event.target.value)} placeholder="you@company.com" /></label>
          <label className="field"><span>Password</span><input required type="password" minLength={8} autoComplete={mode === "signup" ? "new-password" : "current-password"} value={password} onChange={event => setPassword(event.target.value)} placeholder={mode === "signup" ? "At least 8 characters" : "Your password"} /></label>
          {mode === "signin" && <button className="text-link forgot-link" type="button" onClick={resetPassword} disabled={busy}>Forgot your password?</button>}
          {error && <p className="form-error" role="alert">{error}</p>}
          {message && <p className="form-success" role="status">{message}</p>}
          <button className="primary-button full-button" type="submit" disabled={busy}>
            {busy ? <LoaderCircle className="spin" size={16} /> : null}
            {mode === "signup" ? "Create employee account" : "Sign in securely"}
          </button>
        </form>
        <p className="auth-switch">
          {mode === "signup" ? "Already have an account?" : "New to your company workspace?"}{" "}
          <button className="text-link" onClick={() => { setMode(mode === "signup" ? "signin" : "signup"); setError(""); setMessage(""); }}>
            {mode === "signup" ? "Sign in" : "Create account"}
          </button>
        </p>
        <p className="auth-footnote">New accounts start with employee permissions. Your company administrator can grant manager access.</p>
      </section>
      <footer className="auth-footer">LEGION WORKFORCE <span>·</span> PEOPLE OPERATIONS, IN SYNC</footer>
    </main>
  );
}

function PasswordRecovery({ onComplete }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      onComplete();
    } catch (updateError) {
      setError(getErrorMessage(updateError));
    } finally {
      setBusy(false);
    }
  }
  return <main className="auth-screen"><header className="auth-header"><Brand /><span><ShieldCheck size={15} /> Secure employee access</span></header><section className="auth-card"><div className="auth-symbol"><BrandMark /></div><p className="eyebrow">ACCOUNT SECURITY</p><h1>Choose a new password</h1><p className="body-copy">Set a new password for your Legion Workforce account.</p><form className="form-stack" onSubmit={submit}><Field label="New password"><input required minLength={8} autoComplete="new-password" type="password" value={password} onChange={event => setPassword(event.target.value)} placeholder="At least 8 characters" /></Field>{error && <p className="form-error" role="alert">{error}</p>}<button className="primary-button full-button" disabled={busy}>{busy ? <LoaderCircle className="spin" size={16} /> : null}Update password</button></form></section><footer className="auth-footer">LEGION WORKFORCE <span>·</span> PEOPLE OPERATIONS, IN SYNC</footer></main>;
}

function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [data, setData] = useState({ employees: [], tasks: [], announcements: [], timeEntries: [], shifts: [], leaveRequests: [], shiftRequests: [], payslips: [] });
  const [activeView, setActiveView] = useState("overview");
  const [loading, setLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [now, setNow] = useState(Date.now());
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const isManager = profile && ["manager", "admin"].includes(profile.role);
  const visibleNavigation = isManager ? [...navigation, managerNavigation] : navigation;
  const today = dateKey(new Date(now));
  const userId = session?.user?.id;

  const loadWorkspace = useCallback(async user => {
    if (!user) return;
    setDataLoading(true);
    setError("");
    try {
      const results = await Promise.all([
        supabase.from("employees").select("id,display_name,job_title,role").order("display_name"),
        supabase.from("tasks").select("*").order("due_date", { ascending: true, nullsFirst: false }).order("created_at", { ascending: false }),
        supabase.from("announcements").select("*, author:employees!announcements_author_id_fkey(display_name)").order("created_at", { ascending: false }).limit(40),
        supabase.from("time_entries").select("*").order("clocked_in_at", { ascending: false }).limit(300),
        supabase.from("shifts").select("*, employee:employees!shifts_employee_id_fkey(display_name)").order("starts_at"),
        supabase.from("leave_requests").select("*, employee:employees!leave_requests_employee_id_fkey(display_name)").order("created_at", { ascending: false }),
        supabase.from("shift_change_requests").select("*, employee:employees!shift_change_requests_employee_id_fkey(display_name), shift:shifts!shift_change_requests_shift_id_fkey(starts_at,ends_at,location)").order("created_at", { ascending: false }),
        supabase.from("payslips").select("*").order("period_start", { ascending: false }),
      ]);
      const failure = results.find(result => result.error)?.error;
      if (failure) throw failure;
      const [employees, tasks, announcements, timeEntries, shifts, leaveRequests, shiftRequests, payslips] = results.map(result => result.data);
      const employeeProfile = employees.find(employee => employee.id === user.id);
      if (!employeeProfile) throw new Error("Your employee profile is still being created. Refresh in a moment, or ask your administrator for help.");
      setProfile(employeeProfile);
      setData({ employees, tasks, announcements, timeEntries, shifts, leaveRequests, shiftRequests, payslips });
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setDataLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!supabaseConfigured) return undefined;
    let live = true;
    supabase.auth.getSession().then(({ data: authData, error: sessionError }) => {
      if (!live) return;
      if (sessionError) setError(getErrorMessage(sessionError));
      setSession(authData?.session || null);
      if (!authData?.session) setLoading(false);
    }).catch(sessionError => {
      if (live) { setError(getErrorMessage(sessionError)); setLoading(false); }
    });
    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === "PASSWORD_RECOVERY") setPasswordRecovery(true);
      setSession(nextSession);
      if (!nextSession) {
        setProfile(null);
        setData({ employees: [], tasks: [], announcements: [], timeEntries: [], shifts: [], leaveRequests: [], shiftRequests: [], payslips: [] });
        setLoading(false);
      }
    });
    return () => {
      live = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session?.user) return;
    let live = true;
    setLoading(true);
    loadWorkspace(session.user).finally(() => { if (live) setLoading(false); });
    const channel = supabase.channel(`workspace-${session.user.id}`)
      .on("postgres_changes", { event: "*", schema: "public" }, () => loadWorkspace(session.user))
      .subscribe();
    return () => {
      live = false;
      supabase.removeChannel(channel);
    };
  }, [session?.user?.id, loadWorkspace]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(""), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const mutate = useCallback(async operation => {
    setError("");
    try {
      const result = await operation();
      if (result?.error) throw result.error;
      await loadWorkspace(session.user);
      return result?.data ?? true;
    } catch (operationError) {
      setError(getErrorMessage(operationError));
      return null;
    }
  }, [loadWorkspace, session?.user]);

  const openEntry = data.timeEntries.find(entry => entry.employee_id === userId && !entry.clocked_out_at);
  const personalTasks = data.tasks.filter(task => task.assignee_id === userId);
  const week = getWeekRange(new Date(now));
  const weeklySeconds = data.timeEntries
    .filter(entry => entry.employee_id === userId && new Date(entry.clocked_in_at) >= week.start && new Date(entry.clocked_in_at) < week.end)
    .reduce((sum, entry) => {
      const end = entry.clocked_out_at ? new Date(entry.clocked_out_at).getTime() : now;
      return sum + Math.max(0, Math.floor((end - new Date(entry.clocked_in_at).getTime()) / 1000));
    }, 0);
  const todaySeconds = data.timeEntries
    .filter(entry => entry.employee_id === userId && entry.clocked_out_at && dateKey(new Date(entry.clocked_in_at)) === today)
    .reduce((sum, entry) => sum + Math.max(0, Math.floor((new Date(entry.clocked_out_at).getTime() - new Date(entry.clocked_in_at).getTime()) / 1000)), 0);
  const employeeShifts = data.shifts.filter(shift => shift.employee_id === userId && new Date(shift.ends_at) >= new Date(today));
  const myLeaveRequests = data.leaveRequests.filter(request => request.employee_id === userId);
  const myShiftRequests = data.shiftRequests.filter(request => request.employee_id === userId);
  const pendingCount = myLeaveRequests.filter(request => request.status === "pending").length;
  const completedTasks = personalTasks.filter(task => task.status === "done").length;
  const completedPercent = personalTasks.length ? Math.round(completedTasks / personalTasks.length * 100) : 0;

  async function toggleClock() {
    const result = await mutate(() => supabase.rpc(openEntry ? "clock_out" : "clock_in"));
    if (result) setToast(openEntry ? "You’re clocked out. Have a restful evening." : "You’re clocked in. Have a productive day.");
  }

  async function updateTask(task, status) {
    const result = await mutate(() => supabase.from("tasks").update({ status }).eq("id", task.id));
    if (result) setToast("Task progress saved.");
  }

  async function submitTask(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const result = await mutate(() => supabase.from("tasks").insert({
      title: String(values.get("title")).trim(),
      description: String(values.get("description") || "").trim(),
      assignee_id: String(values.get("assignee")),
      created_by: session.user.id,
      due_date: values.get("due") || null,
      priority: String(values.get("priority")),
    }));
    if (result) { form.reset(); setToast("Task assigned successfully."); }
  }

  async function submitAnnouncement(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const result = await mutate(() => supabase.from("announcements").insert({
      title: String(values.get("title")).trim(),
      body: String(values.get("body")).trim(),
      author_id: session.user.id,
    }));
    if (result) { form.reset(); setToast("Your update has been shared with the team."); }
  }

  async function submitLeave(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const start = String(values.get("start"));
    const end = String(values.get("end"));
    if (end < start) { setError("The last day of leave must be on or after the first day."); return; }
    const days = weekdaysBetween(start, end);
    if (!days) { setError("Select at least one weekday for a leave request."); return; }
    const overlaps = myLeaveRequests.some(request => request.status !== "declined" && start <= request.end_date && end >= request.start_date);
    if (overlaps) { setError("Those dates overlap an existing pending or approved leave request."); return; }
    const result = await mutate(() => supabase.rpc("submit_leave_request", {
      p_leave_type: String(values.get("type")),
      p_start_date: start,
      p_end_date: end,
      p_note: String(values.get("note") || "").trim(),
    }));
    if (result) { form.reset(); setToast("Your leave request was sent to your manager."); }
  }

  async function submitShiftRequest(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const shift = employeeShifts.find(item => item.id === values.get("shift"));
    const template = shiftTemplates.find(item => item.label === values.get("template"));
    if (!shift || !template) { setError("Choose a scheduled shift and the new shift time."); return; }
    if (myShiftRequests.some(request => request.shift_id === shift.id && request.status === "pending")) {
      setError("You already have a pending request for that scheduled shift.");
      return;
    }
    const startDate = dateKey(new Date(shift.starts_at));
    const result = await mutate(() => supabase.from("shift_change_requests").insert({
      employee_id: session.user.id,
      shift_id: shift.id,
      requested_starts_at: new Date(`${startDate}T${template.start}:00`).toISOString(),
      requested_ends_at: new Date(`${startDate}T${template.end}:00`).toISOString(),
      reason: String(values.get("reason")).trim(),
    }));
    if (result) { form.reset(); setToast("Your shift-change request was sent to your manager."); }
  }

  async function reviewRequest(kind, id, status) {
    const procedure = kind === "leave" ? "review_leave_request" : "review_shift_change_request";
    const result = await mutate(() => supabase.rpc(procedure, { p_request_id: id, p_status: status }));
    if (result) setToast(`Request ${status}.`);
  }

  async function submitShift(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const employeeId = String(values.get("employee"));
    const start = String(values.get("starts"));
    const template = shiftTemplates.find(item => item.label === values.get("template"));
    if (!employeeId || !start || !template) { setError("Choose an employee, date and shift."); return; }
    const result = await mutate(() => supabase.from("shifts").insert({
      employee_id: employeeId,
      starts_at: new Date(`${start}T${template.start}:00`).toISOString(),
      ends_at: new Date(`${start}T${template.end}:00`).toISOString(),
      location: String(values.get("location")).trim() || "Workplace",
    }));
    if (result) { form.reset(); setToast("Shift added to the employee schedule."); }
  }

  async function submitPayslip(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const gross = Number(values.get("gross"));
    const deductions = Number(values.get("deductions"));
    if (deductions > gross) { setError("Deductions cannot be greater than gross pay."); return; }
    const result = await mutate(() => supabase.from("payslips").insert({
      employee_id: String(values.get("employee")),
      period_start: String(values.get("period_start")),
      period_end: String(values.get("period_end")),
      gross_pay: gross,
      deductions,
    }));
    if (result) { form.reset(); setToast("Payslip published to the employee account."); }
  }

  async function downloadPayslip(payslip) {
    const { jsPDF } = await import("jspdf");
    const employee = data.employees.find(item => item.id === payslip.employee_id);
    const pdf = new jsPDF();
    pdf.setTextColor(29, 59, 45);
    pdf.setFontSize(22);
    pdf.text("LEGION WORKFORCE", 20, 25);
    pdf.setTextColor(30, 40, 34);
    pdf.setFontSize(15);
    pdf.text("PAY STATEMENT", 20, 40);
    pdf.setFontSize(10);
    pdf.setTextColor(112, 124, 115);
    pdf.text("Confidential employee payroll statement", 20, 48);
    pdf.setDrawColor(222, 229, 222);
    pdf.line(20, 56, 190, 56);
    pdf.setTextColor(30, 40, 34);
    pdf.text(`Employee: ${employee?.display_name || "Employee"}`, 20, 69);
    pdf.text(`Pay period: ${formatDateRange(payslip.period_start, payslip.period_end)}`, 20, 78);
    pdf.line(20, 87, 190, 87);
    const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
    pdf.text("Gross pay", 20, 102);
    pdf.text(currency.format(payslip.gross_pay), 190, 102, { align: "right" });
    pdf.text("Deductions", 20, 112);
    pdf.text(`−${currency.format(payslip.deductions)}`, 190, 112, { align: "right" });
    pdf.setDrawColor(222, 229, 222);
    pdf.line(20, 120, 190, 120);
    pdf.setFont("helvetica", "bold");
    pdf.text("Take-home pay", 20, 132);
    pdf.text(currency.format(Number(payslip.gross_pay) - Number(payslip.deductions)), 190, 132, { align: "right" });
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(112, 124, 115);
    pdf.text("Issued by your employer through Legion Workforce.", 20, 154);
    pdf.save(`legion-payslip-${payslip.period_start}.pdf`);
  }

  async function signOut() {
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) setError(getErrorMessage(signOutError));
  }

  if (!supabaseConfigured) return <ConfigScreen />;
  if (loading) return <div className="full-loader"><Brand /><LoaderCircle className="spin" size={23} /><span>Connecting to your workspace…</span></div>;
  if (!session) return <AuthScreen />;
  if (passwordRecovery) return <PasswordRecovery onComplete={() => { setPasswordRecovery(false); setToast("Your password has been updated."); }} />;

  const taskSections = isManager ? data.tasks : personalTasks;
  const visibleTasks = activeView === "overview" ? personalTasks.slice(0, 5) : taskSections;
  const announcements = data.announcements;
  const displayName = profile?.display_name || session?.user?.email?.split("@")[0] || "Employee";
  const employeeRequests = data.leaveRequests.filter(request => isManager || request.employee_id === userId);
  const employeeShiftRequests = data.shiftRequests.filter(request => isManager || request.employee_id === userId);
  const upcomingShifts = data.shifts.filter(shift => isManager || shift.employee_id === userId);
  const heading = visibleNavigation.find(item => item.id === activeView)?.label || "Overview";
  const firstName = displayName.split(" ")[0];

  return (
    <div className="app-shell">
      <aside className={`sidebar${mobileMenuOpen ? " sidebar-open" : ""}`}>
        <Brand />
        <p className="nav-caption">WORKSPACE</p>
        <nav className="side-nav" aria-label="Main navigation">
          {visibleNavigation.map(item => <NavItem key={item.id} item={item} active={activeView === item.id} onClick={() => { setActiveView(item.id); setMobileMenuOpen(false); }} />)}
        </nav>
        <div className="sidebar-spacer" />
        <div className="sidebar-help"><span className="help-icon"><Sparkles size={16} /></span><strong>People, in sync.</strong><p>Your company workspace for a better workday.</p></div>
        <div className="profile-card"><div className="avatar">{initials(displayName)}</div><div className="profile-copy"><strong>{displayName}</strong><span>{profile?.job_title || "Employee"}{isManager ? " · Manager" : ""}</span></div><button className="icon-quiet" title="Sign out" aria-label="Sign out" onClick={signOut}><LogOut size={16} /></button></div>
      </aside>
      {mobileMenuOpen && <button className="scrim" aria-label="Close menu" onClick={() => setMobileMenuOpen(false)} />}
      <main className="main-area">
        <header className="topbar">
          <div className="topbar-left"><button className="icon-button mobile-menu-button" aria-label="Open menu" onClick={() => setMobileMenuOpen(true)}><Menu size={18} /></button><div className="mobile-brand"><Brand compact /></div><div className="breadcrumbs">Workspace <span>/</span> <strong>{heading}</strong></div></div>
          <div className="topbar-right"><span className="date-chip"><CalendarDays size={15} />{formatDate(new Date(now), { weekday: "short", month: "short", day: "numeric" })}</span><div className="top-avatar">{initials(displayName)}</div></div>
        </header>
        <div className="page-content">
          {error && <div className="error-banner" role="alert"><span>{error}</span>{session && <button className="retry-action" onClick={() => loadWorkspace(session.user)}>Retry</button>}<button onClick={() => setError("")} aria-label="Dismiss error"><X size={16} /></button></div>}
          {dataLoading && <div className="sync-banner"><LoaderCircle className="spin" size={14} /> Syncing the latest workspace data…</div>}
          {activeView === "overview" && <Overview
            name={firstName}
            tasks={visibleTasks}
            allTaskCount={personalTasks.length}
            completed={completedTasks}
            percent={completedPercent}
            openEntry={openEntry}
            seconds={todaySeconds}
            announcements={announcements.slice(0, 3)}
            payslips={data.payslips.filter(slip => slip.employee_id === userId).slice(0, 1)}
            timeEntries={data.timeEntries.filter(entry => entry.employee_id === userId)}
            onClock={toggleClock}
            onTask={updateTask}
            onView={setActiveView}
            onDownload={downloadPayslip}
          />}
          {activeView === "tasks" && <TasksView tasks={taskSections} isManager={isManager} employees={data.employees} employeeId={userId} onTask={updateTask} onSubmit={submitTask} />}
          {activeView === "attendance" && <AttendanceView entries={isManager ? data.timeEntries : data.timeEntries.filter(entry => entry.employee_id === userId)} employees={data.employees} employeeId={userId} openEntry={openEntry} seconds={todaySeconds} weeklySeconds={weeklySeconds} onClock={toggleClock} />}
          {activeView === "leave" && <LeaveView isManager={isManager} employeeId={userId} requests={employeeRequests} shiftRequests={employeeShiftRequests} shifts={upcomingShifts} employees={data.employees} onLeave={submitLeave} onShiftRequest={submitShiftRequest} onReview={reviewRequest} onShift={submitShift} />}
          {activeView === "payslips" && <PayslipsView isManager={isManager} payslips={data.payslips.filter(slip => isManager || slip.employee_id === userId)} employees={data.employees} employeeId={userId} onDownload={downloadPayslip} onCreate={submitPayslip} />}
          {activeView === "manager" && isManager && <ManagerView tasks={data.tasks} announcements={announcements} employees={data.employees} requests={data.leaveRequests} shiftRequests={data.shiftRequests} shifts={data.shifts} onTask={submitTask} onAnnouncement={submitAnnouncement} onReview={reviewRequest} onShift={submitShift} onView={setActiveView} />}
        </div>
      </main>
      <nav className="mobile-nav" aria-label="Mobile navigation">
        {visibleNavigation.slice(0, 5).map(item => <NavItem key={item.id} item={item} active={activeView === item.id} onClick={() => setActiveView(item.id)} mobile />)}
        {isManager && <NavItem item={managerNavigation} active={activeView === "manager"} onClick={() => setActiveView("manager")} mobile />}
      </nav>
      {toast && <div className="toast" role="status"><Check size={16} />{toast}</div>}
    </div>
  );
}

function initials(name) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join("").toUpperCase();
}

function NavItem({ item, active, onClick, mobile = false }) {
  const Icon = item.icon;
  return <button className={`${mobile ? "mobile-nav-item" : "side-nav-item"}${active ? " active" : ""}`} onClick={onClick}><Icon size={18} /><span>{mobile ? item.id === "overview" ? "Home" : item.id === "attendance" ? "Time" : item.id === "payslips" ? "Pay" : item.id === "manager" ? "Manage" : item.id === "leave" ? "Leave" : "Tasks" : item.label}</span></button>;
}

function PageHeading({ eyebrow, title, description, action }) {
  return <div className="page-heading"><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h1>{title}</h1><p className="page-description">{description}</p></div>{action}</div>;
}

function Card({ children, className = "", title, subtitle, action }) {
  return <section className={`card panel-card ${className}`}><div className="panel-heading"><div>{title && <h2>{title}</h2>}{subtitle && <p>{subtitle}</p>}</div>{action}</div>{children}</section>;
}

function ClockCard({ openEntry, seconds, onClock, compact = false }) {
  const currentSeconds = seconds + (openEntry ? Math.max(0, Math.floor((Date.now() - new Date(openEntry.clocked_in_at).getTime()) / 1000)) : 0);
  return <section className={`clock-card${compact ? " clock-card-compact" : ""}`}><div className="clock-orbit" /><div className="clock-card-top"><div><p className="clock-eyebrow">YOUR WORKDAY</p><strong className="clock-time">{formatTime(Date.now())}</strong><span className="clock-date">{formatDate(new Date(), { weekday: "long", month: "long", day: "numeric" })}</span></div><span className={`clock-state${openEntry ? " clock-state-live" : ""}`}><i />{openEntry ? "Clocked in" : "Not clocked in"}</span></div><div className="clock-card-bottom"><div><span className="clock-hours-label">Hours worked today</span><strong className="clock-hours">{formatDuration(currentSeconds)}</strong></div><button className="clock-action" onClick={onClock}>{openEntry ? "Clock out" : "Clock in"} <ArrowRight size={15} /></button></div></section>;
}

function Overview({ name, tasks, allTaskCount, completed, percent, openEntry, seconds, announcements, payslips, timeEntries, onClock, onTask, onView, onDownload }) {
  const progressLabel = allTaskCount ? `${completed} of ${allTaskCount} completed` : "No tasks assigned yet";
  return <>
    <PageHeading eyebrow="YOUR WORKSPACE" title={`Good ${new Date().getHours() < 12 ? "morning" : "afternoon"}, ${name}`} description="Your day, your team, and what’s next — all together." action={<span className="live-badge"><i /> Secure workspace</span>} />
    <div className="dashboard-grid">
      <div className="dashboard-main">
        <ClockCard openEntry={openEntry} seconds={seconds} onClock={onClock} />
        <Card title="Your tasks" subtitle="A clear next step makes a good workday." action={<button className="text-action" onClick={() => onView("tasks")}>All tasks <ArrowRight size={14} /></button>}>
          {tasks.length ? <div className="task-list">{tasks.map(task => <TaskRow key={task.id} task={task} onChange={onTask} />)}</div> : <EmptyState icon={CheckCheck} title="Your task list is clear" text="New assignments from your team will show up here." />}
          {allTaskCount > 0 && <div className="progress-section"><div className="progress-copy"><span>Task progress</span><strong>{progressLabel}</strong></div><div className="progress-track"><span style={{ width: `${percent}%` }} /></div></div>}
        </Card>
        <Card title="This week" subtitle="Your recorded time at a glance." action={<button className="text-action" onClick={() => onView("attendance")}>Time records <ArrowRight size={14} /></button>}>
          <WeeklyHours entries={timeEntries} />
        </Card>
      </div>
      <div className="dashboard-aside">
        <Card title="Team updates" subtitle="The latest from around your company." action={<button className="round-icon" aria-label="Announcements"><Bell size={16} /></button>}>
          {announcements.length ? <div className="announcement-list">{announcements.map(item => <AnnouncementRow key={item.id} announcement={item} />)}</div> : <EmptyState icon={Megaphone} title="Nothing new yet" text="Company announcements will appear here." />}
        </Card>
        <Card title="Latest payslip" subtitle="Your most recent pay statement.">
          {payslips[0] ? <PayslipPreview payslip={payslips[0]} onDownload={onDownload} /> : <EmptyState icon={FileText} title="No payslips yet" text="Your company has not published a pay statement." />}
        </Card>
      </div>
    </div>
  </>;
}

function TaskRow({ task, employee, onChange, managerMode = false }) {
  const statusLabel = task.status === "done" ? "Done" : task.status === "in_progress" ? "In progress" : "To do";
  return <div className={`task-row${task.status === "done" ? " task-done" : ""}`}>
    <button className={`task-status-icon status-${task.status}`} aria-label={`Set ${task.title} status`} onClick={() => onChange(task, task.status === "done" ? "todo" : "done")}>{task.status === "done" ? <Check size={13} /> : task.status === "in_progress" ? <span className="status-dot" /> : null}</button>
    <div className="task-copy"><strong>{task.title}</strong><span>{task.due_date ? `Due ${formatDate(task.due_date)}` : "No due date"}{managerMode && employee ? ` · ${employee.display_name}` : ""}</span></div>
    {managerMode && <span className={`priority-pill${task.priority === "high" ? " priority-high" : ""}`}>{task.priority}</span>}
    {!managerMode && <label className="task-select"><span className="sr-only">Task status</span><select aria-label={`Progress for ${task.title}`} value={task.status} onChange={event => onChange(task, event.target.value)}><option value="todo">To do</option><option value="in_progress">In progress</option><option value="done">Done</option></select><span>{statusLabel}</span></label>}
  </div>;
}

function WeeklyHours({ entries = [] }) {
  const { start } = getWeekRange();
  const today = dateKey();
  const dayEntries = Array.from({ length: 5 }, (_, index) => {
    const day = new Date(start);
    day.setDate(day.getDate() + index);
    const key = dateKey(day);
    const seconds = entries.filter(entry => dateKey(new Date(entry.clocked_in_at)) === key).reduce((sum, entry) => {
      const end = entry.clocked_out_at ? new Date(entry.clocked_out_at).getTime() : Date.now();
      return sum + Math.max(0, Math.floor((end - new Date(entry.clocked_in_at).getTime()) / 1000));
    }, 0);
    return { date: day, seconds };
  });
  const max = Math.max(...dayEntries.map(day => day.seconds), 8 * 60 * 60);
  return <div className="week-chart">{dayEntries.map(day => <div className={`week-day${dateKey(day.date) === today ? " today" : ""}`} key={dateKey(day.date)}><span>{new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(day.date).toUpperCase()}</span><div className="week-day-track"><i style={{ height: `${Math.min(100, day.seconds / max * 100)}%` }} /></div><strong>{day.seconds ? `${Math.floor(day.seconds / 3600)}h ${Math.floor(day.seconds % 3600 / 60)}m` : "—"}</strong></div>)}</div>;
}

function AnnouncementRow({ announcement }) {
  return <article className="announcement-row"><span className="announcement-icon"><Megaphone size={15} /></span><div><strong>{announcement.title}</strong><p>{announcement.body}</p><time>{announcement.author?.display_name || "Company team"} · {formatDate(announcement.created_at, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</time></div></article>;
}

function PayslipPreview({ payslip, onDownload }) {
  const net = Number(payslip.gross_pay) - Number(payslip.deductions);
  return <div className="payslip-preview"><span className="muted-label">TAKE-HOME PAY</span><strong className="pay-total">{new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(net)}</strong><span className="pay-period">{formatDateRange(payslip.period_start, payslip.period_end)}</span><div className="payslip-breakdown"><span>Gross pay <strong>{new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(payslip.gross_pay)}</strong></span><span>Deductions <strong>−{new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(payslip.deductions)}</strong></span></div><button className="outline-button full-button" onClick={() => onDownload(payslip)}><ArrowDownToLine size={15} /> Download statement</button></div>;
}

function EmptyState({ icon: Icon, title, text }) {
  return <div className="empty-state"><span><Icon size={18} /></span><strong>{title}</strong><p>{text}</p></div>;
}

function TasksView({ tasks, isManager, employees, employeeId, onTask, onSubmit }) {
  const assigned = isManager ? tasks : tasks.filter(task => task.assignee_id === employeeId);
  return <>
    <PageHeading eyebrow={isManager ? "TEAM WORK" : "YOUR WORK"} title={isManager ? "Team tasks" : "My tasks"} description={isManager ? "Create clear assignments and follow progress across the team." : "Keep priorities clear and make progress one task at a time."} />
    {isManager && <Card title="Assign a task" subtitle="Choose an owner, set a due date, and get started."><form className="form-grid" onSubmit={onSubmit}><Field label="Task title"><input name="title" required maxLength={160} placeholder="What needs to get done?" /></Field><Field label="Assign to"><select name="assignee" required defaultValue=""><option value="" disabled>Select an employee</option>{employees.map(employee => <option key={employee.id} value={employee.id}>{employee.display_name}</option>)}</select></Field><Field label="Due date"><input name="due" type="date" min={dateKey()} /></Field><Field label="Priority"><select name="priority"><option value="normal">Normal</option><option value="high">High</option></select></Field><Field label="Details"><textarea className="wide-field" name="description" maxLength={1000} placeholder="Add useful context (optional)." /></Field><button className="primary-button form-action" type="submit"><Plus size={15} /> Assign task</button></form></Card>}
    <Card className="spaced-card" title={isManager ? "Team task board" : "Your task list"} subtitle={`${assigned.filter(task => task.status === "done").length} of ${assigned.length} tasks complete`} action={<span className="metric-chip">{assigned.length} tasks</span>}>
      {assigned.length ? <div className="task-list">{assigned.map(task => <TaskRow key={task.id} task={task} employee={employees.find(person => person.id === task.assignee_id)} onChange={onTask} managerMode={isManager} />)}</div> : <EmptyState icon={CheckCheck} title="No tasks here yet" text={isManager ? "Create a task above to get your team moving." : "Your assigned work will appear here."} />}
    </Card>
  </>;
}

function AttendanceView({ entries, employees, employeeId, openEntry, seconds, weeklySeconds, onClock }) {
  const mine = entries.filter(entry => entry.employee_id === employeeId);
  return <>
    <PageHeading eyebrow="TIME & ATTENDANCE" title="Your time" description="Record your workday and review your hours." action={<span className="metric-chip">{formatDuration(weeklySeconds)} this week</span>} />
    <ClockCard openEntry={openEntry} seconds={seconds} onClock={onClock} compact />
    <Card className="spaced-card" title={employees.length > 1 && entries.length > mine.length ? "Team time records" : "Your recent time records"} subtitle="Clock events are stored securely in your company workspace." action={<span className="metric-chip">{entries.length} records</span>}>
      {entries.length ? <div className="table-wrap"><table><thead><tr><th>Employee</th><th>Date</th><th>Clock in</th><th>Clock out</th><th>Duration</th></tr></thead><tbody>{entries.slice(0, 40).map(entry => { const employee = employees.find(person => person.id === entry.employee_id); const end = entry.clocked_out_at ? new Date(entry.clocked_out_at) : new Date(); const duration = Math.max(0, Math.floor((end - new Date(entry.clocked_in_at)) / 1000)); return <tr key={entry.id}><td>{employee?.display_name || "Employee"}</td><td>{formatDate(entry.clocked_in_at, { month: "short", day: "numeric", year: "numeric" })}</td><td>{formatTime(entry.clocked_in_at)}</td><td>{entry.clocked_out_at ? formatTime(entry.clocked_out_at) : <span className="live-badge"><i /> Active</span>}</td><td>{formatDuration(duration)}</td></tr>; })}</tbody></table></div> : <EmptyState icon={Clock3} title="No time records yet" text="Clock in to start recording your workday." />}
    </Card>
  </>;
}

function LeaveView({ isManager, employeeId, requests, shiftRequests, shifts, employees, onLeave, onShiftRequest, onReview, onShift }) {
  const mine = requests.filter(request => request.employee_id === employeeId);
  const myShifts = shifts.filter(shift => shift.employee_id === employeeId && new Date(shift.ends_at) >= new Date());
  const relevantShiftRequests = shiftRequests.filter(request => request.employee_id === employeeId);
  const pending = mine.filter(request => request.status === "pending").length;
  return <>
    <PageHeading eyebrow="PEOPLE & TIME" title={isManager ? "Leave & schedules" : "Leave & schedule"} description={isManager ? "Review team requests, publish shifts, and help people plan ahead." : "Plan time away and keep the next shifts in view."} />
    <div className="stat-grid">
      <Stat label="Available leave" value={isManager ? "—" : "Company policy"} detail={isManager ? "Balances configured by HR" : "Check with your People team"} />
      <Stat label={isManager ? "Requests to review" : "Your pending requests"} value={isManager ? requests.filter(item => item.status === "pending").length + shiftRequests.filter(item => item.status === "pending").length : pending} detail={isManager ? "Leave and shift changes" : "Awaiting manager review"} />
      <Stat label={isManager ? "Scheduled shifts" : "Your upcoming shifts"} value={isManager ? shifts.length : myShifts.length} detail="Published in this workspace" />
    </div>
    {isManager && <Card className="spaced-card" title="Publish a shift" subtitle="Add an upcoming shift to an employee’s shared schedule."><form className="form-grid" onSubmit={onShift}><Field label="Employee"><select name="employee" required defaultValue=""><option value="" disabled>Select an employee</option>{employees.map(employee => <option key={employee.id} value={employee.id}>{employee.display_name}</option>)}</select></Field><Field label="Date"><input name="starts" type="date" min={dateKey()} required /></Field><Field label="Shift"><select name="template">{shiftTemplates.map(shift => <option key={shift.label}>{shift.label}</option>)}</select></Field><Field label="Location"><input name="location" maxLength={120} placeholder="Office, remote, or location" /></Field><button className="primary-button form-action" type="submit"><Plus size={15} /> Publish shift</button></form></Card>}
    <div className="content-columns spaced-card">
      <div className="stack-column">
        {!isManager && <Card title="Request time off" subtitle="Requests need your manager’s approval."><form className="form-grid" onSubmit={onLeave}><Field label="Leave type"><select name="type">{Object.entries(requestTypes).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field><Field label="First day"><input name="start" type="date" min={dateKey()} required /></Field><Field label="Last day"><input name="end" type="date" min={dateKey()} required /></Field><Field label="Note for your manager"><textarea className="wide-field" name="note" maxLength={1000} placeholder="Optional context for your request." /></Field><button className="primary-button form-action" type="submit">Submit leave request <ArrowRight size={15} /></button></form></Card>}
        <Card title={isManager ? "Team time-off requests" : "My leave requests"} subtitle={isManager ? "Approve or decline requests from your team." : "Check your request and approval status."} action={<span className="metric-chip">{requests.length}</span>}>
          {requests.length ? <div className="request-list">{requests.map(request => <RequestRow key={request.id} title={`${isManager ? `${request.employee?.display_name || "Employee"} · ` : ""}${requestTypes[request.leave_type] || request.leave_type}`} details={`${formatDateRange(request.start_date, request.end_date)} · ${weekdaysBetween(request.start_date, request.end_date)} weekdays${request.note ? ` · ${request.note}` : ""}`} status={request.status} isManager={isManager} onReview={status => onReview("leave", request.id, status)} />)}</div> : <EmptyState icon={CalendarDays} title="No leave requests yet" text="Submitted requests will appear here." />}
        </Card>
      </div>
      <div className="stack-column">
        {!isManager && <Card title="Request a shift change" subtitle="Ask your manager to review a different shift time."><form className="form-grid" onSubmit={onShiftRequest}><Field label="Scheduled shift"><select name="shift" required defaultValue="">{myShifts.map(shift => <option key={shift.id} value={shift.id}>{formatDate(shift.starts_at)} · {formatTime(shift.starts_at)}–{formatTime(shift.ends_at)}</option>)}</select></Field><Field label="Requested shift"><select name="template">{shiftTemplates.map(shift => <option key={shift.label} value={shift.label}>{shift.label} · {new Date(`2000-01-01T${shift.start}:00`).toLocaleTimeString("en-US", { hour: "numeric" })}–{new Date(`2000-01-01T${shift.end}:00`).toLocaleTimeString("en-US", { hour: "numeric" })}</option>)}</select></Field><Field label="Reason"><textarea className="wide-field" name="reason" required maxLength={1000} placeholder="Help your manager understand the change." /></Field><button className="primary-button form-action" type="submit">Request shift change <ArrowRight size={15} /></button></form></Card>}
        <Card title={isManager ? "Team shift schedule" : "Upcoming shifts"} subtitle={isManager ? "Published shifts across the team." : "Your published work schedule."} action={<span className="metric-chip">{shifts.length}</span>}>
          {shifts.length ? <div className="shift-list">{shifts.map(shift => <ShiftRow key={shift.id} shift={shift} showEmployee={isManager} />)}</div> : <EmptyState icon={Clock3} title="No shifts scheduled" text={isManager ? "Publish a shift to get a schedule started." : "Your manager has not published shifts yet."} />}
        </Card>
        {!isManager && <Card title="My shift-change requests" subtitle="Requests are not applied until your manager approves them.">{relevantShiftRequests.length ? <div className="request-list">{relevantShiftRequests.map(request => <RequestRow key={request.id} title={formatDate(request.shift?.starts_at)} details={`${formatTime(request.requested_starts_at)} requested · ${request.reason}`} status={request.status} />)}</div> : <EmptyState icon={Clock3} title="No change requests" text="Your shift-change requests will appear here." />}</Card>}
        {isManager && <Card title="Shift-change requests" subtitle="Requests that need a decision.">{shiftRequests.length ? <div className="request-list">{shiftRequests.map(request => <RequestRow key={request.id} title={`${request.employee?.display_name || "Employee"} · ${formatDate(request.shift?.starts_at)}`} details={`${formatTime(request.requested_starts_at)} requested · ${request.reason}`} status={request.status} isManager={isManager} onReview={status => onReview("shift", request.id, status)} />)}</div> : <EmptyState icon={Clock3} title="No shift requests" text="Employee requests for shift changes will appear here." />}</Card>}
      </div>
    </div>
  </>;
}

function RequestRow({ title, details, status, isManager, onReview }) {
  const label = status.charAt(0).toUpperCase() + status.slice(1);
  return <div className="request-row"><div className="request-copy"><strong>{title}</strong><span>{details}</span></div><span className={`request-status request-${status}`}>{label}</span>{isManager && status === "pending" && <div className="request-actions"><button className="approve-button" onClick={() => onReview("approved")}>Approve</button><button className="decline-button" onClick={() => onReview("declined")}>Decline</button></div>}</div>;
}

function ShiftRow({ shift, showEmployee }) {
  return <div className="shift-row"><div className="shift-date"><strong>{formatDate(shift.starts_at, { day: "numeric" })}</strong><span>{formatDate(shift.starts_at, { weekday: "short" })}</span></div><div className="shift-copy"><strong>{formatTime(shift.starts_at)} – {formatTime(shift.ends_at)}</strong><span>{showEmployee ? `${shift.employee?.display_name || "Employee"} · ` : ""}{shift.location}</span></div><span className="shift-label">Scheduled</span></div>;
}

function Stat({ label, value, detail }) {
  return <div className="card stat-card"><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>;
}

function PayslipsView({ isManager, payslips, employees, employeeId, onDownload, onCreate }) {
  const grouped = useMemo(() => payslips.reduce((result, slip) => {
    const year = new Date(`${slip.period_start}T12:00:00`).getFullYear();
    result[year] ||= [];
    result[year].push(slip);
    return result;
  }, {}), [payslips]);
  return <>
    <PageHeading eyebrow="PAY & BENEFITS" title={isManager ? "Payroll statements" : "Payslips"} description={isManager ? "Publish pay statements to employees’ private accounts." : "Your pay statements, available when you need them."} />
    {isManager && <Card title="Publish a payslip" subtitle="The employer supplies the pay values. Legion does not calculate payroll or tax."><form className="form-grid" onSubmit={onCreate}><Field label="Employee"><select name="employee" required defaultValue=""><option value="" disabled>Select an employee</option>{employees.map(employee => <option key={employee.id} value={employee.id}>{employee.display_name}</option>)}</select></Field><Field label="Period starts"><input name="period_start" type="date" required /></Field><Field label="Period ends"><input name="period_end" type="date" required /></Field><Field label="Gross pay (USD)"><input name="gross" type="number" min="0" step="0.01" required /></Field><Field label="Deductions (USD)"><input name="deductions" type="number" min="0" step="0.01" defaultValue="0" required /></Field><button className="primary-button form-action" type="submit"><Plus size={15} /> Publish payslip</button></form></Card>}
    {Object.keys(grouped).length ? Object.entries(grouped).sort(([a], [b]) => Number(b) - Number(a)).map(([year, yearSlips]) => <Card key={year} className="spaced-card" title={year} subtitle={`${yearSlips.length} pay ${yearSlips.length === 1 ? "statement" : "statements"}`}>
      <div className="slip-list">{yearSlips.map(slip => { const person = employees.find(employee => employee.id === slip.employee_id); return <div className="slip-row" key={slip.id}><span className="slip-icon"><FileText size={17} /></span><span className="slip-description"><strong>{formatDate(slip.period_start, { month: "long", year: "numeric" })}</strong><small>{formatDateRange(slip.period_start, slip.period_end)}{isManager ? ` · ${person?.display_name || "Employee"}` : ""}</small></span><span className="slip-net">{new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(slip.gross_pay - slip.deductions)}</span><button className="outline-button small-outline" onClick={() => onDownload(slip)}><ArrowDownToLine size={14} /> PDF</button></div>; })}</div>
    </Card>) : <Card className="spaced-card">{<EmptyState icon={FileText} title="No pay statements yet" text={isManager ? "Publish a statement above when payroll is ready." : "Your company has not published a pay statement."} />}</Card>}
  </>;
}

function ManagerView({ tasks, announcements, employees, requests, shiftRequests, shifts, onTask, onAnnouncement, onReview, onShift, onView }) {
  const openTasks = tasks.filter(task => task.status !== "done").length;
  const pending = requests.filter(item => item.status === "pending").length + shiftRequests.filter(item => item.status === "pending").length;
  return <>
    <PageHeading eyebrow="TEAM OPERATIONS" title="Manager tools" description="Keep people, work, and team communication moving together." action={<span className="live-badge"><ShieldCheck size={14} /> Manager access</span>} />
    <div className="stat-grid"><Stat label="Team members" value={employees.length} detail="Active employee accounts" /><Stat label="Tasks in progress" value={openTasks} detail={`${tasks.filter(task => task.status === "done").length} complete`} /><Stat label="Requests to review" value={pending} detail="Leave and shift requests" /></div>
    <div className="manager-grid spaced-card">
      <div className="stack-column">
        <Card title="Assign a task" subtitle="Make ownership and priorities clear."><form className="form-grid" onSubmit={onTask}><Field label="Task title"><input name="title" required maxLength={160} placeholder="What needs to get done?" /></Field><Field label="Assign to"><select name="assignee" required defaultValue=""><option value="" disabled>Select an employee</option>{employees.map(employee => <option key={employee.id} value={employee.id}>{employee.display_name}</option>)}</select></Field><Field label="Due date"><input name="due" type="date" min={dateKey()} /></Field><Field label="Priority"><select name="priority"><option value="normal">Normal</option><option value="high">High</option></select></Field><Field label="Details"><textarea className="wide-field" name="description" maxLength={1000} placeholder="Add useful context (optional)." /></Field><button className="primary-button form-action" type="submit"><Plus size={15} /> Assign task</button></form></Card>
        <Card title="Team task progress" subtitle="Review ownership and completion across your team." action={<button className="text-action" onClick={() => onView("tasks")}>Task board <ArrowRight size={14} /></button>}>
          {tasks.length ? <div className="task-list">{tasks.slice(0, 8).map(task => <TaskRow key={task.id} task={task} employee={employees.find(employee => employee.id === task.assignee_id)} onChange={onTask} managerMode />)}</div> : <EmptyState icon={CheckCheck} title="No tasks assigned" text="Create the first team task above." />}
        </Card>
      </div>
      <div className="stack-column">
        <Card title="Share a team update" subtitle="Announcements are visible to everyone in the workspace."><form className="form-grid" onSubmit={onAnnouncement}><Field label="Headline"><input name="title" required maxLength={120} placeholder="What should the team know?" /></Field><Field label="Message"><textarea className="wide-field" name="body" required maxLength={2000} placeholder="Share a helpful update, reminder, or notice." /></Field><button className="primary-button form-action" type="submit"><Megaphone size={15} /> Publish update</button></form></Card>
        <Card title="Recent updates" subtitle="Latest company-wide notices.">{announcements.length ? <div className="announcement-list">{announcements.slice(0, 4).map(item => <AnnouncementRow key={item.id} announcement={item} />)}</div> : <EmptyState icon={Megaphone} title="No announcements yet" text="Share an update with your team." />}</Card>
      </div>
    </div>
    <div className="content-columns spaced-card">
      <Card title="Leave requests" subtitle="Review employee time-off requests." action={<span className="metric-chip">{requests.filter(request => request.status === "pending").length} pending</span>}>{requests.length ? <div className="request-list">{requests.map(request => <RequestRow key={request.id} title={`${request.employee?.display_name || "Employee"} · ${requestTypes[request.leave_type] || request.leave_type}`} details={`${formatDateRange(request.start_date, request.end_date)} · ${weekdaysBetween(request.start_date, request.end_date)} weekdays${request.note ? ` · ${request.note}` : ""}`} status={request.status} isManager onReview={status => onReview("leave", request.id, status)} />)}</div> : <EmptyState icon={CalendarDays} title="No leave requests" text="Employee requests will appear here." />}</Card>
      <Card title="Upcoming shifts" subtitle={`${shifts.length} published shifts across the team.`} action={<button className="text-action" onClick={() => onView("leave")}>Schedule <ArrowRight size={14} /></button>}>{shifts.length ? <div className="shift-list">{shifts.slice(0, 6).map(shift => <ShiftRow key={shift.id} shift={shift} showEmployee />)}</div> : <EmptyState icon={Clock3} title="No shifts published" text="Open Leave & schedule to publish shifts." />}</Card>
    </div>
    <div className="spaced-card"><Card title="Shift-change requests" subtitle="Approve requested shift times.">{shiftRequests.length ? <div className="request-list">{shiftRequests.map(request => <RequestRow key={request.id} title={`${request.employee?.display_name || "Employee"} · ${formatDate(request.shift?.starts_at)}`} details={`${formatTime(request.requested_starts_at)} requested · ${request.reason}`} status={request.status} isManager onReview={status => onReview("shift", request.id, status)} />)}</div> : <EmptyState icon={Clock3} title="No shift changes" text="Employee requests will appear here." />}</Card></div>
  </>;
}

function Field({ label, children }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}

export default App;
