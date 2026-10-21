const project = String(
  import.meta.env.VITE_SUPABASE_URL || "unconfigured"
);

const key = `legion-offline-workspace-v1:${project}`;
const maxAge = 24 * 60 * 60 * 1000;

const text = (value, max = 2000) =>
  String(value || "").slice(0, max);

export function clearOfflineWorkspace() {
  try {
    localStorage.removeItem(key);
  } catch {
    // Storage may be unavailable.
  }

  window.dispatchEvent(
    new Event("legion-offline-copy-changed")
  );
}

export function saveOfflineWorkspace(userId, profile, data) {
  if (!userId || profile?.id !== userId) return;

  const list = name =>
    Array.isArray(data[name]) ? data[name] : [];

  const copy = {
    version: 1,
    owner: userId,
    savedAt: Date.now(),
    name: text(profile.display_name, 120),

    tasks: list("tasks")
      .filter(row => row.assignee_id === userId)
      .slice(0, 100)
      .map(row => ({
        id: row.id,
        title: text(row.title, 200),
        description: text(row.description),
        status: text(row.status, 30),
        due_date: row.due_date || null,
      })),

    shifts: list("shifts")
      .filter(row => row.employee_id === userId)
      .slice(0, 50)
      .map(row => ({
        id: row.id,
        starts_at: row.starts_at,
        ends_at: row.ends_at,
        location: text(row.location, 200),
      })),

    times: list("timeEntries")
      .filter(row => row.employee_id === userId)
      .slice(0, 50)
      .map(row => ({
        id: row.id,
        clocked_in_at: row.clocked_in_at,
        clocked_out_at: row.clocked_out_at || null,
      })),

    notices: list("announcements")
      .slice(0, 40)
      .map(row => ({
        id: row.id,
        title: text(row.title, 200),
        body: text(row.body),
        created_at: row.created_at,
      })),
  };

  try {
    const json = JSON.stringify(copy);

    localStorage.removeItem(key);

    if (json.length <= 300000) {
      localStorage.setItem(key, json);
    }
  } catch {
    // The online app still works if device storage is full.
  }
}

export function readOfflineWorkspace(viewerId) {
  try {
    if (!viewerId) {
      const projectRef = new URL(project)
        .hostname.split(".")[0];

      const storedSession = JSON.parse(
        localStorage.getItem(
          `sb-${projectRef}-auth-token`
        ) || "null"
      );

      viewerId = storedSession?.user?.id;
    }

    if (!viewerId) return null;

    const raw = localStorage.getItem(key);

    if (!raw || raw.length > 300000) return null;

    const copy = JSON.parse(raw);

    if (
      copy.version !== 1 ||
      !copy.owner ||
      !Number.isFinite(copy.savedAt) ||
      Date.now() - copy.savedAt > maxAge ||
      copy.savedAt > Date.now() + 60000 ||
      copy.owner !== viewerId ||
      typeof copy.name !== "string" ||
      ![
        copy.tasks,
        copy.shifts,
        copy.times,
        copy.notices,
      ].every(Array.isArray) ||
      copy.tasks.length > 100 ||
      copy.shifts.length > 50 ||
      copy.times.length > 50 ||
      copy.notices.length > 40
    ) {
      return null;
    }

    if (
      copy.tasks.some(row =>
        !row?.id ||
        ![
          row.title,
          row.description,
          row.status,
        ].every(value => typeof value === "string")
      ) ||
      copy.notices.some(row =>
        !row?.id ||
        ![row.title, row.body].every(
          value => typeof value === "string"
        )
      ) ||
      copy.shifts.some(row =>
        !row?.id ||
        !Number.isFinite(Date.parse(row.starts_at)) ||
        !Number.isFinite(Date.parse(row.ends_at))
      ) ||
      copy.times.some(row =>
        !row?.id ||
        !Number.isFinite(Date.parse(row.clocked_in_at)) ||
        (
          row.clocked_out_at &&
          !Number.isFinite(Date.parse(row.clocked_out_at))
        )
      )
    ) {
      return null;
    }

    return copy;
  } catch {
    return null;
  }
}

export function registerOfflineShell() {
  if (
    !import.meta.env.PROD ||
    !window.isSecureContext ||
    !("serviceWorker" in navigator)
  ) {
    return;
  }

  const base = new URL(
    import.meta.env.BASE_URL,
    window.location.origin
  );

  navigator.serviceWorker
    .register(
      new URL("legion-push-sw.js", base).href,
      {
        scope: base.pathname,
        updateViaCache: "none",
      }
    )
    .catch(error => {
      console.warn(
        "Legion offline setup:",
        error.message
      );
    });
}