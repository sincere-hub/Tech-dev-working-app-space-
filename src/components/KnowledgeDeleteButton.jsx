import { useEffect, useRef, useState } from "react";
import { LoaderCircle, Trash2 } from "lucide-react";
import { supabase } from "../lib/supabase.js";

async function untilAbort(promise, signal) {
  let cancel;

  const stopped = new Promise((_, reject) => {
    cancel = () =>
      reject(
        new Error(
          "Delete request timed out. Refresh and try Delete again."
        )
      );

    if (signal.aborted) cancel();
    else {
      signal.addEventListener("abort", cancel, {
        once: true,
      });
    }
  });

  try {
    return await Promise.race([promise, stopped]);
  } finally {
    signal.removeEventListener("abort", cancel);
  }
}

export default function KnowledgeDeleteButton({
  record,
  userId,
  isManager,
  disabled,
  onBusy,
  onDeleted,
  onRefresh,
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const lock = useRef(false);
  const alive = useRef(true);
  const controller = useRef(null);

  useEffect(() => {
    alive.current = true;

    return () => {
      alive.current = false;
      controller.current?.abort();
    };
  }, []);

  if (
    record.module_id !== "collaboration.docs" ||
    !(isManager || record.created_by === userId)
  ) {
    return null;
  }

  const file = record.metadata?.kind === "document";

  const retry =
    file &&
    record.metadata?.file_state === "deleting";

  async function remove() {
    if (lock.current || busy || disabled) return;

    if (!navigator.onLine) {
      setError(
        "Connect to the internet to delete this item."
      );
      return;
    }

    const contents = file
      ? "The document and all its stored file versions"
      : "The article, its comments, review details and version history";

    if (
      !window.confirm(
        `Permanently delete “${record.title}”?\n\n` +
        `${contents} will be removed. This cannot be undone.`
      )
    ) {
      return;
    }

    lock.current = true;
    setBusy(true);
    setError("");
    onBusy?.(true);

    const aborter = new AbortController();
    controller.current = aborter;

    const timer = setTimeout(
      () => aborter.abort(),
      60000
    );

    async function session() {
      const { data, error } = await untilAbort(
        supabase.auth.getSession(),
        aborter.signal
      );

      if (error) throw error;

      if (
        !alive.current ||
        data.session?.user.id !== userId ||
        aborter.signal.aborted
      ) {
        throw new Error(
          "Reopen the library after signing in to your account."
        );
      }

      return data.session;
    }

    try {
      const account = await session();

      const { data, error } =
        await supabase.functions.invoke(
          "delete-knowledge",
          {
            body: {
              recordId: record.id,
              updatedAt: record.updated_at,
            },

            headers: {
              Authorization:
                `Bearer ${account.access_token}`,
            },

            signal: aborter.signal,
          }
        );

      if (error) {
        let message =
          "Delete could not finish. Reload and try again.";

        try {
          const body =
            await error.context.clone().json();

          message =
            body.error || body.message || message;
        } catch {}

        throw new Error(message);
      }

      if (!data?.deleted || data.id !== record.id) {
        throw new Error(
          "Deletion was not confirmed. Reload and try again."
        );
      }

      await session();
      await onDeleted?.(record.id);
    } catch (failure) {
      if (alive.current) {
        setError(
          failure.message ||
          "Could not delete this item."
        );

        try {
          await onRefresh?.();
        } catch {}
      }
    } finally {
      clearTimeout(timer);
      lock.current = false;
      onBusy?.(false);

      if (alive.current) setBusy(false);
    }
  }

  return (
    <span className="td-knowledge-delete">
      <button
        type="button"
        className="ld-delete"
        disabled={busy || disabled}
        onClick={remove}
      >
        {busy ? (
          <LoaderCircle className="spin" size={15} />
        ) : (
          <Trash2 size={15} />
        )}

        {busy
          ? "Deleting…"
          : retry
            ? "Retry delete"
            : file
              ? "Delete document"
              : "Delete article"}
      </button>

      {error && (
        <span
          className="td-knowledge-delete-error"
          role="alert"
        >
          {error}
        </span>
      )}
    </span>
  );
}