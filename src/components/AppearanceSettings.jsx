import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";

const storageKey = "techdev.workspace.theme.v1";
const changeEvent = "techdev-theme-change";

function readSavedTheme() {
  try {
    return window.localStorage.getItem(storageKey) === "dark"
      ? "dark"
      : "light";
  } catch {
    return "light";
  }
}

let currentTheme =
  typeof window === "undefined" ? "light" : readSavedTheme();

function applyTheme() {
  if (typeof document !== "undefined") {
    document.documentElement.dataset.techdevTheme = currentTheme;
  }
}

applyTheme();

function subscribe(listener) {
  const changed = () => listener();

  const stored = event => {
    if (event.key !== storageKey && event.key !== null) return;

    currentTheme = readSavedTheme();
    applyTheme();
    listener();
  };

  window.addEventListener(changeEvent, changed);
  window.addEventListener("storage", stored);

  return () => {
    window.removeEventListener(changeEvent, changed);
    window.removeEventListener("storage", stored);
  };
}

function setTheme(next) {
  currentTheme = next === "dark" ? "dark" : "light";
  applyTheme();

  try {
    window.localStorage.setItem(storageKey, currentTheme);
  } catch {
    // Switching still works if browser storage is unavailable.
  }

  window.dispatchEvent(new Event(changeEvent));
}

export default function AppearanceSettings() {
  const theme = useSyncExternalStore(
    subscribe,
    () => currentTheme,
    () => "light"
  );

  const dark = theme === "dark";
  const Icon = dark ? Moon : Sun;

  return (
    <section className="td-appearance" aria-label="Appearance">
      <h3>Appearance</h3>

      <label className="td-appearance-row">
        <span className="td-appearance-icon">
          <Icon size={18} aria-hidden="true" />
        </span>

        <span className="td-appearance-copy">
          <strong>Dark mode</strong>
          <small>
            {dark
              ? "A softer view in low light"
              : "A bright, clear workspace"}
          </small>
        </span>

        <input
          className="td-theme-switch"
          type="checkbox"
          role="switch"
          aria-label="Dark mode"
          checked={dark}
          onChange={event =>
            setTheme(event.target.checked ? "dark" : "light")
          }
        />
      </label>
    </section>
  );
}