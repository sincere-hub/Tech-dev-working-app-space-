import {
  createContext, useContext, useEffect,
  useMemo, useRef, useState
} from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { supabase } from "../lib/supabase.js";

const ProfilesContext = createContext(null);

function initials(name) {
  return String(name || "Employee")
    .trim().split(/\s+/).filter(Boolean)
    .slice(0, 2).map(part => part[0])
    .join("").toUpperCase();
}

async function loadPhotos() {
  const rows = [];

  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase
      .from("employee_profile_photos")
      .select("employee_id,path")
      .order("employee_id")
      .range(offset, offset + 999);

    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < 1000) break;
  }

  const approved = rows.filter(row =>
    typeof row.path === "string" &&
    row.path.startsWith(`${row.employee_id}/`) &&
    row.path.length <= 180
  );

  const signedByPath = new Map();

  for (let offset = 0; offset < approved.length; offset += 100) {
    const paths = approved
      .slice(offset, offset + 100)
      .map(row => row.path);

    const { data, error } = await supabase.storage
      .from("employee-avatars")
      .createSignedUrls(paths, 3600);

    if (error) throw error;

    for (const item of data || []) {
      if (!item.error && item.path && item.signedUrl) {
        signedByPath.set(item.path, item.signedUrl);
      }
    }
  }

  return Object.fromEntries(approved.map(row => [
    row.employee_id,
    signedByPath.get(row.path) || ""
  ]));
}

function useEmployeePhotos(userId) {
  const [state, setState] = useState({
    owner: "",
    photos: {}
  });

  useEffect(() => {
    if (!userId || !supabase) return;

    let live = true;
    let request = 0;
    let debounce;

    async function refresh() {
      const current = ++request;

      try {
        const photos = await loadPhotos();
        if (live && current === request) {
          setState({ owner: userId, photos });
        }
      } catch {
        if (live && current === request) {
          setState({ owner: userId, photos: {} });
        }
      }
    }

    function scheduleRefresh() {
      window.clearTimeout(debounce);
      debounce = window.setTimeout(refresh, 250);
    }

    refresh();

    const channel = supabase
      .channel(`employee-photos-${userId}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "employee_profile_photos"
      }, scheduleRefresh)
      .subscribe(status => {
        if (status === "SUBSCRIBED") scheduleRefresh();
      });

    const timer = window.setInterval(
      refresh, 45 * 60 * 1000
    );

    window.addEventListener("focus", scheduleRefresh);
    window.addEventListener("online", scheduleRefresh);

    return () => {
      live = false;
      request++;
      window.clearTimeout(debounce);
      window.clearInterval(timer);
      window.removeEventListener("focus", scheduleRefresh);
      window.removeEventListener("online", scheduleRefresh);
      supabase.removeChannel(channel);
    };
  }, [userId]);

  return state.owner === userId ? state.photos : {};
}

export function EmployeeProfilesProvider({
  userId, employees = [], children
}) {
  const photos = useEmployeePhotos(userId);
  const [selection, setSelection] = useState(null);

  const byId = useMemo(
    () => new Map(employees.map(person => [person.id, person])),
    [employees]
  );

  const person = selection?.owner === userId
    ? byId.get(selection.id)
    : null;

  const value = {
    photos,
    byId,
    open: id => setSelection({ owner: userId, id })
  };

  return (
    <ProfilesContext.Provider value={value}>
      {children}

      {person && createPortal(
        <EmployeePhotoDialog
          key={`${userId}:${person.id}`}
          employee={person}
          src={photos[person.id] || ""}
          onClose={() => setSelection(null)}
        />,
        document.body
      )}
    </ProfilesContext.Provider>
  );
}

export default function EmployeeAvatar({
  employeeId, name, interactive = true
}) {
  const context = useContext(ProfilesContext);
  const employee = context?.byId.get(employeeId);
  const label = employee?.display_name || name || "Employee";
  const src = context?.photos[employeeId] || "";
  const [failed, setFailed] = useState("");

  const content = src && failed !== src ? (
    <img
      key={src}
      src={src}
      alt=""
      loading="lazy"
      draggable={false}
      onError={() => setFailed(src)}
    />
  ) : (
    <span>{initials(label)}</span>
  );

  return interactive && employee ? (
    <button
      type="button"
      className="employee-avatar"
      aria-label={`View ${label}'s profile photo`}
      onClick={() => context.open(employeeId)}
    >
      {content}
    </button>
  ) : (
    <span
      className="employee-avatar"
      role="img"
      aria-label={label}
    >
      {content}
    </span>
  );
}

function EmployeePhotoDialog({ employee, src, onClose }) {
  const dialog = useRef(null);
  const [failed, setFailed] = useState("");

  useEffect(() => {
    const element = dialog.current;
    if (!element.open) element.showModal();

    return () => {
      if (element.open) element.close();
    };
  }, []);

  return (
    <dialog
      ref={dialog}
      className="employee-photo-dialog"
      aria-label={`${employee.display_name}'s profile photo`}
      onCancel={event => {
        event.preventDefault();
        onClose();
      }}
      onClick={event => {
        if (event.target === dialog.current) onClose();
      }}
    >
      <header className="employee-photo-header">
        <strong>{employee.display_name}</strong>
        <button
          type="button"
          className="employee-photo-close"
          aria-label="Close profile photo"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </header>

      {src && failed !== src ? (
        <img
          className="employee-photo-large"
          key={src}
          src={src}
          alt={`${employee.display_name}'s profile photo`}
          onError={() => setFailed(src)}
        />
      ) : (
        <div
          className="employee-photo-placeholder"
          role="img"
          aria-label="No profile photo available"
        >
          {initials(employee.display_name)}
        </div>
      )}

      <footer className="employee-photo-footer">
        <strong>{employee.display_name}</strong>
        <span>{employee.job_title || "Employee"}</span>
      </footer>
    </dialog>
  );
}