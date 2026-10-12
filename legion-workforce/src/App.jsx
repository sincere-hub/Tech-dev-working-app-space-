import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  Bell,
  Boxes,
  CalendarDays,
  Check,
  CheckCheck,
  Clock3,
  Eye,
  EyeOff,
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
import { supabase, supabaseConfigured, ssoDomain, allowSignup } from "./lib/supabase.js";
import WorkplaceSuite from "./components/WorkplaceSuite.jsx";
import NavigationDrawer from "./components/NavigationDrawer.jsx";
import InsightsView from "./components/InsightsView.jsx";
import { safeExternalUrl } from "./lib/reporting.js";

const navigation = [
  { id: "overview", label: "Home", icon: LayoutDashboard },
  { id: "tasks", label: "My tasks", icon: CheckCheck },
  { id: "attendance", label: "Time & attendance", icon: Clock3 },
  { id: "leave", label: "Leave & schedule", icon: CalendarDays },
  { id: "suite", label: "Workplace suite", icon: Boxes },
  { id: "payslips", label: "Payslips", icon: FileText },
  { id: "notices", label: "Company notices", icon: Megaphone },
  { id: "activity", label: "Company activity", icon: Bell },
  { id: "insights", label: "Reports & insights", icon: LayoutDashboard },
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

function isValidEmailAddress(value) {
  const normalized = String(value || "").trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
}

function withTimeout(promiseFactory, timeoutMs = 15000) {
  let timeoutHandle;
  return Promise.race([
    promiseFactory(),
    new Promise((_, reject) => {
      timeoutHandle = window.setTimeout(() => {
        reject(new Error("The workspace is taking too long to respond. Check your Supabase connection and schema."));
      }, timeoutMs);
    }),
  ]).finally(() => {
    if (timeoutHandle) window.clearTimeout(timeoutHandle);
  });
}

function isMissingSchemaError(error) {
  const normalized = [error?.message, error?.details, error?.hint, error?.code].filter(Boolean).join(" ");
  return /could not find the table|does not exist|relation .* does not exist|42P01|42883|PGRST202|PGRST205/i.test(normalized);
}

function dateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isValidDateValue(value) {
  if (!value) return false;
  const date = typeof value === "string" && value.length === 10 ? new Date(`${value}T12:00:00`) : new Date(value);
  return !Number.isNaN(date.getTime());
}

function formatDate(value, options = { month: "short", day: "numeric" }) {
  if (!value || !isValidDateValue(value)) return "No date set";
  const date = typeof value === "string" && value.length === 10 ? new Date(`${value}T12:00:00`) : new Date(value);
  return new Intl.DateTimeFormat("en-US", options).format(date);
}

function formatDateRange(start, end) {
  if (!start || !end || !isValidDateValue(start) || !isValidDateValue(end)) {
    return "No date set";
  }
  const full = { month: "short", day: "numeric", year: "numeric" };
  return start === end ? formatDate(start, full) : `${formatDate(start, full)} – ${formatDate(end, full)}`;
}

function formatTime(value) {
  if (!value || !isValidDateValue(value)) return "—";
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
      <img className="brand-wordmark-image" src="/legion-wordmark.svg" alt="LEGION" width="380" height="74" draggable="false" />
    </a>
  );
}

