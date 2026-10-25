import { useEffect, useRef, useState } from "react";
import {
  Mic,
  Play,
  Send,
  Square,
  Trash2,
  X,
} from "lucide-react";
import { voiceNoteUrl } from "../lib/groupChat.js";

export function voiceTime(milliseconds = 0) {
  const seconds = Math.max(
    0,
    Math.floor(milliseconds / 1000),
  );

  return `${Math.floor(seconds / 60)}:${String(
    seconds % 60,
  ).padStart(2, "0")}`;
}

export function voiceSupportError() {
  if (!window.isSecureContext) {
    return "Recording requires HTTPS or localhost.";
  }

  if (
    !navigator.mediaDevices?.getUserMedia ||
    typeof MediaRecorder === "undefined"
  ) {
    return "Use a browser with microphone recording support, such as Chrome or Edge.";
  }

  return "";
}

export function VoiceMessage({ message }) {
  const [src, setSrc] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const player = useRef(null);
  const live = useRef(true);
  const localUrl = useRef("");

  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  useEffect(() => {
    if (!message.blob) return;

    if (localUrl.current) {
      URL.revokeObjectURL(localUrl.current);
    }

    localUrl.current = URL.createObjectURL(message.blob);
    setSrc(localUrl.current);
  }, [message.blob]);

  useEffect(
    () => () => {
      if (localUrl.current) {
        URL.revokeObjectURL(localUrl.current);
      }
    },
    [],
  );

  async function load() {
    if (busy) return;

    setBusy(true);
    setError("");

    try {
      const url = await voiceNoteUrl(message.voice_path);
      if (live.current) setSrc(url);
    } catch (failure) {
      if (live.current) setError(failure.message);
    } finally {
      if (live.current) setBusy(false);
    }
  }

  useEffect(() => {
    if (src && !message.local) {
      player.current?.play().catch(() => {});
    }
  }, [src, message.local]);

  return (
    <div className="td-chat-voice-message">
      <span>
        <Mic size={14} />
        Voice note · {voiceTime(message.duration_ms)}
      </span>

      {src ? (
        <audio
          ref={player}
          controls
          preload="none"
          src={src}
          aria-label="Voice note"
          onError={() => {
            setSrc("");
            setError("Audio could not play. Load it again.");
          }}
        />
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={load}
        >
          <Play size={17} />
          {busy ? "Loading recording…" : "Play voice note"}
        </button>
      )}

      {error && <small role="alert">{error}</small>}
    </div>
  );
}

