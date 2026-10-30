import {
  createContext,
  lazy,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  Phone,
  Video,
  History,
  X,
} from "lucide-react";

import { supabase } from "../lib/supabase.js";
import { chatCall } from "../lib/companyChat.js";
import "./techdev-calls.css";

const CallMedia = lazy(
  () => import("./CallMedia.jsx"),
);

const Calls = createContext(null);

async function request(
  userId,
  action,
  values = {},
) {
  const {
    data: account,
    error: authError,
  } = await supabase.auth.getSession();

  if (
    authError ||
    account.session?.user.id !== userId
  ) {
    throw new Error("Please sign in again");
  }

  const controller = new AbortController();

  const timer = setTimeout(
    () => controller.abort(),
    65000,
  );

  try {
    const { data, error } =
      await supabase.functions.invoke(
        "techdev-calls",
        {
          body: { action, ...values },
          headers: {
            Authorization:
              `Bearer ${account.session.access_token}`,
          },
          signal: controller.signal,
        },
      );

    if (error) {
      const details =
        await error.context
          ?.clone?.()
          .json()
          .catch(() => null);

      throw new Error(
        details?.error ||
        error.message ||
        "Call request failed",
      );
    }

    if (data?.error) {
      throw new Error(data.error);
    }

    return data;
  } finally {
    clearTimeout(timer);
  }
}

export function ChatCallButtons({ room }) {
  const calls = useContext(Calls);

  if (!calls) return null;

  return (
    <div className="td-chat-call-buttons">
      {room.kind === "direct" && room.is_member && (
        <>
          <button
            type="button"
            className="td-chat-icon"
            aria-label="Start voice call"
            disabled={
              calls.busy || Boolean(calls.active)
            }
            onClick={() =>
              calls.start(room.room_id, false)
            }
          >
            <Phone size={18} />
          </button>

          <button
            type="button"
            className="td-chat-icon"
            aria-label="Start video call"
            disabled={
              calls.busy || Boolean(calls.active)
            }
            onClick={() =>
              calls.start(room.room_id, true)
            }
          >
            <Video size={18} />
          </button>
        </>
      )}

      <button
        type="button"
        className="td-chat-icon"
        aria-label="Call history and recordings"
        onClick={calls.openHistory}
      >
        <History size={18} />
      </button>
    </div>
  );
}

