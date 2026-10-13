import { useEffect, useRef, useState } from "react";
import { LogOut } from "lucide-react";
import {
  getDeviceNotificationStatus,
  enableDeviceNotifications,
  disableDeviceNotifications,
} from "../lib/pushNotifications.js";

export default function NotificationSettings({
  userId,
  disabled = false,
  onSignOut,
}) {
  const [status, setStatus] = useState({
    enabled: false,
    supported: true,
  });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const lock = useRef(false);
  const currentUser = useRef(userId);
  currentUser.current = userId;

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");

    getDeviceNotificationStatus(userId)
      .then(value => {
        if (active) setStatus(value);
      })
      .catch(problem => {
        if (active) {
          setError(problem.message || "Could not check notifications.");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [userId]);

  async function changeNotifications() {
    if (lock.current || disabled || loading) return;

    lock.current = true;
    setBusy("notifications");
    setError("");
    const owner = userId;

    try {
      await (
        status.enabled
          ? disableDeviceNotifications(owner)
          : enableDeviceNotifications(owner)
      );

      const value = await getDeviceNotificationStatus(owner);

      if (currentUser.current === owner) {
        setStatus(value);
      }
    } catch (problem) {
      if (currentUser.current === owner) {
        setError(problem.message || "Could not update notifications.");
      }
    } finally {
      lock.current = false;
      setBusy("");
    }
  }

  async function signOut() {
    if (lock.current || disabled) return;

    lock.current = true;
    setBusy("signout");
    setError("");

    try {
      await onSignOut();
    } catch (problem) {
      setError(problem.message || "Could not sign out. Try again.");
    } finally {
      lock.current = false;
      setBusy("");
    }
  }

  return (
    <>
      <div
        className="account-notifications"
        aria-busy={loading || Boolean(busy)}
      >
        <strong>Device notifications</strong>

        <p role="status">
          {loading
            ? "Checking this device..."
            : status.message ||
              (
                status.blocked
                  ? "Blocked in your browser's site settings."
                  : status.enabled
                    ? "Enabled on this device."
                    : "Off on this device."
              )}
        </p>

        {status.supported && (
          <button
            type="button"
            className="account-notification-button"
            disabled={disabled || loading || Boolean(busy)}
            onClick={changeNotifications}
          >
            {busy === "notifications"
              ? "Saving..."
              : status.enabled
                ? "Disable notifications"
                : "Enable notifications"}
          </button>
        )}

        {error && (
          <p className="account-notification-error" role="alert">
            {error}
          </p>
        )}
      </div>

      <button
        type="button"
        className="account-signout"
        disabled={disabled || Boolean(busy)}
        onClick={signOut}
      >
        <LogOut size={17} aria-hidden="true" />
        {busy === "signout" ? "Signing out..." : "Sign out"}
      </button>
    </>
  );
}