import { supabase } from "./supabase.js";

const signedIcons = new Map();

async function query(builder) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);

  try {
    const { data, error } = await builder.abortSignal(
      controller.signal,
    );

    if (error) throw new Error(error.message);
    return data;
  } finally {
    clearTimeout(timer);
  }
}

export async function attachChatOptions(userId, rooms) {
  const options = new Map();

  for (let offset = 0; offset < rooms.length; offset += 100) {
    const rows = await query(
      supabase.rpc("td_chat_room_options", {
        p_rooms: rooms
          .slice(offset, offset + 100)
          .map(room => room.room_id),
      }),
    );

    rows.forEach(row => options.set(row.room_id, row));
  }

  const missing = [...options.values()]
    .map(item => item.icon_path)
    .filter(path => {
      if (!path) return false;
      const cached = signedIcons.get(`${userId}:${path}`);
      return !cached || cached.expires < Date.now();
    });

  for (let offset = 0; offset < missing.length; offset += 100) {
    let timer;

    try {
      const result = await Promise.race([
        supabase.storage
          .from("td-chat-icons")
          .createSignedUrls(
            missing.slice(offset, offset + 100),
            3600,
          ),
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(new Error("Icon loading timed out")),
            12000,
          );
        }),
      ]);

      if (!result.error) {
        for (const item of result.data || []) {
          if (!item.error && item.path && item.signedUrl) {
            signedIcons.set(`${userId}:${item.path}`, {
              url: item.signedUrl,
              expires: Date.now() + 3300000,
            });
          }
        }
      }
    } catch {
      // Messages remain available when an icon cannot load.
    } finally {
      clearTimeout(timer);
    }
  }

  while (signedIcons.size > 512) {
    signedIcons.delete(signedIcons.keys().next().value);
  }

  return rooms.map(room => {
    const extra = options.get(room.room_id) || {};

    return {
      ...room,
      ...extra,
      icon_url:
        signedIcons.get(`${userId}:${extra.icon_path}`)?.url ||
        "",
    };
  });
}

export async function prepareGroupIcon(file) {
  if (
    !["image/jpeg", "image/png", "image/webp"].includes(
      file.type,
    ) ||
    file.size > 5 * 1024 * 1024
  ) {
    throw new Error(
      "Choose a JPG, PNG or WebP image smaller than 5 MB.",
    );
  }

  const bitmap = await createImageBitmap(file);

  try {
    if (
      !bitmap.width ||
      !bitmap.height ||
      bitmap.width * bitmap.height > 24000000
    ) {
      throw new Error(
        "Choose an image up to 24 megapixels.",
      );
    }

    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 512;

    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error(
        "Your browser could not prepare this image.",
      );
    }

    context.fillStyle = "#132638";
    context.fillRect(0, 0, 512, 512);

    const side = Math.min(bitmap.width, bitmap.height);

    context.drawImage(
      bitmap,
      (bitmap.width - side) / 2,
      (bitmap.height - side) / 2,
      side,
      side,
      0,
      0,
      512,
      512,
    );

    const image = canvas.toDataURL("image/jpeg", 0.86);

    if (image.length > 1400000) {
      throw new Error("Choose a smaller image.");
    }

    return image;
  } finally {
    bitmap.close();
  }
}

async function checkAccount(userId) {
  const { data, error } = await supabase.auth.getSession();

  if (error || data.session?.user.id !== userId) {
    throw new Error(
      "Your account changed. Reopen chat.",
    );
  }
}

async function functionError(error, fallback) {
  const response = error.context;

  const details = response?.clone
    ? await response.clone().json().catch(() => null)
    : null;

  return new Error(
    details?.error || error.message || fallback,
  );
}

export async function uploadGroupIcon(
  userId,
  roomId,
  image,
) {
  await checkAccount(userId);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);

  try {
    const { data, error } = await supabase.functions.invoke(
      "upload-chat-icon",
      {
        body: { roomId, image },
        signal: controller.signal,
      },
    );

    if (error) {
      throw await functionError(
        error,
        "Could not upload the group icon.",
      );
    }

    if (!data?.path || data.error) {
      throw new Error(
        data?.error || "Could not upload the group icon.",
      );
    }

    return data.path;
  } finally {
    clearTimeout(timer);
  }
}

export async function uploadChatVoice(userId, item) {
  await checkAccount(userId);

  const form = new FormData();
  form.set("roomId", item.room_id);
  form.set("clientId", item.client_id);
  form.set("durationMs", String(item.duration_ms));
  form.set("audio", item.blob, "voice-note");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);

  try {
    const { data, error } = await supabase.functions.invoke(
      "upload-chat-voice",
      {
        body: form,
        signal: controller.signal,
      },
    );

    if (error) {
      throw await functionError(
        error,
        "Could not send the voice note.",
      );
    }

    if (!data?.message_id) {
      throw new Error(
        data?.error || "Could not send the voice note.",
      );
    }

    return data.message_id;
  } finally {
    clearTimeout(timer);
  }
}

export async function voiceNoteUrl(path) {
  let timer;

  try {
    const { data, error } = await Promise.race([
      supabase.storage
        .from("td-chat-voice")
        .createSignedUrl(path, 300),
      new Promise((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error(
                "Audio loading timed out. Try again.",
              ),
            ),
          15000,
        );
      }),
    ]);

    if (error || !data?.signedUrl) {
      throw new Error(
        "This recording is unavailable. Refresh the chat and retry.",
      );
    }

    return data.signedUrl;
  } finally {
    clearTimeout(timer);
  }
}