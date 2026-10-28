import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowLeft,
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
import {workplaceModules,canAccessWorkplaceModule,} from "./lib/workplaceModules.js";
import NotificationSettings from "./components/NotificationSettings.jsx";
import { disableDeviceNotifications } from "./lib/pushNotifications.js";
import usePushNavigation from "./lib/usePushNavigation.js";
import EmployeeAvatar, {EmployeeProfilesProvider} from "./components/EmployeeAvatar.jsx";
import OfflineWorkspace from "./components/OfflineWorkspace.jsx";
import {
  saveOfflineWorkspace,
  clearOfflineWorkspace,
} from "./lib/offlineWorkspace.js";
import { clockMessage } from "./lib/clockMessage.js";
import DevAppTest from "./components/DevAppTest.jsx";
import TechDevGlobe from "./components/TechDevGlobe.jsx";
import { ChatDelivery } from "./lib/companyChat.js";
import useWorkspaceNavigation from "./lib/useWorkspaceNavigation.js";

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
    <a className={`brand${compact ? " brand-compact" : ""}`} href="/" aria-label="TechDev home">
      <BrandMark />
      <img className="brand-wordmark-image" src="/techdev-wordmark.png" alt="TECHDEV" width="380" height="74" draggable="false" />
    </a>
  );
}

