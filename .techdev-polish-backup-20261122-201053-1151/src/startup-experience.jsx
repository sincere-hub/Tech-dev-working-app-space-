import { useEffect, useState } from "react";
import "./startup-experience.css";

const wordmark = `${import.meta.env.BASE_URL}techdev-wordmark.svg`;
const columns = 20;
const rows = 4;

export function StartupWordmark() {
  return (
    <div className="td-startup-wordmark">
      <img
        src={wordmark}
        alt="Tech Dev"
        width={401}
        height={51}
        fetchPriority="high"
        draggable={false}
      />

      <span
        className="td-startup-pixels"
        aria-hidden="true"
        style={{ "--wordmark": `url("${wordmark}")` }}
      >
        {Array.from({ length: columns * rows }, (_, i) => (
          <span
            key={i}
            style={{
              "--px": `${(i % columns) * 100 / (columns - 1)}%`,
              "--py": `${Math.floor(i / columns) * 100 / (rows - 1)}%`,
              "--dx": `${((i * 67) % 101) - 50}px`,
              "--dy": `${((i * 43) % 65) - 32}px`,
              "--delay": `${(i * 53) % 181}ms`,
            }}
          />
        ))}
      </span>
    </div>
  );
}

const avatarCacheKey = "techdev-startup-avatar-v1";

export function clearStartupAvatarCache() {
  try {
    sessionStorage.removeItem(avatarCacheKey);
  } catch {}
}

export function useStartupAvatar(supabase, owner, path) {
  const key =
    owner && typeof path === "string" && path.startsWith(`${owner}/`)
      ? `${owner}:${path}`
      : "";

  const [photo, setPhoto] = useState(null);

  useEffect(() => {
    if (!key) return;

    let active = true;
    let timer;

    function usePhoto(record) {
      if (!active) return;

      const preload = new Image();
      preload.fetchPriority = "high";
      preload.src = record.url;

      setPhoto(record);
      timer = window.setTimeout(
        refresh,
        Math.max(1_000, record.refreshAt - Date.now())
      );
    }

    async function refresh() {
      try {
        const { data, error } = await supabase.storage
          .from("employee-avatars")
          .createSignedUrl(path, 3600);

        if (!active) return;
        if (error || !data?.signedUrl) {
          throw error || new Error("Missing avatar URL");
        }

        const record = {
          key,
          url: data.signedUrl,
          refreshAt: Date.now() + 45 * 60_000,
        };

        try {
          sessionStorage.setItem(avatarCacheKey, JSON.stringify(record));
        } catch {}

        usePhoto(record);
      } catch {
        if (active) timer = window.setTimeout(refresh, 60_000);
      }
    }

    let cached;
    try {
      cached = JSON.parse(sessionStorage.getItem(avatarCacheKey));
    } catch {}

    if (
      cached?.key === key &&
      typeof cached.url === "string" &&
      cached.refreshAt > Date.now()
    ) {
      usePhoto(cached);
    } else {
      refresh();
    }

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [key, path, supabase]);

  return photo?.key === key ? photo.url : "";
}