function BrandMark({ animated = false }) {
  return <span className={`brand-mark${animated ? " is-animated" : ""}`} aria-hidden="true"><img src="/legion-mark.svg" alt="" width="512" height="512" draggable="false" /></span>;
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

function WorkspaceContentLoading({ isOnline }) {
  return (
    <div className="app-shell workspace-content-loading" role="status" aria-label="Loading your workspace">
      <aside className="sidebar" aria-hidden="true">
        <Brand />
        <div className="workspace-skeleton skeleton-nav-heading" />
        <div className="workspace-skeleton-nav">
          {Array.from({ length: 6 }, (_, index) => <div className="workspace-skeleton skeleton-nav-item" key={index} />)}
        </div>
        <div className="sidebar-spacer" />
        <div className="workspace-skeleton skeleton-profile" />
      </aside>
      <main className="main-area" aria-hidden="true">
        <header className="topbar">
          <div className="workspace-skeleton skeleton-breadcrumb" />
          <div className="workspace-skeleton skeleton-avatar" />
        </header>
        <div className={`connection-loader${isOnline ? "" : " is-offline"}`}>
          <span className="connection-emblem"><BrandMark animated /></span>
          <div>
            <strong>{isOnline ? "Connecting to your workspace" : "Waiting for your connection"}</strong>
            <p>{isOnline ? "Getting things ready…" : "Your workspace will reconnect automatically."}</p>
          </div>
        </div>
        <div className="page-content">
          <div className="workspace-skeleton-heading">
            <div className="workspace-skeleton skeleton-heading-kicker" />
            <div className="workspace-skeleton skeleton-heading-title" />
            <div className="workspace-skeleton skeleton-heading-copy" />
          </div>
          <div className="workspace-skeleton-stats">
            {Array.from({ length: 4 }, (_, index) => <div className="workspace-skeleton skeleton-stat" key={index} />)}
          </div>
          <div className="workspace-skeleton-panels">
            <section className="workspace-skeleton skeleton-panel">
              <div className="workspace-skeleton skeleton-panel-title" />
              {Array.from({ length: 4 }, (_, index) => <div className="workspace-skeleton skeleton-list-row" key={index} />)}
            </section>
            <section className="workspace-skeleton skeleton-panel skeleton-panel-secondary">
              <div className="workspace-skeleton skeleton-panel-title" />
              {Array.from({ length: 3 }, (_, index) => <div className="workspace-skeleton skeleton-list-row" key={index} />)}
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}

function StartupScreen({ isOnline }) {
  return (
    <main className={`startup-screen${isOnline ? "" : " startup-offline"}`} role="status" aria-live="polite">
      <div className="startup-emblem"><BrandMark animated /></div>
      <div className="startup-brand">
        <strong>LEGION</strong>
        <span>ONE TEAM. ONE LEGION.</span>
      </div>
      <p>{isOnline ? "Preparing your workspace" : "Waiting for your connection"}</p>
      {!isOnline && <span className="startup-network-note">Your workspace will reconnect automatically.</span>}
    </main>
  );
}

function AuthField({ label, children, action }) {
  return <label className="auth-floating-field">{children}<span>{label}</span>{action}</label>;
}

function AuthScreen() {
  const [mode, setMode] = useState("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    const normalizedEmail = String(email).trim().toLowerCase();
    if (!isValidEmailAddress(normalizedEmail)) {
      setError("Enter a valid work email address before continuing.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (mode === "signup") {
        const { data, error: authError } = await withTimeout(() => supabase.auth.signUp({
          email: normalizedEmail,
          password,
          options: { data: { display_name: name.trim() }, emailRedirectTo: window.location.origin },
        }));
        if (authError) throw authError;
        if (!data.session) setMessage("Check your work email for a confirmation link to finish creating your account.");
      } else {
        const { error: authError } = await withTimeout(() => supabase.auth.signInWithPassword({ email: normalizedEmail, password }));
        if (authError) throw authError;
      }
    } catch (authError) {
      setError(getErrorMessage(authError));
    } finally {
      setBusy(false);
    }
  }

  async function signInWithCompany() {
    setBusy(true); setError("");
    try {
      const { data, error: authError } = await withTimeout(() => supabase.auth.signInWithSSO({ domain: ssoDomain, options: { redirectTo: window.location.origin, skipBrowserRedirect: true } }));
      if (authError) throw authError;
      const target = safeExternalUrl(data?.url);
      if (!target) throw new Error("Company sign-in is unavailable. Contact your administrator.");
      window.location.assign(target);
    } catch (authError) { setError(getErrorMessage(authError)); }
    finally { setBusy(false); }
  }

  async function resetPassword() {
    if (!email) {
      setError("Enter your work email first so we know where to send the reset link.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const { error: resetError } = await withTimeout(() => supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo: window.location.origin }));
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
      <section className="auth-card">
        <header className="auth-card-header"><Brand /><span>SECURE EMPLOYEE ACCESS</span></header>
        <p className="eyebrow">{mode === "signup" ? "Welcome to Legion" : "Your work, in good company"}</p>
        <h1>{mode === "signup" ? "Create your account" : "Welcome back"}</h1>
        <p className="body-copy">{mode === "signup" ? "Use an email address you can access to create your employee account." : "Sign in to your secure employee workspace."}</p>
        <form className="form-stack" onSubmit={submit}>
          {mode === "signup" && <AuthField label="Full name"><input required maxLength={100} autoComplete="name" value={name} onChange={event => setName(event.target.value)} placeholder=" " /></AuthField>}
          <AuthField label="Work email"><input required type="email" maxLength={254} autoComplete="username" value={email} onChange={event => setEmail(event.target.value)} placeholder=" " /></AuthField>
          <AuthField label="Password" action={<button className="password-visibility" type="button" aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button>}>
            <input required type={showPassword ? "text" : "password"} minLength={mode === "signup" ? 8 : undefined} maxLength={128} autoComplete={mode === "signup" ? "new-password" : "current-password"} value={password} onChange={event => setPassword(event.target.value)} placeholder=" " />
          </AuthField>
          {mode === "signin" && <button className="text-link forgot-link" type="button" onClick={resetPassword} disabled={busy}>Forgot your password?</button>}
          {error && <p className="form-error" role="alert">{error}</p>}
          {message && <p className="form-success" role="status">{message}</p>}
          <button className="primary-button full-button" type="submit" disabled={busy}>
            {busy ? <LoaderCircle className="spin" size={16} /> : null}
            {mode === "signup" ? "Create employee account" : "Sign in securely"}
          </button>
        </form>
        {ssoDomain && <button className="outline-button full-button sso-button" onClick={signInWithCompany} disabled={busy}>Continue with company SSO</button>}
        {allowSignup && <p className="auth-switch">
          {mode === "signup" ? "Already have an account?" : "New to your company workspace?"}{" "}
          <button className="text-link" onClick={() => { setMode(mode === "signup" ? "signin" : "signup"); setError(""); setMessage(""); }}>
            {mode === "signup" ? "Sign in" : "Create account"}
          </button>
        </p>}
        <p className="auth-footnote">Employees receive access from their company administrator.</p>
        <footer className="auth-footer">LEGION <span>·</span> PEOPLE OPERATIONS, IN SYNC</footer>
      </section>
    </main>
  );
}

function PasswordRecovery({ onComplete }) {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { error: updateError } = await withTimeout(() => supabase.auth.updateUser({ password }));
      if (updateError) throw updateError;
      onComplete();
    } catch (updateError) {
      setError(getErrorMessage(updateError));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-screen">
      <section className="auth-card">
        <header className="auth-card-header"><Brand /><span>SECURE EMPLOYEE ACCESS</span></header>
        <p className="eyebrow">ACCOUNT SECURITY</p>
        <h1>Choose a new password</h1>
        <p className="body-copy">Set a new password for your Legion account.</p>
        <form className="form-stack" onSubmit={submit}>
          <AuthField label="New password" action={<button className="password-visibility" type="button" aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button>}>
            <input required minLength={8} autoComplete="new-password" type={showPassword ? "text" : "password"} value={password} onChange={event => setPassword(event.target.value)} placeholder=" " />
          </AuthField>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary-button full-button" disabled={busy}>{busy ? <LoaderCircle className="spin" size={16} /> : null}Update password</button>
        </form>
        <footer className="auth-footer">LEGION <span>·</span> PEOPLE OPERATIONS, IN SYNC</footer>
      </section>
    </main>
  );
}

function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [data, setData] = useState({ employees: [], tasks: [], announcements: [], timeEntries: [], shifts: [], leaveRequests: [], shiftRequests: [], payslips: [], workplaceRecords: [], interactions: [] });
  const [activeView, setActiveView] = useState("overview");
  const [loading, setLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [now, setNow] = useState(Date.now());
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [suiteModule, setSuiteModule] = useState("");
  const [mutating, setMutating] = useState(false);
  const mutationInFlight = useRef(false);
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const [isOnline, setIsOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine);
  const [startupComplete, setStartupComplete] = useState(false);
  const authUserIdRef = useRef(null);
  const workspaceGeneration = useRef(0);
  const isManager = profile && ["manager", "admin"].includes(profile.role);
  const visibleNavigation = isManager ? [...navigation, managerNavigation] : navigation;
  const today = dateKey(new Date(now));
  const userId = session?.user?.id;

  const closeMenu = useCallback(() => setMobileMenuOpen(false), []);
  function toggleNavigation() { setMobileMenuOpen(value => !value); }
  function navigate(view, moduleId = "") {
    setActiveView(view); setSuiteModule(moduleId); setMobileMenuOpen(false);
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  const loadWorkspace = useCallback(async user => {
    if (!user) return;
    const generation = ++workspaceGeneration.current;
    setDataLoading(true);
    setError("");
    try {
      const [results, workplaceRecordsResult, interactionsResult, activityResult] = await Promise.all([
        Promise.all([
          withTimeout(() => supabase.from("employees").select("id,display_name,job_title,role").order("display_name")),
          withTimeout(() => supabase.from("tasks").select("*").order("due_date", { ascending: true, nullsFirst: false }).order("created_at", { ascending: false })),
          withTimeout(() => supabase.from("announcements").select("*, author:employees!announcements_author_id_fkey(display_name)").order("created_at", { ascending: false }).limit(40)),
          withTimeout(() => supabase.from("time_entries").select("*").order("clocked_in_at", { ascending: false }).limit(300)),
          withTimeout(() => supabase.from("shifts").select("*, employee:employees!shifts_employee_id_fkey(display_name)").order("starts_at")),
          withTimeout(() => supabase.from("leave_requests").select("*, employee:employees!leave_requests_employee_id_fkey(display_name)").order("created_at", { ascending: false })),
          withTimeout(() => supabase.from("shift_change_requests").select("*, employee:employees!shift_change_requests_employee_id_fkey(display_name), shift:shifts!shift_change_requests_shift_id_fkey(starts_at,ends_at,location)").order("created_at", { ascending: false })),
          withTimeout(() => supabase.from("payslips").select("*").order("period_start", { ascending: false })),
        ]),
        withTimeout(() => supabase.from("workplace_records").select("*").neq("module_id", "collaboration.activity").order("created_at", { ascending: false }).limit(500)),
        withTimeout(() => supabase.from("workplace_interactions").select("*").order("created_at", { ascending: false }).limit(1000)),
        withTimeout(() => supabase.from("workplace_records").select("*").eq("module_id", "collaboration.activity").order("created_at", { ascending: false }).limit(100)),
      ]);

      if (generation !== workspaceGeneration.current) return;
      const failure = results.find(result => result?.error)?.error;
      if (failure) throw failure;

      const [employees, tasks, announcements, timeEntries, shifts, leaveRequests, shiftRequests, payslips] = results.map(result => result.data);
      const employeeProfile = employees.find(employee => employee.id === user.id);
      if (!employeeProfile) throw new Error("Your employee profile is still being created. Refresh in a moment, or ask your administrator for help.");

      setProfile(employeeProfile);
      setData({
        employees,
        tasks,
        announcements,
        timeEntries,
        shifts,
        leaveRequests,
        shiftRequests,
        payslips,
        workplaceRecords: [...(workplaceRecordsResult.data || []), ...(activityResult.data || [])],
        interactions: interactionsResult.data || [],
      });
      setError(workplaceRecordsResult.error || interactionsResult.error || activityResult.error
        ? `Some workplace tools could not load. Ask your administrator to apply the latest database update. Details: ${getErrorMessage(workplaceRecordsResult.error || interactionsResult.error || activityResult.error)}`
        : "");
    } catch (loadError) {
      if (generation !== workspaceGeneration.current) return;
      if (isMissingSchemaError(loadError)) {
        setError("The company workspace is not ready yet. Ask your administrator to finish database setup, then retry.");
      } else {
        setError(getErrorMessage(loadError));
      }
    } finally {
      if (generation === workspaceGeneration.current) { setDataLoading(false); setLoading(false); }
    }
  }, []);

  useEffect(() => {
    if (!supabaseConfigured) return undefined;
    let live = true;
    withTimeout(() => supabase.auth.getSession()).then(({ data: authData, error: sessionError }) => {
      if (!live) return;
      if (sessionError) setError(getErrorMessage(sessionError));
      authUserIdRef.current = authData?.session?.user?.id || null;
      setSession(authData?.session || null);
      if (!authData?.session) setLoading(false);
    }).catch(sessionError => {
      if (live) { setError(getErrorMessage(sessionError)); setLoading(false); }
    });
    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === "PASSWORD_RECOVERY") setPasswordRecovery(true);
      const changedUser = authUserIdRef.current !== (nextSession?.user?.id || null);
      authUserIdRef.current = nextSession?.user?.id || null;
      setSession(nextSession);
      if (nextSession) {
        if (changedUser) setLoading(true);
      } else {
        workspaceGeneration.current++;
        setProfile(null);
        setData({ employees: [], tasks: [], announcements: [], timeEntries: [], shifts: [], leaveRequests: [], shiftRequests: [], payslips: [], workplaceRecords: [], interactions: [] });
        setLoading(false);
      }
    });
    return () => {
      live = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setStartupComplete(true), 350);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    function handleOffline() {
      setIsOnline(false);
    }
    async function handleOnline() {
      setIsOnline(true);
      if (!supabaseConfigured) return;
      setLoading(true);
      try {
        const { data: authData, error: sessionError } = await withTimeout(() => supabase.auth.getSession());
        if (sessionError) throw sessionError;
        setSession(authData?.session || null);
        if (authData?.session) await loadWorkspace(authData.session.user);
        else setLoading(false);
      } catch (connectionError) {
        setError(getErrorMessage(connectionError));
        setLoading(false);
      }
    }
    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, [loadWorkspace]);

  useEffect(() => {
    if (!session?.user) return undefined;
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
    if (mutationInFlight.current) return null;
    mutationInFlight.current = true; setMutating(true);
    setError("");
    try {
      const result = await withTimeout(operation);
      if (result?.error) throw result.error;
      await loadWorkspace(session.user);
      return result?.data ?? true;
    } catch (operationError) {
      setError(getErrorMessage(operationError));
      return null;
    } finally { mutationInFlight.current = false; setMutating(false); }
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
    const result = await mutate(() => supabase.from("tasks").update({ status }).eq("id", task.id).eq("status", task.status).select("id,status").single());
    if (result) setToast("Task progress saved.");
  }

  async function claimTask(task) {
    setError("");
    try {
      const { data: claimed, error: claimError } = await supabase.from("tasks")
        .update({ assignee_id: userId })
        .eq("id", task.id)
        .is("assignee_id", null)
        .select("id")
        .maybeSingle();
      if (claimError) throw claimError;
      if (!claimed) {
        await loadWorkspace(session.user);
        setError("That task has already been claimed. The task list has been refreshed.");
        return;
      }
      await loadWorkspace(session.user);
      setToast("Task added to your list.");
    } catch (claimError) {
      setError(getErrorMessage(claimError));
    }
  }

  async function submitTask(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const result = await mutate(() => supabase.from("tasks").insert({
      title: String(values.get("title")).trim(),
      description: String(values.get("description") || "").trim(),
      assignee_id: String(values.get("assignee") || "") || null,
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
    if (!Number.isFinite(gross) || !Number.isFinite(deductions) || gross < 0 || deductions < 0 || deductions > gross) { setError("Enter valid pay amounts; deductions cannot exceed gross pay."); return; }
    if (!isValidDateValue(values.get("period_start")) || !isValidDateValue(values.get("period_end")) || values.get("period_end") < values.get("period_start")) { setError("Enter a valid pay period with the end on or after the start."); return; }
    const result = await mutate(() => supabase.from("payslips").insert({
      employee_id: String(values.get("employee")),
      period_start: String(values.get("period_start")),
      period_end: String(values.get("period_end")),
      gross_pay: gross,
      deductions,
    }));
    if (result) { form.reset(); setToast("Payslip published to the employee account."); }
  }

  async function submitWorkplaceRecord(module, event) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const resourceUrl = String(values.get("resource_url") || "").trim();
    if (resourceUrl && !safeExternalUrl(resourceUrl)) { setError("Use an HTTPS resource link without embedded credentials."); return; }
    const result = await mutate(() => supabase.from("workplace_records").insert({
      module_id: module.id,
      title: String(values.get("title")).trim(),
      description: String(values.get("description") || "").trim(),
      status: String(values.get("status")),
      visibility: String(values.get("visibility")),
      due_date: values.get("due_date") || null,
      metadata: { field_value: String(values.get("module_value") || "").trim(), resource_url: resourceUrl },
      created_by: session.user.id,
    }));
    if (result) { form.reset(); setToast("Workspace record saved."); }
  }

  async function updateWorkplaceRecord(record, status) {
    const result = await mutate(() => supabase.from("workplace_records").update({ status }).eq("id", record.id).eq("status", record.status).select("id").single());
    if (result) setToast("Workspace record updated.");
  }

  async function recordInteraction(recordId, kind, body, value) {
    const result = await mutate(() => supabase.rpc("submit_workplace_interaction", { p_record_id: recordId, p_kind: kind, p_body: body, p_value: value }));
    if (result) setToast(kind === "completion" ? "Your completion has been recorded." : kind === "rating" ? "Your response has been saved." : "Reply posted.");
    return result;
  }

  async function deleteWorkplaceRecord(record) {
    if (!window.confirm(`Delete “${record.title}”?`)) return;
    const result = await mutate(() => supabase.from("workplace_records").delete().eq("id", record.id).select("id").single());
    if (result) setToast("Workspace record deleted.");
  }

  async function downloadPayslip(payslip) {
    const { jsPDF } = await import("jspdf");
    const employee = data.employees.find(item => item.id === payslip.employee_id);
    const pdf = new jsPDF();
    pdf.setTextColor(29, 59, 45);
    pdf.setFontSize(22);
    pdf.text("LEGION", 20, 25);
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
    pdf.text("Issued by your employer through Legion.", 20, 154);
    pdf.save(`legion-payslip-${payslip.period_start}.pdf`);
  }

  async function signOut() {
    try {
      const { error: signOutError } = await withTimeout(() => supabase.auth.signOut({ scope: "local" }));
      if (signOutError) throw signOutError;
    } catch (signOutError) { setError(getErrorMessage(signOutError)); }
  }

  if (!supabaseConfigured) return <ConfigScreen />;
  if (session && loading) return <WorkspaceContentLoading isOnline={isOnline} />;
  if (!session && (loading || !startupComplete)) return <StartupScreen isOnline={isOnline} />;
  if (!session) return <AuthScreen />;
  if (passwordRecovery) return <PasswordRecovery onComplete={() => { setPasswordRecovery(false); setToast("Your password has been updated."); }} />;

  const taskSections = isManager ? data.tasks : data.tasks.filter(task => task.assignee_id === userId || task.assignee_id === null);
  const visibleTasks = activeView === "overview" ? personalTasks.slice(0, 5) : taskSections;
  const announcements = data.announcements;
  const displayName = profile?.display_name || session?.user?.email?.split("@")[0] || "Employee";
  const employeeRequests = data.leaveRequests.filter(request => isManager || request.employee_id === userId);
  const employeeShiftRequests = data.shiftRequests.filter(request => isManager || request.employee_id === userId);
  const upcomingShifts = data.shifts.filter(shift => isManager || shift.employee_id === userId);
  const heading = visibleNavigation.find(item => item.id === activeView)?.label || (activeView === "activity" ? "Company activity" : "Overview");
  const firstName = displayName.split(" ")[0];

  return (
    <div className="app-shell organised-shell">
      <NavigationDrawer open={mobileMenuOpen} items={visibleNavigation} activeView={activeView} onNavigate={navigate} onClose={closeMenu} onSignOut={signOut} name={displayName} role={profile?.role} />
      <main className="main-area" inert={mobileMenuOpen ? true : undefined}>
        <header className="topbar">
          <div className="topbar-left"><button className="icon-button menu-trigger" aria-label="Open menu" aria-expanded={mobileMenuOpen} aria-controls="workspace-menu" onClick={toggleNavigation}><Menu size={21} /></button><Brand compact /><span className="desktop-page-name">{heading}</span></div>
          <nav className="desktop-primary-nav" aria-label="Primary navigation">{navigation.filter(item => ["overview", "tasks", "attendance"].includes(item.id)).map(item => <NavItem key={item.id} item={item} active={activeView === item.id} onClick={() => navigate(item.id)} />)}</nav>
          <div className="topbar-right"><button className="icon-button" aria-label="Company notices" onClick={() => navigate("notices")}><Bell size={18} /></button><button className="top-avatar account-trigger" aria-label="Open account menu" onClick={toggleNavigation}>{initials(displayName)}</button></div>
        </header>
        <div className="page-content">
          {error && <div className="error-banner" role="alert"><span>{error}</span>{session && <button className="retry-action" onClick={() => loadWorkspace(session.user)}>Retry</button>}<button onClick={() => setError("")} aria-label="Dismiss error"><X size={16} /></button></div>}
          {dataLoading && <div className="sync-banner"><LoaderCircle className="spin" size={14} /> Syncing the latest workspace data…</div>}
          <fieldset className="workspace-controls" disabled={mutating}>
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
            onView={navigate}
            onDownload={downloadPayslip}
          />}
          {activeView === "tasks" && <TasksView tasks={taskSections} isManager={isManager} employees={data.employees} employeeId={userId} onTask={updateTask} onClaim={claimTask} onSubmit={submitTask} />}
          {activeView === "attendance" && <AttendanceView entries={isManager ? data.timeEntries : data.timeEntries.filter(entry => entry.employee_id === userId)} employees={data.employees} employeeId={userId} openEntry={openEntry} seconds={todaySeconds} weeklySeconds={weeklySeconds} onClock={toggleClock} />}
          {activeView === "leave" && <LeaveView isManager={isManager} employeeId={userId} requests={employeeRequests} shiftRequests={employeeShiftRequests} shifts={upcomingShifts} employees={data.employees} onLeave={submitLeave} onShiftRequest={submitShiftRequest} onReview={reviewRequest} onShift={submitShift} />}
          {activeView === "payslips" && <PayslipsView isManager={isManager} payslips={data.payslips.filter(slip => isManager || slip.employee_id === userId)} employees={data.employees} employeeId={userId} onDownload={downloadPayslip} onCreate={submitPayslip} />}
          {activeView === "manager" && isManager && <ManagerView tasks={data.tasks} announcements={announcements} employees={data.employees} requests={data.leaveRequests} shiftRequests={data.shiftRequests} shifts={data.shifts} onTask={submitTask} onUpdateTask={updateTask} onAnnouncement={submitAnnouncement} onReview={reviewRequest} onShift={submitShift} onView={navigate} />}
          {activeView === "suite" && <WorkplaceSuite key={suiteModule || "all"} initialModuleId={suiteModule} interactions={data.interactions} onInteract={recordInteraction} records={data.workplaceRecords} employees={data.employees} tasks={data.tasks} announcements={announcements} isManager={isManager} userId={userId} onCreate={submitWorkplaceRecord} onStatus={updateWorkplaceRecord} onDelete={deleteWorkplaceRecord} onNavigate={navigate} />}
          {activeView === "notices" && <><PageHeading eyebrow="KEEP UP TO DATE" title="Company notices" description="Announcements shared by your company." /><Card title="Latest updates">{announcements.length ? announcements.map(item => <AnnouncementRow key={item.id} announcement={item} />) : <EmptyState icon={Megaphone} title="No notices yet" text="Company updates will appear here." />}</Card><button className="outline-button spaced-card" onClick={() => navigate("activity")}>View company activity <ArrowRight size={15} /></button></>}
          {activeView === "insights" && <InsightsView data={isManager ? data : { ...data, tasks: personalTasks, timeEntries: data.timeEntries.filter(entry => entry.employee_id === userId) }} isManager={isManager} />}
          {activeView === "activity" && <ActivityFeedView records={data.workplaceRecords.filter(record => record.module_id === "collaboration.activity")} />}
          </fieldset>
        </div>
      </main>
      <nav className="mobile-nav" aria-label="Mobile navigation" inert={mobileMenuOpen ? true : undefined}>
        {navigation.filter(item => ["overview", "tasks", "attendance"].includes(item.id)).map(item => <NavItem key={item.id} item={item} active={activeView === item.id} onClick={() => navigate(item.id)} mobile />)}
        <button className={`mobile-nav-item${mobileMenuOpen ? " active" : ""}`} onClick={toggleNavigation} aria-label="More tools" aria-expanded={mobileMenuOpen}><Menu size={20} /><span>More</span></button>
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
  return <button className={`${mobile ? "mobile-nav-item" : "side-nav-item"}${active ? " active" : ""}`} aria-current={active ? "page" : undefined} onClick={onClick}><Icon size={18} /><span>{mobile ? item.id === "overview" ? "Home" : item.id === "attendance" ? "Time" : item.id === "payslips" ? "Pay" : item.id === "manager" ? "Manage" : item.id === "suite" ? "Suite" : item.id === "leave" ? "Leave" : "Tasks" : item.label}</span></button>;
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

function Overview({ name, tasks, allTaskCount, completed, percent, openEntry, seconds, announcements, payslips, onClock, onTask, onView }) {
  const nextTasks = tasks.filter(task => task.status !== "done").slice(0, 3);
  return <>
    <PageHeading eyebrow="MY WORKDAY" title={`Hello, ${name}`} description="Everything you need for today." />
    <div className="home-hero"><ClockCard openEntry={openEntry} seconds={seconds} onClock={onClock} /><section className="home-actions card"><h2>Quick actions</h2><div>{[{ id: "payslips", label: "My payslips", caption: payslips.length ? "Latest statement available" : "Pay statements", icon: FileText }, { id: "leave", label: "Leave & shifts", caption: "Plan your workday", icon: CalendarDays }, { id: "notices", label: "Company notices", caption: `${announcements.length ? "Latest updates" : "Team announcements"}`, icon: Bell }].map(item => { const Icon = item.icon; return <button key={item.id} onClick={() => onView(item.id)}><span className="quick-icon"><Icon size={21} /></span><span><strong>{item.label}</strong><small>{item.caption}</small></span><ArrowRight size={17} /></button>; })}</div></section></div>
    <div className="home-details"><Card title="Next on your list" subtitle={`${completed} of ${allTaskCount} tasks completed`} action={<button className="text-action" onClick={() => onView("tasks")}>View all <ArrowRight size={14} /></button>}>
      {nextTasks.length ? nextTasks.map(task => <TaskRow key={task.id} task={task} onChange={onTask} />) : <EmptyState icon={CheckCheck} title="You’re up to date" text="Find available work in My tasks." />}
      {!!allTaskCount && <div className="progress-section"><div className="progress-track" role="progressbar" aria-label="My task completion" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}><span style={{ width: `${percent}%` }} /></div></div>}
    </Card><Card title="Latest company update" action={<button className="text-action" onClick={() => onView("notices")}>All notices <ArrowRight size={14} /></button>}>{announcements[0] ? <AnnouncementRow announcement={announcements[0]} /> : <EmptyState icon={Megaphone} title="Nothing new yet" text="Company announcements will appear here." />}</Card></div>
  </>;
}

function TaskRow({ task, employee, onChange, onClaim, managerMode = false }) {
  const statusLabel = task.status === "done" ? "Done" : task.status === "in_progress" ? "In progress" : "To do";
  const canClaim = !managerMode && !task.assignee_id;
  return <div className={`task-row${task.status === "done" ? " task-done" : ""}`}>
    <button className={`task-status-icon status-${task.status}`} aria-label={`Set ${task.title} status`} disabled={canClaim} onClick={() => onChange(task, task.status === "done" ? "todo" : "done")}>{task.status === "done" ? <Check size={13} /> : task.status === "in_progress" ? <span className="status-dot" /> : null}</button>
    <div className="task-copy"><strong>{task.title}</strong><span>{task.due_date ? `Due ${formatDate(task.due_date)}` : "No due date"}{managerMode ? ` · ${employee?.display_name || "Open task pool"}` : ""}</span></div>
    {managerMode && <span className={`priority-pill${task.priority === "high" ? " priority-high" : ""}`}>{task.priority}</span>}
    {canClaim && <button className="outline-button task-claim" onClick={() => onClaim(task)}>Claim task <ArrowRight size={13} /></button>}
    {!managerMode && !canClaim && <label className="task-select"><span className="sr-only">Task status</span><select aria-label={`Progress for ${task.title}`} value={task.status} onChange={event => onChange(task, event.target.value)}><option value="todo">To do</option><option value="in_progress">In progress</option><option value="done">Done</option></select><span>{statusLabel}</span></label>}
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

function ActivityFeedView({ records }) {
  return (
    <>
      <PageHeading eyebrow="WORKSPACE ACTIVITY" title="Company activity" description="A shared, database-recorded history of employee, task, time, schedule, leave, announcement, and payslip changes." />
      <Card title="Recent activity" subtitle={`${records.length} recent events`}>
        {records.length ? (
          <div className="suite-record-list">
            {records.map(record => <article className="suite-record-row" key={record.id}>
              <span className="suite-record-icon"><Bell size={16} /></span>
              <div className="suite-record-copy"><strong>{record.title}</strong><p>{record.description}</p><small>{record.metadata?.source_table?.replaceAll("_", " ") || "Workspace"} · {new Date(record.created_at).toLocaleString()}</small></div>
            </article>)}
          </div>
        ) : <EmptyState icon={Bell} title="No activity recorded yet" text="As employees use the workspace, activity will appear here." />}
      </Card>
    </>
  );
}

function TasksView({ tasks, isManager, employees, employeeId, onTask, onClaim, onSubmit }) {
  const assigned = isManager ? tasks : tasks.filter(task => task.assignee_id === employeeId || task.assignee_id === null);
  return <>
    <PageHeading eyebrow={isManager ? "TEAM WORK" : "YOUR WORK"} title={isManager ? "Team tasks" : "My tasks"} description={isManager ? "Create clear assignments and follow progress across the team." : "Keep priorities clear and make progress one task at a time."} />
    {isManager && <Card title="Assign a task" subtitle="Assign now or leave open for an employee to claim."><form className="form-grid" onSubmit={onSubmit}><Field label="Task title"><input name="title" required maxLength={160} placeholder="What needs to get done?" /></Field><Field label="Assign to"><select name="assignee" defaultValue=""><option value="">Open task pool</option>{employees.map(employee => <option key={employee.id} value={employee.id}>{employee.display_name}</option>)}</select></Field><Field label="Due date"><input name="due" type="date" min={dateKey()} /></Field><Field label="Priority"><select name="priority"><option value="normal">Normal</option><option value="high">High</option></select></Field><Field label="Details"><textarea className="wide-field" name="description" maxLength={1000} placeholder="Add useful context (optional)." /></Field><button className="primary-button form-action" type="submit"><Plus size={15} /> Assign task</button></form></Card>}
    <Card className="spaced-card" title={isManager ? "Team task board" : "Your task list"} subtitle={`${assigned.filter(task => task.status === "done").length} of ${assigned.length} tasks complete`} action={<span className="metric-chip">{assigned.length} tasks</span>}>
      {assigned.length ? <div className="task-list">{assigned.map(task => <TaskRow key={task.id} task={task} employee={employees.find(person => person.id === task.assignee_id)} onChange={onTask} onClaim={onClaim} managerMode={isManager} />)}</div> : <EmptyState icon={CheckCheck} title="No tasks here yet" text={isManager ? "Create a task above to get your team moving." : "Your assigned work and open tasks will appear here."} />}
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

function ManagerView({ tasks, announcements, employees, requests, shiftRequests, shifts, onTask, onUpdateTask, onAnnouncement, onReview, onShift, onView }) {
  const openTasks = tasks.filter(task => task.status !== "done").length;
  const pending = requests.filter(item => item.status === "pending").length + shiftRequests.filter(item => item.status === "pending").length;
  return <>
    <PageHeading eyebrow="TEAM OPERATIONS" title="Manager tools" description="Keep people, work, and team communication moving together." action={<span className="live-badge"><ShieldCheck size={14} /> Manager access</span>} />
    <div className="stat-grid"><Stat label="Team members" value={employees.length} detail="Active employee accounts" /><Stat label="Tasks in progress" value={openTasks} detail={`${tasks.filter(task => task.status === "done").length} complete`} /><Stat label="Requests to review" value={pending} detail="Leave and shift requests" /></div>
    <div className="manager-grid spaced-card">
      <div className="stack-column">
        <Card title="Assign a task" subtitle="Assign an owner or add it to the open task pool."><form className="form-grid" onSubmit={onTask}><Field label="Task title"><input name="title" required maxLength={160} placeholder="What needs to get done?" /></Field><Field label="Assign to"><select name="assignee" defaultValue=""><option value="">Open task pool</option>{employees.map(employee => <option key={employee.id} value={employee.id}>{employee.display_name}</option>)}</select></Field><Field label="Due date"><input name="due" type="date" min={dateKey()} /></Field><Field label="Priority"><select name="priority"><option value="normal">Normal</option><option value="high">High</option></select></Field><Field label="Details"><textarea className="wide-field" name="description" maxLength={1000} placeholder="Add useful context (optional)." /></Field><button className="primary-button form-action" type="submit"><Plus size={15} /> Assign task</button></form></Card>
        <Card title="Team task progress" subtitle="Review ownership and completion across your team." action={<button className="text-action" onClick={() => onView("tasks")}>Task board <ArrowRight size={14} /></button>}>
          {tasks.length ? <div className="task-list">{tasks.slice(0, 8).map(task => <TaskRow key={task.id} task={task} employee={employees.find(employee => employee.id === task.assignee_id)} onChange={onUpdateTask} managerMode />)}</div> : <EmptyState icon={CheckCheck} title="No tasks assigned" text="Create the first team task above." />}
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