function BrandMark({ animated = false }) {
  return (
    <span
      className={`brand-mark${animated ? " is-animated" : ""}`}
      aria-hidden="true"
    >
      <TechDevGlobe animated={animated} />
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
  <img
    className="startup-wordmark"
    src={`${import.meta.env.BASE_URL}techdev-wordmark.svg`}
    alt="Tech Dev"
    draggable="false"
  />

  <img
    className="startup-slogan"
    src={`${import.meta.env.BASE_URL}techdev-slogan.svg`}
    alt="Empower your digital journey"
    draggable="false"
  />
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
        const strongPassword =
  password.length >= 12 &&
  /[a-z]/.test(password) &&
  /[A-Z]/.test(password) &&
  /[0-9]/.test(password) &&
  /[!@#$%^&*()_+\-=\[\]{};':"\\|<>?,./`~]/.test(password);

if (!strongPassword) {
  setError(
    "Use at least 12 characters, including uppercase and lowercase letters, a number and a symbol."
  );
  return;
}
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
       <header className="auth-card-header">
  <Brand />
  <span className="auth-security-label">
    <ShieldCheck size={15} aria-hidden="true" />
    <span>SECURE EMPLOYEE ACCESS</span>
  </span>
</header>
        <p className="eyebrow">{mode === "signup" ? "Welcome to Tech Dev" : "Your work, in good company"}</p>
        <h1>{mode === "signup" ? "Create your account" : "Welcome back"}</h1>
        <p className="body-copy">{mode === "signup" ? "Use an email address you can access to create your employee account." : "Sign in to your secure employee workspace."}</p>
        <form className="form-stack" onSubmit={submit}>
          {mode === "signup" && <AuthField label="Full name"><input required maxLength={100} autoComplete="name" value={name} onChange={event => setName(event.target.value)} placeholder=" " /></AuthField>}
          <AuthField label="Work email"><input required type="email" maxLength={254} autoComplete="username" value={email} onChange={event => setEmail(event.target.value)} placeholder=" " /></AuthField>
          <AuthField label="Password" action={<button className="password-visibility" type="button" aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button>}>
            <input required type={showPassword ? "text" : "password"} minLength={mode === "signup" ? 12 : undefined}aria-describedby={mode === "signup" ? "signup-password-help" : undefined} maxLength={128} autoComplete={mode === "signup" ? "new-password" : "current-password"} value={password} onChange={event => setPassword(event.target.value)} placeholder=" " />
          </AuthField>
          {mode === "signup" && (
  <p
    id="signup-password-help"
    style={{
      margin: 0,
      fontSize: 12,
      lineHeight: 1.5,
      color: "#b8c8de",
    }}
  >
    Use 12 or more characters with uppercase and lowercase
    letters, a number and a symbol, such as !, @ or #.
  </p>
)}
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
        <footer className="auth-footer">TECH DEV <span>·</span> PEOPLE OPERATIONS, IN SYNC</footer>
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
<header className="auth-card-header">
  <Brand />
  <span className="auth-security-label">
    <ShieldCheck size={15} aria-hidden="true" />
    <span>SECURE EMPLOYEE ACCESS</span>
  </span>
</header>
        <p className="eyebrow">ACCOUNT SECURITY</p>
        <h1>Choose a new password</h1>
        <p className="body-copy">Set a new password for your Tech Dev account.</p>
        <form className="form-stack" onSubmit={submit}>
          <AuthField label="New password" action={<button className="password-visibility" type="button" aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button>}>
            <input required minLength={8} autoComplete="new-password" type={showPassword ? "text" : "password"} value={password} onChange={event => setPassword(event.target.value)} placeholder=" " />
          </AuthField>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary-button full-button" disabled={busy}>{busy ? <LoaderCircle className="spin" size={16} /> : null}Update password</button>
        </form>
        <footer className="auth-footer">TECH DEV <span>·</span> PEOPLE OPERATIONS, IN SYNC</footer>
      </section>
    </main>
  );
}

function App() {
  const [session, setSession] = useState(null);
  const [avatarUploadsEnabled, setAvatarUploadsEnabled] = useState(false);
const [featureSaving, setFeatureSaving] = useState(false);

useEffect(() => {
  let live = true;
  let request = 0;
  setAvatarUploadsEnabled(false);

  if (!session?.user?.id) return;

  async function refreshFeature() {
    const current = ++request;

    try {
      const { data: feature, error } = await supabase
        .from("app_features")
        .select("enabled")
        .eq("name", "avatar_uploads")
        .single();

      if (live && current === request) {
        setAvatarUploadsEnabled(!error && feature?.enabled === true);
      }
    } catch {
      if (live && current === request) {
        setAvatarUploadsEnabled(false);
      }
    }
  }

  refreshFeature();

  const channel = supabase
    .channel(`avatar-feature-${session.user.id}`)
    .on("postgres_changes", {
      event: "UPDATE",
      schema: "public",
      table: "app_features"
    }, refreshFeature)
    .subscribe(status => {
      if (status === "SUBSCRIBED") refreshFeature();

      if (
        live &&
        ["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(status)
      ) {
        request++;
        setAvatarUploadsEnabled(false);
      }
    });

  window.addEventListener("focus", refreshFeature);

  return () => {
    live = false;
    window.removeEventListener("focus", refreshFeature);
    supabase.removeChannel(channel);
  };
}, [session?.user?.id]);
  const [avatarSrc, setAvatarSrc] = useState("");

useEffect(() => {
  let live = true;
  setAvatarSrc("");

  const owner = session?.user?.id;
  const path = session?.user?.user_metadata?.avatar_path;

  if (
    !owner || typeof path !== "string" ||
    !path.startsWith(`${owner}/`)
  ) return;

  async function refreshPhoto() {
    try {
      const { data: image, error } = await supabase.storage
        .from("employee-avatars")
        .createSignedUrl(path, 3600);

      if (live && !error) setAvatarSrc(image.signedUrl);
    } catch {
      // Show initials if the photo cannot load.
    }
  }

  refreshPhoto();
  const timer = window.setInterval(refreshPhoto, 45 * 60 * 1000);

  return () => {
    live = false;
    window.clearInterval(timer);
  };
}, [session?.user?.id, session?.user?.user_metadata?.avatar_path]);
  const [profile, setProfile] = useState(null);
  const [data, setData] = useState({ employees: [], tasks: [], announcements: [], timeEntries: [], shifts: [], leaveRequests: [], shiftRequests: [], payslips: [], workplaceRecords: [], interactions: [] });
  const [devTestsOpen, setDevTestsOpen] = useState(false);

useEffect(() => {
  setDevTestsOpen(false);
}, [session?.user?.id]);
  const [loading, setLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [now, setNow] = useState(Date.now());
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mutating, setMutating] = useState(false);
  const mutationInFlight = useRef(false);
  const [passwordRecovery, setPasswordRecovery] = useState(false);
 const [isOnline, setIsOnline] = useState(
  () =>
    navigator.onLine &&
    document.documentElement.dataset.techdevOffline !== "true"
);
  const [startupComplete, setStartupComplete] = useState(false);
  const authUserIdRef = useRef(null);
  const workspaceGeneration = useRef(0);
  const reconnectInFlight = useRef(false);
const connectionStatus = useRef(isOnline);

useEffect(() => {
  connectionStatus.current = isOnline;
}, [isOnline]);
  const isManager = profile && ["manager", "admin"].includes(profile.role);
 const visibleNavigation = (isManager ? [...navigation, managerNavigation] : navigation).filter(item => item.id !== "insights" || isManager);
  const today = dateKey(new Date(now));
  const userId = session?.user?.id;

  const closeMenu = useCallback(() => setMobileMenuOpen(false), []);
  function toggleNavigation() { setMobileMenuOpen(value => !value); }
  const {
  activeView,
  suiteModule,
  navigate,
  goBack,
  canGoBack,
} = useWorkspaceNavigation({
  userId,
  role: profile?.role,
  items: visibleNavigation,
  onCloseMenu: closeMenu,

  onUnavailable: () =>
    setToast("This tool is not available for your role."),
});

usePushNavigation({
  ready: Boolean(
    userId &&
    profile?.id === userId &&
    !loading &&
    !passwordRecovery
  ),
  userId,
  onNavigate: navigate,
});

function openActivityItem(activity) {
  const metadata = activity.metadata || {};

  if (metadata.operation === "DELETE") {
    setToast("This item has been removed.");
    return;
  }

  let target;

  if (metadata.source_table === "workplace_records") {
    target = data.workplaceRecords.find(
      item => item.id === metadata.source_id
    );
  }

  if (metadata.source_table === "workplace_interactions") {
    const reply = data.interactions.find(
      item => item.id === metadata.source_id
    );

    target = data.workplaceRecords.find(
      item => item.id === reply?.record_id
    );
  }

  if (target) {
    navigate("suite", target.module_id);

    window.setTimeout(() => {
      const row = document.getElementById(`workplace-${target.id}`);
      if (!row) return;

      const discussion = row.querySelector(".discussion-toggle");
      if (discussion?.getAttribute("aria-expanded") === "false") {
        discussion.click();
      }

      row.setAttribute("data-activity-target", "true");
      row.scrollIntoView({ behavior: "smooth", block: "start" });

      window.setTimeout(() => {
        row.removeAttribute("data-activity-target");
      }, 5000);
    }, 120);

    return;
  }

  const screens = {
    tasks: "tasks",
    announcements: "notices",
    time_entries: "attendance",
    shifts: "leave",
    leave_requests: "leave",
    shift_change_requests: "leave",
    payslips: "payslips",
  };

  const screen = screens[metadata.source_table];

  if (screen) {
    navigate(screen);
  } else if (metadata.source_table === "employees") {
    navigate("suite", "people.directory");
  } else {
    setToast("This item is not available in the loaded workspace.");
  }
}
  const loadWorkspace = useCallback(async user => {
  if (!user) return false;

  if (!navigator.onLine) {
    setLoading(false);
    setDataLoading(false);
    return false;
  }

  const generation = ++workspaceGeneration.current;

  setDataLoading(true);
  setError("");

  try {
    const [
      results,
      workplaceRecordsResult,
      interactionsResult,
      activityResult,
    ] = await Promise.all([
      Promise.all([
        withTimeout(() =>
          supabase
            .from("employees")
            .select("id,display_name,job_title,role")
            .order("display_name")
        ),

        withTimeout(() =>
          supabase
            .from("tasks")
            .select("*")
            .order("due_date", {
              ascending: true,
              nullsFirst: false,
            })
            .order("created_at", {
              ascending: false,
            })
        ),

        withTimeout(() =>
          supabase
            .from("announcements")
            .select(
              "*, author:employees!announcements_author_id_fkey(display_name)"
            )
            .order("created_at", {
              ascending: false,
            })
            .limit(40)
        ),

        withTimeout(() =>
          supabase
            .from("time_entries")
            .select("*")
            .order("clocked_in_at", {
              ascending: false,
            })
            .limit(300)
        ),

        withTimeout(() =>
          supabase
            .from("shifts")
            .select(
              "*, employee:employees!shifts_employee_id_fkey(display_name)"
            )
            .order("starts_at")
        ),

        withTimeout(() =>
          supabase
            .from("leave_requests")
            .select(
              "*, employee:employees!leave_requests_employee_id_fkey(display_name)"
            )
            .order("created_at", {
              ascending: false,
            })
        ),

        withTimeout(() =>
          supabase
            .from("shift_change_requests")
            .select(
              "*, employee:employees!shift_change_requests_employee_id_fkey(display_name), shift:shifts!shift_change_requests_shift_id_fkey(starts_at,ends_at,location)"
            )
            .order("created_at", {
              ascending: false,
            })
        ),

        withTimeout(() =>
          supabase
            .from("payslips")
            .select("*")
            .order("period_start", {
              ascending: false,
            })
        ),
      ]),

      withTimeout(() =>
        supabase
          .from("workplace_records")
          .select("*")
          .neq(
            "module_id",
            "collaboration.activity"
          )
          .order("created_at", {
            ascending: false,
          })
          .limit(500)
      ),

      withTimeout(() =>
        supabase
          .from("workplace_interactions")
          .select("*")
          .order("created_at", {
            ascending: false,
          })
          .limit(1000)
      ),

      withTimeout(() =>
        supabase
          .from("workplace_records")
          .select("*")
          .eq(
            "module_id",
            "collaboration.activity"
          )
          .order("created_at", {
            ascending: false,
          })
          .limit(100)
      ),
    ]);

    if (
      generation !== workspaceGeneration.current
    ) {
      return false;
    }

    const failure = results.find(
      result => result?.error
    )?.error;

    if (failure) throw failure;

    const [
      employees,
      tasks,
      announcements,
      timeEntries,
      shifts,
      leaveRequests,
      shiftRequests,
      payslips,
    ] = results.map(result => result.data);

    const employeeProfile = employees.find(
      employee => employee.id === user.id
    );

    if (!employeeProfile) {
      throw new Error(
        "Your employee profile is still being created. Refresh in a moment, or ask your administrator for help."
      );
    }

    const loadedWorkspace = {
      employees,
      tasks,
      announcements,
      timeEntries,
      shifts,
      leaveRequests,
      shiftRequests,
      payslips,

      workplaceRecords: [
        ...(workplaceRecordsResult.data || []),
        ...(activityResult.data || []),
      ],

      interactions:
        interactionsResult.data || [],
    };

    setProfile(employeeProfile);
    setData(loadedWorkspace);

    saveOfflineWorkspace(
      user.id,
      employeeProfile,
      loadedWorkspace
    );

    const toolsError =
      workplaceRecordsResult.error ||
      interactionsResult.error ||
      activityResult.error;

    setError(
      toolsError
        ? `Some workplace tools could not load. Ask your administrator to apply the latest database update. Details: ${getErrorMessage(toolsError)}`
        : ""
    );

    return true;
  } catch (loadError) {
    if (
      generation !== workspaceGeneration.current
    ) {
      return false;
    }

    if (isMissingSchemaError(loadError)) {
      setError(
        "The company workspace is not ready yet. Ask your administrator to finish database setup, then retry."
      );
    } else {
      const message = getErrorMessage(loadError);

      if (
        !navigator.onLine ||
        /failed to fetch|fetch failed|networkerror|network request failed|taking too long|timed out|aborted|aborterror/i
          .test(message)
      ) {
        setIsOnline(false);
      }

      setError(message);
    }

    return false;
  } finally {
    if (
      generation === workspaceGeneration.current
    ) {
      setDataLoading(false);
      setLoading(false);
    }
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
      if (event === "SIGNED_OUT") {
  clearOfflineWorkspace();
}
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
  const timer = window.setTimeout(() => {
    setStartupComplete(true);
  }, 1400);

  return () => window.clearTimeout(timer);
}, []);

 useEffect(() => {
  function handleOffline() {
    setIsOnline(false);
  }

  async function handleOnline() {
    if (
      reconnectInFlight.current ||
      !supabaseConfigured ||
      !navigator.onLine
    ) {
      return;
    }

    reconnectInFlight.current = true;

    try {
      const {
        data: authData,
        error: sessionError,
      } = await withTimeout(
        () => supabase.auth.getSession()
      );

      if (sessionError) throw sessionError;

      setSession(authData?.session || null);

      if (authData?.session) {
        const loaded = await loadWorkspace(
          authData.session.user
        );

        if (loaded) setIsOnline(true);
      } else {
        clearOfflineWorkspace();
        setLoading(false);
        setIsOnline(true);
      }
    } catch (connectionError) {
      setIsOnline(false);
      setError(
        getErrorMessage(connectionError)
      );
      setLoading(false);
    } finally {
      reconnectInFlight.current = false;
    }
  }

  const reconnectTimer = window.setInterval(
    () => {
      if (
        navigator.onLine &&
        !connectionStatus.current
      ) {
        handleOnline();
      }
    },
    30000
  );

  window.addEventListener(
    "offline",
    handleOffline
  );

  window.addEventListener(
    "online",
    handleOnline
  );

  return () => {
    window.clearInterval(reconnectTimer);

    window.removeEventListener(
      "offline",
      handleOffline
    );

    window.removeEventListener(
      "online",
      handleOnline
    );
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
    if (!navigator.onLine) {
  setError(
    "Connect to the internet to save this action. Nothing was sent."
  );
  return null;
}
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
  const employeeShifts = data.shifts.filter(shift =>shift.employee_id === userId &&new Date(shift.ends_at) > new Date());
  const myLeaveRequests = data.leaveRequests.filter(request => request.employee_id === userId);
  const myShiftRequests = data.shiftRequests.filter(request => request.employee_id === userId);
  const pendingCount = myLeaveRequests.filter(request => request.status === "pending").length;
  const completedTasks = personalTasks.filter(task => task.status === "done").length;
  const completedPercent = personalTasks.length ? Math.round(completedTasks / personalTasks.length * 100) : 0;

  async function toggleClock() {
    const result = await mutate(() => supabase.rpc(openEntry ? "clock_out" : "clock_in"));
   if (result) setToast(clockMessage(Boolean(openEntry)));
  }

  async function updateTask(task, status) {
    const result = await mutate(() => supabase.from("tasks").update({ status }).eq("id", task.id).eq("status", task.status).select("id,status").single());
    if (result) setToast("Task progress saved.");
  }

  async function claimTask(task) {
    if (!navigator.onLine) {
  setError(
    "Connect to the internet to claim a task."
  );
  return;
}
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

  async function editAnnouncement(announcement, values) {
  const title = values.title.trim();
  const body = values.body.trim();

  if (!title || !body) {
    setError("Enter a headline and message.");
    return null;
  }

  const result = await mutate(() => supabase
    .from("announcements")
    .update({ title, body })
    .eq("id", announcement.id)
    .eq("title", announcement.title)
    .eq("body", announcement.body)
    .select("id")
    .single());

  if (result) setToast("Notice updated.");
  return result;
}

async function deleteAnnouncement(announcement) {
  if (!window.confirm("Delete this company notice?")) return null;

  const result = await mutate(() => supabase
    .from("announcements")
    .delete()
    .eq("id", announcement.id)
    .eq("title", announcement.title)
    .eq("body", announcement.body)
    .select("id")
    .single());

  if (result) setToast("Notice deleted.");
  return result;
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
   if (result) {
  form.reset();
  setToast(
    module.id === "collaboration.chat"
      ? "Message sent."
      : "Workspace record saved."
  );
}

return result;
  }

  async function saveOkr(record, payload) {
  if (!isManager || !session?.user?.id) {
    setError("Only managers and admins can maintain objectives.");
    return null;
  }

  if (
    record &&
    record.module_id !== "collaboration.okrs"
  ) {
    setError("This record is not an objective.");
    return null;
  }

  const changes = {
    title: payload.title,
    description: payload.description,
    status: payload.status,
    visibility: payload.visibility,
    due_date: payload.due_date,
    metadata: payload.metadata,
    updated_at: new Date().toISOString(),
  };

  const result = await mutate(() => {
    if (record) {
      return supabase
        .from("workplace_records")
        .update(changes)
        .eq("id", record.id)
        .eq("module_id", "collaboration.okrs")
        .eq("updated_at", record.updated_at)
        .eq(
          "metadata",
          JSON.stringify(record.metadata || {}),
        )
        .select("id")
        .single();
    }

    return supabase
      .from("workplace_records")
      .insert({
        ...changes,
        module_id: "collaboration.okrs",
        created_by: session.user.id,
      })
      .select("id")
      .single();
  });

  if (result) {
    setToast(
      record
        ? "Objective updated."
        : "Objective created.",
    );
  }

  return result;
}
async function saveMeeting(record, payload) {
  if (!isManager || !session?.user?.id) {
    setError(
      "Only managers and admins can maintain meetings.",
    );
    return null;
  }

  if (
    record &&
    record.module_id !== "collaboration.meetings"
  ) {
    setError("This record is not a meeting.");
    return null;
  }

  const changes = {
    title: payload.title,
    description: payload.description,
    status: payload.status,
    visibility: payload.visibility,
    due_date: payload.due_date,
    metadata: payload.metadata,
    updated_at: new Date().toISOString(),
  };

  const result = await mutate(() => {
    if (record) {
      return supabase
        .from("workplace_records")
        .update(changes)
        .eq("id", record.id)
        .eq("module_id", "collaboration.meetings")
        .eq("updated_at", record.updated_at)
        .eq(
          "metadata",
          JSON.stringify(record.metadata || {}),
        )
        .select("id")
        .single();
    }

    return supabase
      .from("workplace_records")
      .insert({
        ...changes,
        module_id: "collaboration.meetings",
        created_by: session.user.id,
      })
      .select("id")
      .single();
  });

  if (result) {
    setToast(
      record
        ? "Meeting updated."
        : "Meeting scheduled.",
    );
  }

  return result;
}
async function saveDesignReference(record, payload) {
  if (!isManager || !session?.user?.id) {
    setError(
      "Only managers and admins can maintain design references.",
    );
    return null;
  }

  if (
    record &&
    record.module_id !== "collaboration.design-system"
  ) {
    setError("This record is not a design reference.");
    return null;
  }

  const changes = {
    title: payload.title,
    description: payload.description,
    status: payload.status,
    visibility: payload.visibility,
    metadata: payload.metadata,
    updated_at: new Date().toISOString(),
  };

  const result = await mutate(() => {
    if (record) {
      return supabase
        .from("workplace_records")
        .update(changes)
        .eq("id", record.id)
        .eq("module_id", "collaboration.design-system")
        .eq("updated_at", record.updated_at)
        .eq(
          "metadata",
          JSON.stringify(record.metadata || {}),
        )
        .select("id")
        .single();
    }

    return supabase
      .from("workplace_records")
      .insert({
        ...changes,
        module_id: "collaboration.design-system",
        created_by: session.user.id,
      })
      .select("id")
      .single();
  });

  if (result) {
    setToast(
      record
        ? "Design reference updated."
        : "Design reference created.",
    );
  }

  return result;
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
  try {
    setError("");
    const { jsPDF } = await import("jspdf");
    const employee = data.employees.find(
      item => item.id === payslip.employee_id
    );
    const gross = Number(payslip.gross_pay);
    const deductions = Number(payslip.deductions);

    if (!Number.isFinite(gross) || !Number.isFinite(deductions)) {
      throw new Error("This payslip has invalid pay amounts.");
    }

    const money = value => new Intl.NumberFormat("en-ZA", {
      style: "currency",
      currency: "ZAR"
    }).format(value).replace(/[\u00a0\u202f]/g, " ");

    const loadLogo = path => new Promise((resolve, reject) => {
      const img = new Image();
      const timer = setTimeout(() => {
        reject(new Error("Logo loading timed out. Please retry."));
      }, 10000);

      img.onload = () => {
        clearTimeout(timer);
        try {
          const canvas = document.createElement("canvas");
          canvas.width = 1200;
          canvas.height = Math.round(
            1200 * img.naturalHeight / img.naturalWidth
          );

          const context = canvas.getContext("2d");
          if (!context) {
            throw new Error("Your browser could not prepare the payslip logo.");
          }

          context.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/png"));
        } catch (error) {
          reject(error);
        }
      };

      img.onerror = () => {
        clearTimeout(timer);
        reject(new Error(
          `Could not load ${path}. Check the logo file in public.`
        ));
      };

      img.src = path;
    });

    const [mark, wordmark] = await Promise.all([
      loadLogo("/techdev-mark.png"),
      loadLogo("/techdev-wordmark.png")
    ]);

    const pdf = new jsPDF({ unit: "mm", format: "a4" });
pdf.setProperties({
  title: "Tech Dev employee payslip",
  author: "Tech Dev"
});

const ink = [239, 244, 250];
const muted = [165, 182, 204];
const gold = [222, 193, 137];

const write = (
  text, x, y, size = 10, bold = false,
  color = ink, align = "left"
) => {
  pdf.setFont("helvetica", bold ? "bold" : "normal");
  pdf.setFontSize(size);
  pdf.setTextColor(...color);
  pdf.text(text, x, y, { align });
};

const rule = (y, x1 = 18, x2 = 192) => {
  pdf.setDrawColor(47, 64, 85);
  pdf.setLineWidth(0.2);
  pdf.line(x1, y, x2, y);
};

// Navy page and formal branded header.
pdf.setFillColor(11, 20, 35);
pdf.rect(0, 0, 210, 297, "F");

const fitBrandImage = (image, maxWidth, maxHeight) => {
  const properties = pdf.getImageProperties(image);
  const scale = Math.min(
    maxWidth / properties.width,
    maxHeight / properties.height,
  );

  return {
    width: properties.width * scale,
    height: properties.height * scale,
  };
};

const markSize = fitBrandImage(mark, 22, 22);
const wordmarkSize = fitBrandImage(wordmark, 42, 12);

pdf.addImage(
  mark, "PNG",
  18, 15,
  markSize.width, markSize.height,
);

pdf.addImage(
  wordmark, "PNG",
  48, 20,
  wordmarkSize.width, wordmarkSize.height,
);

write("EMPLOYEE PAYSLIP", 192, 23, 15, true, ink, "right");
write(
  "CONFIDENTIAL PAYROLL STATEMENT",
  192, 32, 8, false, muted, "right"
);

pdf.setDrawColor(...gold);
pdf.setLineWidth(0.5);
pdf.line(18, 43, 192, 43);

// Pay period.
write("PAY PERIOD", 18, 57, 8, true, muted);
pdf.setFont("helvetica", "bold");
pdf.setFontSize(13);

const periodLines = pdf.splitTextToSize(
  formatDateRange(
    payslip.period_start, payslip.period_end
  ).replace(/\u2013/g, "-"),
  174
);
write(periodLines, 18, 68, 13, true);

// Employee information and statement details.
const infoY = 81 + (periodLines.length - 1) * 6;

pdf.setFont("helvetica", "bold");
pdf.setFontSize(13);
const nameLines = pdf.splitTextToSize(
  employee?.display_name || "Employee", 86
);

pdf.setFont("helvetica", "normal");
pdf.setFontSize(9);
const jobLines = employee?.job_title
  ? pdf.splitTextToSize(employee.job_title, 86)
  : [];

const jobY = infoY + 24 + nameLines.length * 6;
const infoBottom = Math.max(
  infoY + 59,
  jobY + jobLines.length * 5 + 11
);

pdf.setFillColor(17, 30, 49);
pdf.rect(18, infoY, 174, infoBottom - infoY, "F");

write("EMPLOYEE", 26, infoY + 13, 8, true, muted);
write(nameLines, 26, infoY + 24, 13, true);

if (jobLines.length) {
  write(jobLines, 26, jobY, 9, false, muted);
}

pdf.setDrawColor(47, 64, 85);
pdf.setLineWidth(0.2);
pdf.line(120, infoY + 10, 120, infoBottom - 10);

write("ISSUE DATE", 130, infoY + 13, 8, true, muted);
write(
  payslip.published_at
    ? formatDate(payslip.published_at, {
        day: "numeric",
        month: "short",
        year: "numeric"
      })
    : "Not recorded",
  130, infoY + 24, 10
);

write(
  "STATEMENT REFERENCE",
  130, infoY + 40, 8, true, muted
);
write(
  String(payslip.id || "").slice(0, 13).toUpperCase(),
  130, infoY + 50, 10
);

// Structured earnings table.
write("EARNINGS & DEDUCTIONS", 18, infoBottom + 17, 9, true);

const tableY = infoBottom + 24;
pdf.setFillColor(22, 38, 60);
pdf.rect(18, tableY, 174, 11, "F");

write("ITEM", 26, tableY + 7, 8, true, muted);
write("PAY COMPONENT", 43, tableY + 7, 8, true, muted);
write(
  "AMOUNT (ZAR)", 184, tableY + 7,
  8, true, muted, "right"
);

write("01", 26, tableY + 24, 9, false, muted);
write("Gross earnings", 43, tableY + 24, 11);
write(
  money(gross), 184, tableY + 24,
  12, true, ink, "right"
);
rule(tableY + 31);

write("02", 26, tableY + 44, 9, false, muted);
write("Total deductions", 43, tableY + 44, 11);
write(
  money(deductions), 184, tableY + 44,
  12, true, ink, "right"
);
rule(tableY + 51);

// Net pay with a gold accent.
const netY = tableY + 61;

pdf.setFillColor(21, 39, 63);
pdf.rect(18, netY, 174, 27, "F");
pdf.setFillColor(...gold);
pdf.rect(18, netY, 1.2, 27, "F");

write("NET PAY", 26, netY + 11, 10, true);
write(
  "Gross earnings less deductions",
  26, netY + 20, 8, false, muted
);
write(
  money(gross - deductions), 184, netY + 17,
  21, true, gold, "right"
);

write(
  "Currency: South African rand (ZAR).",
  18, netY + 38, 8, false, muted
);

// Document footer.
rule(274);
write("TECHDEV WORKFORCE", 18, 282, 8, true, muted);
write(
  "Confidential | Keep for your records",
  105, 282, 8, false, muted, "center"
);
write("01 / 01", 192, 282, 8, false, muted, "right");

pdf.save(`techdev-payslip-${payslip.period_start}.pdf`);
  } catch (error) {
    setError(getErrorMessage(error));
  }
}
 async function toggleAvatarUploads(enabled) {
  if (profile?.role !== "admin" || featureSaving) return;

  const actor = session?.user?.id;
  setFeatureSaving(true);
  setError("");

  try {
    const { data: feature, error } = await supabase
      .from("app_features")
      .update({ enabled })
      .eq("name", "avatar_uploads")
      .select("enabled")
      .single();

    if (error) throw error;
    if (authUserIdRef.current !== actor) return;

    setAvatarUploadsEnabled(feature.enabled);
    setToast(
      `Profile photo uploads ${feature.enabled ? "enabled" : "disabled"}.`
    );
  } catch (error) {
    if (authUserIdRef.current === actor) {
      setError(getErrorMessage(error));
    }
  } finally {
    setFeatureSaving(false);
  }
}
async function uploadAvatar(file) {
  if (!avatarUploadsEnabled) {
  throw new Error("Profile photo uploads are disabled by your administrator.");
}
  const account = session;
  const owner = account?.user?.id;

  if (!owner) throw new Error("Please sign in again.");

  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new Error("Choose a JPG, PNG or WebP photo.");
  }

  if (file.size > 5 * 1024 * 1024) {
    throw new Error("Choose a photo smaller than 5 MB.");
  }

  const bitmap = await createImageBitmap(file);
  let image;

  try {
    if (bitmap.width * bitmap.height > 24000000) {
      throw new Error("Choose a smaller-resolution photo.");
    }

    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 512;
    const ctx = canvas.getContext("2d");

    if (!ctx) throw new Error("Could not prepare this photo.");

    ctx.fillStyle = "#f2f5f9";
    ctx.fillRect(0, 0, 512, 512);

    const side = Math.min(bitmap.width, bitmap.height);
    ctx.drawImage(
      bitmap,
      (bitmap.width - side) / 2,
      (bitmap.height - side) / 2,
      side, side,
      0, 0, 512, 512
    );

    image = canvas.toDataURL("image/jpeg", 0.86);
  } finally {
    bitmap.close();
  }

  if (authUserIdRef.current !== owner) {
    throw new Error("Your account changed. Please retry.");
  }

  const { data: result, error } = await supabase.functions.invoke(
    "upload-avatar",
    {
      headers: { Authorization: `Bearer ${account.access_token}` },
      body: { image }
    }
  );

  if (error) {
    let message = "Could not upload the photo. Please retry.";
    if (error.context?.json) {
      const response = await error.context.json().catch(() => null);
      message = response?.error || message;
    }
    throw new Error(message);
  }

  if (!result?.path?.startsWith(`${owner}/`)) {
    throw new Error("Invalid upload response. Please refresh.");
  }

  if (authUserIdRef.current !== owner) return;

  const { data: refreshed, error: refreshError } =
    await supabase.auth.refreshSession();

  if (refreshError) {
    throw new Error("Photo saved. Refresh the app to see it.");
  }

  setSession(refreshed.session);
}
async function signOut() {
  clearOfflineWorkspace();
  try {
    await disableDeviceNotifications(userId);
  } catch {
    console.warn("Device notification cleanup could not be completed.");
  }

  try {
    const { error: signOutError } = await withTimeout(() =>
      supabase.auth.signOut({ scope: "local" })
    );

    if (signOutError) throw signOutError;
  } catch (signOutError) {
    setError(getErrorMessage(signOutError));
  }
}
  if (!supabaseConfigured) return <ConfigScreen />;
  if (!startupComplete) {
  return <StartupScreen isOnline={isOnline} />;
}
  if (!isOnline) {
  return (
    <OfflineWorkspace
      viewerId={session?.user?.id}
    />
  );
}
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
  <EmployeeProfilesProvider
  userId={userId}
  role={profile?.role || "employee"}
  employees={data.employees}
>
      <NavigationDrawer
  key={userId}
  open={mobileMenuOpen}
  items={visibleNavigation}
  activeView={activeView}
  activeModuleId={suiteModule}
  onNavigate={navigate}
  onClose={closeMenu}
  onSignOut={signOut}
  name={displayName}
  role={profile?.role}
  avatarSrc={avatarSrc}
  onOpenDevTests={() => setDevTestsOpen(true)}
/>
      <main className="main-area" inert={mobileMenuOpen ? true : undefined}>
        <header className="topbar">
          <div className="topbar-left"><button className="icon-button menu-trigger" aria-label="Open menu" aria-expanded={mobileMenuOpen} aria-controls="workspace-menu" onClick={toggleNavigation}><Menu size={21} /></button><Brand compact /><span className="desktop-page-name">{heading}</span></div>
          <nav className="desktop-primary-nav" aria-label="Primary navigation">{navigation.filter(item => ["overview", "tasks", "attendance"].includes(item.id)).map(item => <NavItem key={item.id} item={item} active={activeView === item.id} onClick={() => navigate(item.id)} />)}</nav>
          <div className="topbar-right"><button className="icon-button" aria-label="Company notices" onClick={() => navigate("notices")}><Bell size={18} /></button><AccountMenu userId={userId}
          avatarUploadsEnabled={avatarUploadsEnabled}featureSaving={featureSaving}onTogglePhotoUploads={toggleAvatarUploads}
          avatarSrc={avatarSrc}onUpload={uploadAvatar}
           name={displayName}email={session?.user?.email || ""}role={profile?.role}onSignOut={signOut}closeSignal={`${activeView}:${mobileMenuOpen}`}/></div>
        </header><div className="page-content">
{activeView !== "overview" && (
  <div className="page-navigation">
    <button
      type="button"
      className="page-back-button"
      onClick={goBack}
      disabled={!canGoBack}
      aria-label="Go back to the previous page"
    >
      <ArrowLeft size={18} />
      <span>Back</span>
    </button>
  </div>
)}
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
          {activeView === "suite" && <WorkplaceSuite key={suiteModule || "all"} initialModuleId={suiteModule} interactions={data.interactions} onInteract={recordInteraction} records={data.workplaceRecords} employees={data.employees} tasks={data.tasks} announcements={announcements} isManager={isManager} userId={userId} onCreate={submitWorkplaceRecord} onSaveOkr={saveOkr} onSaveMeeting={saveMeeting} onSaveDesignReference={saveDesignReference} onRefreshDesign={() => loadWorkspace(session.user)} onStatus={updateWorkplaceRecord} onDelete={deleteWorkplaceRecord} onNavigate={navigate}role={profile?.role || "employee"} />}
          {activeView === "notices" && (
  <>
    <PageHeading
      eyebrow="KEEP UP TO DATE"
      title="Company notices"
      description="Announcements shared by your company."
    />

    <Card title="Latest updates">
      {announcements.length ? announcements.map(item => (
        <AnnouncementRow
          key={item.id}
          announcement={item}
          onEdit={isManager ? editAnnouncement : undefined}
          onDelete={isManager ? deleteAnnouncement : undefined}
        />
      )) : (
        <EmptyState
          icon={Megaphone}
          title="No notices yet"
          text="Company updates will appear here."
        />
      )}
    </Card>
  </>
)}
          {activeView === "insights" && isManager && <InsightsView data={isManager ? data : { ...data, tasks: personalTasks, timeEntries: data.timeEntries.filter(entry => entry.employee_id === userId) }} isManager={isManager} />}
          {activeView === "activity" && <ActivityFeedView records={data.workplaceRecords.filter(record => record.module_id === "collaboration.activity")} onOpen={openActivityItem} />}
          </fieldset>
        </div>
      </main>
      <nav className="mobile-nav" aria-label="Mobile navigation" inert={mobileMenuOpen ? true : undefined}>
        {navigation.filter(item => ["overview", "tasks", "attendance"].includes(item.id)).map(item => <NavItem key={item.id} item={item} active={activeView === item.id} onClick={() => navigate(item.id)} mobile />)}
        <button className={`mobile-nav-item${mobileMenuOpen ? " active" : ""}`} onClick={toggleNavigation} aria-label="More tools" aria-expanded={mobileMenuOpen}><Menu size={20} /><span>More</span></button>
      </nav>
      {devTestsOpen &&
  profile?.id === userId &&
  profile?.role === "admin" && (
    <DevAppTest
      key={userId}
      userId={userId}
      onClose={() => setDevTestsOpen(false)}
    />
  )}
  <ChatDelivery userId={userId} />
          {toast && <div className="toast" role="status"><Check size={16} />{toast}</div>}
      </EmployeeProfilesProvider>
    </div>
  );
}
function AccountMenu({
   userId, name, email, role, onSignOut, closeSignal, avatarSrc, onUpload, avatarUploadsEnabled, featureSaving, onTogglePhotoUploads
}) {
  const menuRef = useRef(null);
  const photoInput = useRef(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const [failedAvatarSrc, setFailedAvatarSrc] = useState("");
async function choosePhoto(event) {
  const file = event.target.files?.[0];
  event.target.value = "";

  if (!file || photoBusy) return;

  setPhotoBusy(true);
  setPhotoError("");

  try {
    await onUpload(file);
  } catch (error) {
    setPhotoError(getErrorMessage(error));
  } finally {
    setPhotoBusy(false);
  }
}

  useEffect(() => {
    if (menuRef.current) menuRef.current.open = false;
  }, [closeSignal]);

  useEffect(() => {
    function closeOutside(event) {
      const menu = menuRef.current;
      if (menu?.open && !menu.contains(event.target)) {
        menu.open = false;
      }
    }

    function closeWithEscape(event) {
      const menu = menuRef.current;
      if (event.key === "Escape" && menu?.open) {
        event.preventDefault();
        menu.open = false;
        menu.querySelector("summary")?.focus();
      }
    }

    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeWithEscape);

    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeWithEscape);
    };
  }, []);

  return (
    <details
      ref={menuRef}
      className="account-menu"
      onBlur={event => {
        if (
          event.relatedTarget &&
          !event.currentTarget.contains(event.relatedTarget)
        ) {
          event.currentTarget.open = false;
        }
      }}
    >
      <summary
  className="top-avatar account-trigger"
  aria-label="My account"
>
  {avatarSrc && failedAvatarSrc !== avatarSrc ? (
    <img
      key={avatarSrc}
      src={avatarSrc}
      alt=""
      draggable={false}
      onError={() => setFailedAvatarSrc(avatarSrc)}
    />
  ) : (
    initials(name)
  )}
</summary>

      <section className="account-panel" aria-label="Account details">
        <p className="account-label">MY ACCOUNT</p>
        <strong className="account-name">{name}</strong>
        <span className="account-email">{email}</span>
        <span className="account-role">{role || "employee"}</span>

{role === "admin" && (
  <label className="account-feature-toggle">
    <span>Employee photo uploads</span>
    <input
      type="checkbox"
      checked={avatarUploadsEnabled}
      disabled={featureSaving || photoBusy}
      onChange={event =>
        onTogglePhotoUploads(event.target.checked)
      }
    />
  </label>
)}

{avatarUploadsEnabled && (
  
  <>
    <input
      ref={photoInput}
      hidden
      type="file"
      accept="image/jpeg,image/png,image/webp"
      disabled={photoBusy}
      onChange={choosePhoto}
    />

    <button
      type="button"
      className="account-photo-button"
      disabled={photoBusy}
      onClick={() => photoInput.current?.click()}
    >
      {photoBusy
        ? "Checking photo..."
        : avatarSrc
          ? "Change profile photo"
          : "Upload profile photo"}
    </button>

    {photoError && (
      <p className="account-photo-error" role="alert">
        {photoError}
      </p>
    )}
  </>
)}    
   <NotificationSettings
         userId={userId}
         disabled={photoBusy}
         onSignOut={async () => {
         menuRef.current.open = false;
         await onSignOut();
  }}
/>
      </section>
    </details>
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
    {task.assignee_id && (
  <EmployeeAvatar employeeId={task.assignee_id} />
)}
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

function AnnouncementRow({ announcement, onEdit, onDelete }) {
  const [editing, setEditing] = useState(false);

  async function save(event) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);

    const result = await onEdit(announcement, {
      title: String(values.get("title") || ""),
      body: String(values.get("body") || ""),
    });

    if (result) setEditing(false);
  }

  return (
    <article className="announcement-row">
<EmployeeAvatar
  employeeId={announcement.author_id}
  name="Company team"
/>

      <div style={{ flex: 1 }}>
        {editing ? (
          <form className="form-stack" onSubmit={save}>
            <label className="field">
              <span>Headline</span>
              <input
                name="title"
                required
                maxLength={120}
                defaultValue={announcement.title}
              />
            </label>

            <label className="field">
              <span>Message</span>
              <textarea
                name="body"
                required
                maxLength={2000}
                defaultValue={announcement.body}
              />
            </label>

            <div className="request-actions">
              <button type="submit" className="primary-button">
                Save changes
              </button>
              <button
                type="button"
                className="outline-button"
                onClick={() => setEditing(false)}
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <>
            <strong>{announcement.title}</strong>
            <p>{announcement.body}</p>
            <time>
              {announcement.author?.display_name || "Company team"} ·{" "}
              {formatDate(announcement.created_at, {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </time>

            {(onEdit || onDelete) && (
              <div className="request-actions" style={{ marginTop: 12 }}>
                {onEdit && (
                  <button
                    type="button"
                    className="outline-button small-outline"
                    onClick={() => setEditing(true)}
                  >
                    Edit
                  </button>
                )}

                {onDelete && (
                  <button
                    type="button"
                    className="decline-button"
                    onClick={() => onDelete(announcement)}
                  >
                    Delete
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </article>
  );
}

function PayslipPreview({ payslip, onDownload }) {
  const net = Number(payslip.gross_pay) - Number(payslip.deductions);
  return <div className="payslip-preview"><span className="muted-label">TAKE-HOME PAY</span><strong className="pay-total">{new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(net)}</strong><span className="pay-period">{formatDateRange(payslip.period_start, payslip.period_end)}</span><div className="payslip-breakdown"><span>Gross pay <strong>{new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(payslip.gross_pay)}</strong></span><span>Deductions <strong>−{new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(payslip.deductions)}</strong></span></div><button className="outline-button full-button" onClick={() => onDownload(payslip)}><ArrowDownToLine size={15} /> Download statement</button></div>;
}

function EmptyState({ icon: Icon, title, text }) {
  return <div className="empty-state"><span><Icon size={18} /></span><strong>{title}</strong><p>{text}</p></div>;
}

function ActivityFeedView({ records, onOpen }) {
  return (
    <>
      <PageHeading eyebrow="WORKSPACE ACTIVITY" title="Company activity" description="A shared, database-recorded history of employee, task, time, schedule, leave, announcement, and payslip changes." />
      <Card className="activity-feed-card"title="Recent activity"subtitle={`${records.length} recent events`}>
        {records.length ? (
          <div className="suite-record-list">
            {records.map(record => <article className="suite-record-row" key={record.id}>
              {record.metadata?.actor_id ? (<EmployeeAvatar employeeId={record.metadata.actor_id} />) : (<span className="suite-record-icon"><Bell size={16} /></span>)}
              <div className="suite-record-copy"><strong>{record.title}</strong><p>{record.description}</p><small>{record.metadata?.source_table?.replaceAll("_", " ") || "Workspace"} · {new Date(record.created_at).toLocaleString()}</small></div>
              {record.metadata?.source_id &&
  record.metadata?.operation !== "DELETE" && (
    <button
      className="outline-button activity-open-button"
      onClick={() => onOpen(record)}
    >
      <ArrowRight size={14} />
      View item
    </button>
  )}
            
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
        {!isManager && (
  <Card
    title="Request a shift change"
    subtitle="Ask your manager to review a different shift time."
  >
    {!myShifts.length && (
      <p className="muted-copy" role="status">
        No current or upcoming shift is assigned to you.
        Ask your manager to publish your shift first.
      </p>
    )}

    <form className="form-grid" onSubmit={onShiftRequest}>
      <Field label="Scheduled shift">
        <select
          name="shift"
          required
          defaultValue=""
          disabled={!myShifts.length}
        >
          <option value="" disabled>
            {myShifts.length
              ? "Select your scheduled shift"
              : "No assigned shifts"}
          </option>

          {myShifts.map(shift => (
            <option key={shift.id} value={shift.id}>
              {formatDate(shift.starts_at, {
                month: "short",
                day: "numeric",
                year: "numeric",
              })} · {formatTime(shift.starts_at)}–{formatTime(shift.ends_at)}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Requested shift">
        <select name="template" disabled={!myShifts.length}>
          {shiftTemplates.map(shift => (
            <option key={shift.label} value={shift.label}>
              {shift.label} ·{" "}
              {formatTime(`2000-01-01T${shift.start}:00`)}–
              {formatTime(`2000-01-01T${shift.end}:00`)}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Reason">
        <textarea
          name="reason"
          required
          maxLength={1000}
          disabled={!myShifts.length}
          placeholder="Help your manager understand the change."
        />
      </Field>

      <button
        className="primary-button form-action"
        type="submit"
        disabled={!myShifts.length}
      >
        Request shift change <ArrowRight size={15} />
      </button>
    </form>
  </Card>
)}
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
    {isManager && <Card title="Publish a payslip" subtitle="The employer supplies the pay values. Techdev does not calculate payroll or tax."><form className="form-grid" onSubmit={onCreate}><Field label="Employee"><select name="employee" required defaultValue=""><option value="" disabled>Select an employee</option>{employees.map(employee => <option key={employee.id} value={employee.id}>{employee.display_name}</option>)}</select></Field><Field label="Period starts"><input name="period_start" type="date" required /></Field><Field label="Period ends"><input name="period_end" type="date" required /></Field><Field label="Gross pay (R)"><input name="gross" type="number" min="0" step="0.01" required /></Field><Field label="Deductions (R)"><input name="deductions" type="number" min="0" step="0.01" defaultValue="0" required /></Field><button className="primary-button form-action" type="submit"><Plus size={15} /> Publish payslip</button></form></Card>}
    {Object.keys(grouped).length ? Object.entries(grouped).sort(([a], [b]) => Number(b) - Number(a)).map(([year, yearSlips]) => <Card key={year} className="spaced-card" title={year} subtitle={`${yearSlips.length} pay ${yearSlips.length === 1 ? "statement" : "statements"}`}>
      <div className="slip-list">{yearSlips.map(slip => { const person = employees.find(employee => employee.id === slip.employee_id); return <div className="slip-row" key={slip.id}><span className="slip-icon"><FileText size={17} /></span><span className="slip-description"><strong>{formatDate(slip.period_start, { month: "long", year: "numeric" })}</strong><small>{formatDateRange(slip.period_start, slip.period_end)}{isManager ? ` · ${person?.display_name || "Employee"}` : ""}</small></span><span className="slip-net">{new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(slip.gross_pay - slip.deductions)}</span><button className="outline-button small-outline" onClick={() => onDownload(slip)}><ArrowDownToLine size={14} /> PDF</button></div>; })}</div>
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
