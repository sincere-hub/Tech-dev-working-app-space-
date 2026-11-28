import { supabase } from "./supabase.js";
import { chatCall } from "./companyChat.js";
import {validateTransferFile,fileMime,uploadStoredFile} from './fileTransfers.js';


export const mediaBucket = "td-chat-media";
export const mediaAccept = "*/*";

export function checkChatMedia(file){validateTransferFile(file);}

export 
async function uploadChatMedia(userId,id,file,roomId=null){
 validateTransferFile(file);
 const prepared=await chatCall(userId,"td_chat_file_prepare",{
  p_id:id,p_room:roomId,p_file_name:file.name,
  p_mime:fileMime(file),p_bytes:file.size
 });
 if(!prepared.used){
  const uploaded=await uploadStoredFile(
   mediaBucket,prepared.path,file,userId
  );
  if(uploaded.error&&String(uploaded.error.statusCode)!=="409")
   throw Error(uploaded.error.message);
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

// TD_ALL_FILES_V1