export default function CallProvider({
  userId,
  employees = [],
  children,
}) {
  const [inbox, setInbox] = useState([]);
  const [active, setActive] = useState(null);
  const [snapshot, setSnapshot] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [minimized, setMinimized] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyItem, setHistoryItem] = useState(null);
  const [query, setQuery] = useState("");

  const current = useRef(null);
  const alive = useRef(true);
  const lock = useRef(false);
  const polling = useRef(false);
  const ringContext = useRef(null);
  const historyDialog = useRef(null);

  const name = id =>
    employees.find(person => person.id === id)
      ?.display_name || "Employee";

  const refresh = useCallback(async () => {
    if (
      !alive.current ||
      polling.current ||
      !navigator.onLine
    ) {
      return;
    }

    polling.current = true;

    try {
      const rows = await chatCall(
        userId,
        "td_call_inbox_v2",
      );

      if (!alive.current) return;

      setInbox(rows || []);

      const connection = current.current;

      if (connection) {
        const result = await request(
          userId,
          "status",
          { callId: connection.callId },
        );

        if (
          !alive.current ||
          current.current?.callId !== connection.callId
        ) {
          return;
        }

        setSnapshot(result.snapshot);

        const own = result.snapshot.members.find(
          member => member.employee_id === userId,
        );

        if (
          result.snapshot.call.state === "ended" ||
          own?.state !== "accepted"
        ) {
          current.current = null;
          setActive(null);
        }
      }
    } catch (failure) {
      if (alive.current) {
        setError(
          failure.message ||
          "Call updates could not load",
        );

        if (
          /banned|revoked|sign in|active employee/i.test(
            failure.message || "",
          )
        ) {
          current.current = null;
          setActive(null);
        }
      }
    } finally {
      polling.current = false;
    }
  }, [userId]);

  useEffect(() => {
    alive.current = true;
    void refresh();

    const timer = setInterval(refresh, 5000);

    const channel = supabase
      .channel(`td-calls-${userId}-${Date.now()}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "td_call_members",
          filter: `employee_id=eq.${userId}`,
        },
        refresh,
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "td_calls",
        },
        refresh,
      )
      .subscribe();

    function unlock() {
      const Audio =
        window.AudioContext ||
        window.webkitAudioContext;

      if (Audio && !ringContext.current) {
        ringContext.current = new Audio();
      }

      void ringContext.current
        ?.resume()
        .catch(() => {});
    }

    document.addEventListener(
      "pointerdown",
      unlock,
      { once: true },
    );

    window.addEventListener("online", refresh);

    return () => {
      alive.current = false;
      clearInterval(timer);

      void supabase.removeChannel(channel);

      document.removeEventListener(
        "pointerdown",
        unlock,
      );

      window.removeEventListener("online", refresh);

      const audio = ringContext.current;
      ringContext.current = null;

      void audio?.close().catch(() => {});
    };
  }, [refresh, userId]);

  const incoming = inbox.find(
    item =>
      item.call.state !== "ended" &&
      item.members.some(
        member =>
          member.employee_id === userId &&
          member.state === "invited",
      ),
  );

  useEffect(() => {
    if (!incoming || active) return;

    function beep() {
      const audio = ringContext.current;

      if (!audio || audio.state !== "running") {
        return;
      }

      const sound = audio.createOscillator();
      const gain = audio.createGain();

      sound.frequency.value = 520;
      gain.gain.value = 0.035;

      sound.connect(gain);
      gain.connect(audio.destination);

      sound.start();
      sound.stop(audio.currentTime + 0.3);
    }

    beep();

    const timer = setInterval(beep, 2000);

    return () => clearInterval(timer);
  }, [incoming?.call.id, Boolean(active)]);

  async function action(
    operation,
    values = {},
    connect = false,
  ) {
    if (lock.current) return;

    lock.current = true;
    setBusy(true);
    setError("");

    try {
      const result = await request(
        userId,
        operation,
        values,
      );

      if (!alive.current) return;

      if (result.snapshot) {
        if (connect) {
          if (!result.token || !result.url) {
            throw new Error(
              "Call connection was not confirmed. Open call history to retry.",
            );
          }

          const connection = {
            callId: result.snapshot.call.id,
            token: result.token,
            url: result.url,
            video: result.snapshot.call.initial_video,
          };

          current.current = connection;

          setActive(connection);
          setSnapshot(result.snapshot);
          setHistoryOpen(false);
          setMinimized(false);
        } else if (
          current.current?.callId ===
          result.snapshot.call.id
        ) {
          setSnapshot(result.snapshot);
        }

        setHistoryItem(result.snapshot);
      }

      if (
        result.url &&
        operation === "download"
      ) {
        const link = document.createElement("a");
        link.href = result.url;
        link.click();
      }

      await refresh();
    } catch (failure) {
      if (alive.current) {
        setError(
          failure.message || "Call request failed",
        );
      }
    } finally {
      lock.current = false;

      if (alive.current) {
        setBusy(false);
      }
    }
  }

  useEffect(() => {
    if (!historyOpen) return;

    const node = historyDialog.current;
    const previous = document.activeElement;

    node.showModal();

    return () => {
      if (node.open) node.close();

      if (previous?.isConnected) {
        previous.focus();
      }
    };
  }, [historyOpen]);

  const leave = useCallback(() => {
    const connection = current.current;

    if (!connection) return;

    current.current = null;
    setActive(null);
    setMinimized(false);

    void request(
      userId,
      "leave",
      { callId: connection.callId },
    )
      .then(() => refresh())
      .catch(failure => {
        if (alive.current) {
          setError(
            `${failure.message}. Use call history to leave or retry.`,
          );
        }
      });
  }, [refresh, userId]);

  const mediaError = useCallback(
    failure => {
      setError(
        failure?.message ||
        "Check microphone and camera permissions",
      );

      leave();
    },
    [leave],
  );

  const start = (roomId, video) => {
    if (!current.current) {
      void action(
        "start",
        { roomId, video },
        true,
      );
    }
  };

  const members = snapshot?.members || [];
  const call = snapshot?.call;

  const own = members.find(
    member => member.employee_id === userId,
  );

  const approved =
    call?.record_state === "requested" &&
    members
      .filter(member => member.state === "accepted")
      .every(
        member =>
          member.consent_epoch === call.record_epoch,
      );

  const available = employees.filter(
    person =>
      person.id !== userId &&
      !person.is_banned &&
      !members.some(
        member =>
          member.employee_id === person.id &&
          ["accepted", "invited"].includes(
            member.state,
          ),
      ) &&
      String(person.display_name || "")
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );

  return (
    <Calls.Provider
      value={{
        start,
        busy,
        active,
        openHistory: () => {
          setHistoryOpen(true);
          void refresh();
        },
      }}
    >
      {children}

      {error && (
        <div className="td-call-error" role="alert">
          <span>{error}</span>

          <button
            type="button"
            aria-label="Dismiss call message"
            onClick={() => setError("")}
          >
            <X size={17} />
          </button>
        </div>
      )}

      {incoming && !active && (
        <div
          className="td-call-incoming"
          role="alert"
        >
          <Phone size={24} />

          <div>
            <strong>
              Incoming{" "}
              {incoming.call.initial_video
                ? "video"
                : "voice"}{" "}
              call
            </strong>

            <p>
              {name(
                incoming.members.find(
                  member =>
                    member.employee_id === userId,
                )?.invited_by,
              )}
            </p>
          </div>

          <button
            type="button"
            disabled={busy}
            onClick={() =>
              action(
                "accept",
                { callId: incoming.call.id },
                true,
              )
            }
          >
            Answer
          </button>

          <button
            type="button"
            className="td-call-danger"
            disabled={busy}
            onClick={() =>
              action(
                "decline",
                { callId: incoming.call.id },
              )
            }
          >
            Decline
          </button>
        </div>
      )}

      {active && (
        <section
          className={`td-call-layer${
            minimized ? " is-minimized" : ""
          }`}
          aria-label="Active call"
        >
          <header>
            <div>
              <strong>TechDev call</strong>

              <small>
                {call?.state === "ringing"
                  ? "Calling…"
                  : `${
                      members.filter(
                        member =>
                          member.state === "accepted",
                      ).length
                    } participants`}
              </small>
            </div>

            <button
              type="button"
              onClick={() =>
                setMinimized(value => !value)
              }
            >
              {minimized ? "Open call" : "Minimize"}
            </button>

            <button
              type="button"
              className="td-call-danger"
              onClick={leave}
            >
              Leave
            </button>
          </header>

          <div className="td-call-tools">
            <div className="td-call-add">
              <input
                aria-label="Find a colleague to invite"
                placeholder="Find a colleague…"
                value={query}
                onChange={event =>
                  setQuery(event.target.value)
                }
              />

              <select
                aria-label="Invite colleague"
                value=""
                disabled={
                  busy ||
                  call?.record_state !== "off"
                }
                onChange={event => {
                  if (event.target.value) {
                    void action("invite", {
                      callId: active.callId,
                      employeeId: event.target.value,
                    });
                  }
                }}
              >
                <option value="">Add someone…</option>

                {available.map(person => (
                  <option
                    key={person.id}
                    value={person.id}
                  >
                    {person.display_name}
                  </option>
                ))}
              </select>
            </div>

            {call?.record_state === "off" ? (
              <button
                type="button"
                disabled={
                  busy || call.state !== "active"
                }
                onClick={() =>
                  action("record_request", {
                    callId: active.callId,
                  })
                }
              >
                Request recording
              </button>
            ) : call?.record_state === "requested" ? (
              <div className="td-call-agreement">
                <strong>
                  Recording requested: audio and video
                  will be saved.
                </strong>

                {own?.consent_epoch !==
                  call.record_epoch && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      action("record_agree", {
                        callId: active.callId,
                      })
                    }
                  >
                    I agree
                  </button>
                )}

                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    action("record_decline", {
                      callId: active.callId,
                    })
                  }
                >
                  Decline recording
                </button>

                <span>
                  {approved
                    ? "Everyone has agreed."
                    : "Waiting for everyone’s agreement…"}
                </span>

                {approved && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      action("record_start", {
                        callId: active.callId,
                      })
                    }
                  >
                    Start approved recording
                  </button>
                )}
              </div>
            ) : (
              <>
                <span>
                  Recording: {call?.record_state}
                </span>

                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    action("record_stop", {
                      callId: active.callId,
                    })
                  }
                >
                  Stop recording
                </button>
              </>
            )}

            {call?.record_state !== "off" && (
              <small>
                Recording must finish before adding
                another person.
              </small>
            )}

            {call?.record_error && (
              <p role="status">{call.record_error}</p>
            )}
          </div>

          <Suspense
            fallback={<p>Opening call controls…</p>}
          >
            <CallMedia
              connection={active}
              onLeave={leave}
              onError={mediaError}
            />
          </Suspense>
        </section>
      )}

      {historyOpen && (
        <dialog
          ref={historyDialog}
          className="td-call-history"
          aria-label="Call history and recordings"
          onCancel={event => {
            event.preventDefault();
            setHistoryOpen(false);
          }}
        >
          <header>
            <h2>Calls and recordings</h2>

            <button
              type="button"
              aria-label="Close call history"
              onClick={() => setHistoryOpen(false)}
            >
              <X size={20} />
            </button>
          </header>

          {error && <p role="alert">{error}</p>}

          <p>
            Showing your latest 25 calls from the last
            day, plus ongoing calls.
          </p>

          {inbox.map(item => (
            <article key={item.call.id}>
              <strong>
                {item.call.initial_video
                  ? "Video"
                  : "Voice"}{" "}
                call · {item.call.state}
              </strong>

              <p>
                {item.members
                  .map(member =>
                    name(member.employee_id),
                  )
                  .join(" · ")}
              </p>

              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  action("status", {
                    callId: item.call.id,
                  })
                }
              >
                Details / refresh recordings
              </button>

              {item.call.state !== "ended" &&
                item.members.some(
                  member =>
                    member.employee_id === userId &&
                    member.state === "accepted",
                ) &&
                !active && (
                  <>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        action(
                          "token",
                          { callId: item.call.id },
                          true,
                        )
                      }
                    >
                      Rejoin call
                    </button>

                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        action("leave", {
                          callId: item.call.id,
                        })
                      }
                    >
                      Leave this call
                    </button>
                  </>
                )}
            </article>
          ))}

          {!inbox.length && <p>No recent calls.</p>}

          {historyItem && (
            <div>
              <h3>Recording files</h3>

              {!historyItem.recordings.length && (
                <p>
                  No recordings available to your
                  account for this call.
                </p>
              )}

              {historyItem.recordings.map(record => (
                <article key={record.id}>
                  <p>
                    {new Date(
                      record.created_at,
                    ).toLocaleString("en-ZA")}
                    {" · "}
                    {record.state}
                  </p>

                  {record.error && (
                    <p>{record.error}</p>
                  )}

                  {record.state === "completed" && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        action("download", {
                          callId: record.call_id,
                          recordingId: record.id,
                        })
                      }
                    >
                      Download recording
                    </button>
                  )}
                </article>
              ))}
            </div>
          )}
        </dialog>
      )}
    </Calls.Provider>
  );
}