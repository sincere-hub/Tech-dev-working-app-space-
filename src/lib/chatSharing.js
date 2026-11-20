import { supabase } from "./supabase.js";
import { chatCall } from "./companyChat.js";

export const mediaBucket = "td-chat-media";
export const mediaAccept = "image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm";

export function checkChatMedia(file) {
  const image = ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file?.type);
  const video = ["video/mp4", "video/webm"].includes(file?.type);

  if ((!image && !video) || !file.size || file.size > (image ? 8 : 25) * 1024 * 1024) {
    throw new Error("Choose JPG, PNG, WebP or GIF up to 8 MB, or MP4/WebM video up to 25 MB.");
  }
}

export async function uploadChatMedia(userId, id, file, roomId = null) {
  checkChatMedia(file);

  const prepared = await chatCall(userId, "td_chat_media_prepare", {
    p_id: id,
    p_room: roomId,
    p_status: !roomId,
    p_mime: file.type,
    p_bytes: file.size,
  });

  if (!prepared.used) {
    const { error } = await supabase.storage.from(mediaBucket).upload(
      prepared.path,
      file,
      {
        contentType: file.type,
        cacheControl: "60",
        upsert: false,
      }
    );

    if (error && String(error.statusCode || error.status) !== "409") {
      throw new Error(error.message || "Upload failed. Try again.");
    }
  }

  return prepared.path;
}

export function splitChatLinks(value) {
  const text = String(value || "");
  const pattern = /(?:https?:\/\/|www\.)[^\s<>"']+/giu;
  const pieces = [];
  let cursor = 0;
  let match;

  while ((match = pattern.exec(text))) {
    let token = match[0].replace(/[.,!?;:]+$/, "");

    for (const [end, start] of [[")", "("], ["]", "["], ["}", "{"]]) {
      while (
        token.endsWith(end) &&
        token.split(end).length > token.split(start).length
      ) {
        token = token.slice(0, -1);
      }
    }

    let href = "";

    try {
      const url = new URL(/^www\./i.test(token) ? `https://${token}` : token);

      if (
        ["http:", "https:"].includes(url.protocol) &&
        url.hostname &&
        !url.username &&
        !url.password
      ) {
        href = url.href;
      }
    } catch {
      // Invalid links remain ordinary text.
    }

    if (!href) continue;

    if (match.index > cursor) {
      pieces.push({ text: text.slice(cursor, match.index) });
    }

    pieces.push({ text: token, href });
    cursor = match.index + token.length;
  }

  if (cursor < text.length) {
    pieces.push({ text: text.slice(cursor) });
  }

  return pieces;
}