export default function VoiceRecorder({
  disabled,
  onSend,
}) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState("");

  const dialog = useRef(null);
  const resource = useRef({ generation: 0 });

  function cleanup() {
    const current = resource.current;
    current.generation++;

    clearInterval(current.timer);

    if (current.recorder) {
      current.recorder.ondataavailable = null;
      current.recorder.onstop = null;

      if (current.recorder.state !== "inactive") {
        current.recorder.stop();
      }
    }

    current.stream?.getTracks().forEach(
      track => track.stop(),
    );

    if (current.url) URL.revokeObjectURL(current.url);

    current.recorder = null;
    current.stream = null;
    current.url = "";
  }

  useEffect(() => () => cleanup(), []);

  useEffect(() => {
    if (!open) return;

    const node = dialog.current;
    node.showModal();

    return () => {
      if (node.open) node.close();
    };
  }, [open]);

  function close() {
    cleanup();
    setOpen(false);
    setPreview(null);
    setStatus("");
  }

  async function start() {
    const problem = voiceSupportError();

    if (problem) {
      setError(problem);
      return;
    }

    cleanup();

    const current = resource.current;
    const generation = current.generation;

    setOpen(true);
    setPreview(null);
    setElapsed(0);
    setError("");
    setStatus("requesting");

    let stream;

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
        },
        video: false,
      });

      if (generation !== current.generation) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }

      current.stream = stream;

      const mime = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4",
        "audio/ogg;codecs=opus",
      ].find(type => MediaRecorder.isTypeSupported(type));

      if (!mime) {
        throw new Error(
          "This browser does not support a compatible recording format.",
        );
      }

      const recorder = new MediaRecorder(stream, {
        mimeType: mime,
        audioBitsPerSecond: 64000,
      });

      current.recorder = recorder;

      const chunks = [];
      let size = 0;
      let tooLarge = false;
      const started = performance.now();

      recorder.ondataavailable = event => {
        if (
          generation !== current.generation ||
          !event.data.size
        ) {
          return;
        }

        chunks.push(event.data);
        size += event.data.size;

        if (
          size > 4194304 &&
          recorder.state !== "inactive"
        ) {
          tooLarge = true;
          recorder.stop();
        }
      };

      recorder.onstop = () => {
        clearInterval(current.timer);
        stream.getTracks().forEach(track => track.stop());

        if (generation !== current.generation) return;

        const duration_ms = Math.min(
          120000,
          Math.max(
            1,
            Math.round(performance.now() - started),
          ),
        );

        const blob = new Blob(chunks, {
          type: recorder.mimeType,
        });

        setStatus("preview");
        setElapsed(duration_ms);

        if (
          tooLarge ||
          blob.size > 4194304 ||
          blob.size < 16
        ) {
          setError(
            "Record a shorter voice note and try again.",
          );
          return;
        }

        current.url = URL.createObjectURL(blob);

        setPreview({
          blob,
          duration_ms,
          url: current.url,
        });
      };

      recorder.onerror = () => {
        cleanup();
        setStatus("error");
        setError(
          "Recording stopped unexpectedly. Please retry.",
        );
      };

      recorder.start(250);
      setStatus("recording");

      current.timer = setInterval(() => {
        const duration = Math.min(
          120000,
          performance.now() - started,
        );

        setElapsed(duration);

        if (
          duration >= 120000 &&
          recorder.state !== "inactive"
        ) {
          recorder.stop();
        }
      }, 200);
    } catch (failure) {
      stream?.getTracks().forEach(track => track.stop());

      if (generation === current.generation) {
        cleanup();
        setStatus("error");
        setError(
          failure.name === "NotAllowedError"
            ? "Allow microphone access in your browser settings to record a voice note."
            : failure.message ||
                "Could not access the microphone.",
        );
      }
    }
  }

  return (
    <div className="td-chat-voice-control">
      <button
        type="button"
        className="td-chat-icon"
        aria-label="Record voice note"
        disabled={disabled}
        onClick={start}
      >
        <Mic size={22} />
      </button>

      {!open && error && (
        <span
          className="td-chat-voice-warning"
          role="alert"
        >
          {error}
        </span>
      )}

      {open && (
        <dialog
          ref={dialog}
          className="td-chat-dialog td-chat-recorder"
          aria-label="Record a voice note"
          onCancel={event => {
            event.preventDefault();
            close();
          }}
        >
          <header>
            <h2>Voice note</h2>
            <button
              type="button"
              className="td-chat-icon"
              aria-label="Cancel voice note"
              onClick={close}
            >
              <X size={20} />
            </button>
          </header>

          <div
            className={`td-chat-record-status${
              status === "recording"
                ? " is-recording"
                : ""
            }`}
          >
            <Mic size={29} />
            <strong>{voiceTime(elapsed)}</strong>
            <span>
              {status === "requesting"
                ? "Waiting for microphone permission…"
                : status === "recording"
                  ? "Recording · up to 2 minutes"
                  : "Review before sending"}
            </span>
          </div>

          {preview && (
            <audio
              controls
              src={preview.url}
              aria-label="Preview your voice note"
            />
          )}

          {error && (
            <p className="td-chat-error" role="alert">
              {error}
            </p>
          )}

          <div className="td-chat-recorder-actions">
            <button type="button" onClick={close}>
              <Trash2 size={17} />
              Cancel
            </button>

            {status === "recording" ? (
              <button
                type="button"
                onClick={() =>
                  resource.current.recorder?.stop()
                }
              >
                <Square size={17} />
                Stop recording
              </button>
            ) : (
              status !== "requesting" && (
                <button type="button" onClick={start}>
                  Record again
                </button>
              )
            )}

            {preview && (
              <button
                type="button"
                className="td-chat-primary"
                onClick={() => {
                  if (onSend(preview)) close();
                }}
              >
                <Send size={17} />
                Send voice note
              </button>
            )}
          </div>
        </dialog>
      )}
    </div>
  );
}