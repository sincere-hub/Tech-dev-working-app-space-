import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase.js";
import {
  clearOfflineWorkspace,
} from "../lib/offlineWorkspace.js";

export const APP_BUILD_NUMBER = "2026.10.15.1";

export default function DevAppTest({ userId, onClose }) {
  const dialog = useRef(null);
  const inFlight = useRef(false);

  const [preview, setPreview] = useState(null);
  const [confirmation, setConfirmation] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [done, setDone] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    dialog.current?.showModal();

    const timer = setInterval(
      () => setNow(Date.now()),
      1000,
    );

    return () => clearInterval(timer);
  }, []);

  async function request(body) {
    const { data: auth, error: sessionError } =
      await supabase.auth.getSession();

    if (
      sessionError ||
      auth.session?.user.id !== userId
    ) {
      throw new Error(
        "Your account changed. Reopen developer tools.",
      );
    }

    const { data, error: requestError } =
      await supabase.functions.invoke("dev-app-test", {
        body,
        headers: {
          Authorization:
            `Bearer ${auth.session.access_token}`,
        },
        timeout: 60000,
      });

    if (requestError) {
      let detail;

      try {
        detail = await requestError.context?.json();
      } catch {
        // Use the normal error message below.
      }

      throw new Error(
        detail?.error ||
        requestError.message ||
        "The request failed.",
      );
    }

    if (data?.error) throw new Error(data.error);
    return data;
  }

  async function run(action) {
    if (inFlight.current) return;

    inFlight.current = true;
    setBusy(true);
    setError("");

    try {
      let result = await request({
        action,
        confirmation,
        token: preview?.token,
      });

      if (action === "continue") {
        while (!result.done) {
          setPreview(result);
          setMessage(result.message || "Cleaning up…");

          if (Date.now() < Date.parse(result.ready_at)) {
            break;
          }

          result = await request({
            action: "continue",
            confirmation,
            token: result.token,
          });
        }
      }

      if (result.done) {
        clearOfflineWorkspace();

        try {
          const registrations =
            await navigator.serviceWorker.getRegistrations();

          for (const registration of registrations) {
            if (
              !registration.active?.scriptURL.endsWith(
                "/legion-push-sw.js",
              )
            ) {
              continue;
            }

            const subscription =
              await registration.pushManager
                .getSubscription();

            await subscription?.unsubscribe();

            const notifications =
              await registration.getNotifications();

            for (const notification of notifications) {
              notification.close();
            }
          }
        } catch {
          // Remote registrations were already removed.
        }

        setDone(true);
        setPreview(null);

        setMessage(
          "Reset complete. All existing accounts, including yours, were removed.",
        );
      } else {
        setPreview(result);

        setMessage(
          result.active
            ? "Reset in progress. Keep this page open, then continue below."
            : "Preview loaded. No data has been deleted.",
        );
      }
    } catch (failure) {
      setError(failure.message);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  const wait = preview?.active
    ? Math.max(
        0,
        Math.ceil(
          (Date.parse(preview.ready_at) - now) / 1000,
        ),
      )
    : 0;

  const blocked = Boolean(
    preview?.unknown_tables?.length ||
    preview?.other_files,
  );

  const confirmed =
  confirmation === "sudo legion factory-reset" &&
  acknowledged;

  async function finish() {
    try {
      await supabase.auth.signOut({ scope: "local" });
    } finally {
      window.location.reload();
    }
  }

  return (
    <dialog
      ref={dialog}
      className="dev-test-dialog"
      aria-labelledby="dev-test-title"
      onCancel={event => {
        event.preventDefault();
        if (!busy && !done) onClose();
      }}
    >
      <header>
        <div>
          <p className="eyebrow">
            ADMINISTRATOR · BUILD {APP_BUILD_NUMBER}
          </p>

          <h1 id="dev-test-title">DEV_APP_TEST</h1>
        </div>

        {!done && (
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            aria-label="Close developer tools"
          >
            Close
          </button>
        )}
      </header>

<aside className="dev-only-warning" role="note">
  <span className="dev-only-badge" aria-hidden="true">
    !
  </span>

  <div>
    <strong>Developers only</strong>

    <p>
      Restricted maintenance tools. Admin access is
      required. Factory reset permanently deletes
      existing app data and every account.
    </p>
  </div>
</aside>
      <p>
        This reset removes all existing work data,
        messages, leave, payslips, notices, activity,
        push registrations, profile photos, and login
        accounts—including every admin account.
      </p>

      <p>
        The app code, database structure, integration
        keys, and logo remain. Supabase logs/backups,
        downloads, offline copies, and notifications
        already stored on other devices are outside
        this reset.
      </p>

      <p>
        Afterward, the project owner must create the
        buyer’s first admin through Supabase. Use this
        only before handover, when all existing data
        can be removed.
      </p>

      {message && (
        <p role="status" className="dev-test-status">
          {message}
        </p>
      )}

      {error && (
        <p role="alert" className="dev-test-error">
          {error}
        </p>
      )}

      {!done && (
        <>
          <button
            type="button"
            disabled={busy}
            onClick={() => run("preview")}
          >
            Load / refresh data preview
          </button>

          {preview && (
            <>
              <dl className="dev-test-counts">
                {Object.entries(
                  preview.counts || {},
                ).map(([name, count]) => (
                  <div key={name}>
                    <dt>
                      {name.replaceAll("_", " ")}
                    </dt>
                    <dd>
                      {Number(count).toLocaleString()}
                    </dd>
                  </div>
                ))}
              </dl>

              {blocked && (
                <p className="dev-test-error">
                  Additional tables or files need review:{" "}
                  {(preview.unknown_tables || []).join(", ")
                    || "other Storage buckets"}.
                  Reset is blocked.
                </p>
              )}

              
               <section
  className="dev-reset-zone"
  aria-labelledby="dev-reset-zone-title"
>
  <p className="dev-reset-kicker">DANGER ZONE</p>

  <h2 id="dev-reset-zone-title">Factory reset</h2>

  <p>
    Permanently remove the existing workspace and
    every account. This includes the admin account
    you are using.
  </p>

  <button
    type="button"
    className="dev-reset-agreement"
    disabled={busy || blocked || acknowledged}
    aria-expanded={acknowledged}
    aria-controls="dev-reset-confirmation"
    onClick={() => setAcknowledged(true)}
  >
    <span>
      {acknowledged
        ? "Agreement accepted"
        : "Factory reset agreement"}
    </span>

    <span aria-hidden="true">
      {acknowledged ? "✓" : "→"}
    </span>
  </button>

  {!acknowledged && (
    <p className="dev-reset-help">
      Review the data preview, then press the
      agreement button to open confirmation.
    </p>
  )}

  {acknowledged && (
    <section
      id="dev-reset-confirmation"
      className="dev-reset-confirmation"
    >
      <p>
        I accept permanent deletion of all existing
        app data and accounts. I have Supabase project
        access to create the next admin.
      </p>

      <label
        className="dev-test-confirm"
        htmlFor="dev-reset-phrase"
      >
        To confirm, type this exact phrase:

        <code>sudo legion factory-reset</code>
      </label>

      <input
        id="dev-reset-phrase"
        className="dev-reset-phrase"
        autoFocus
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        value={confirmation}
        disabled={busy}
        onChange={event =>
          setConfirmation(event.target.value)
        }
        aria-describedby="dev-reset-phrase-help"
      />

      <p
        id="dev-reset-phrase-help"
        className="dev-reset-help"
      >
        Enter the phrase here in the app.
        It is case-sensitive.
      </p>

      <button
        type="button"
        className="dev-test-danger"
        disabled={
          busy ||
          blocked ||
          !confirmed ||
          wait > 0
        }
        onClick={() =>
          run(preview.active ? "continue" : "begin")
        }
      >
        {busy
          ? "Processing…"
          : wait
            ? `Workers stopping · ${wait}s`
            : preview.active
              ? "Continue factory reset"
              : "Permanently reset Legion"}
      </button>

      {!preview.active && (
        <button
          type="button"
          className="dev-reset-cancel"
          disabled={busy}
          onClick={() => {
            setAcknowledged(false);
            setConfirmation("");
          }}
        >
          Cancel confirmation
        </button>
      )}
    </section>
  )}
</section>
            </>
          )}
        </>
      )}

      {done && (
        <button type="button" onClick={finish}>
          Return to sign in
        </button>
      )}
    </dialog>
  );
}