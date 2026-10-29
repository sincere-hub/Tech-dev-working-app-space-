import { supabase } from "./supabase.js";

async function untilAbort(promise, signal) {
  let stop;

  const canceled = new Promise((_, reject) => {
    stop = () => reject(new Error(
      "The request timed out. Refresh before retrying."
    ));

    if (signal.aborted) stop();
    else signal.addEventListener("abort", stop, { once: true });
  });

  try {
    return await Promise.race([promise, canceled]);
  } finally {
    signal.removeEventListener("abort", stop);
  }
}

export async function accessRequest(
  userId,
  name,
  args,
  signal,
  edge = false
) {
  const { data: auth, error } = await untilAbort(
    supabase.auth.getSession(),
    signal
  );

  if (
    error ||
    signal.aborted ||
    auth?.session?.user.id !== userId
  ) {
    throw new Error(
      "Your account changed. Reopen Manager tools."
    );
  }

  const Authorization = `Bearer ${auth.session.access_token}`;

  const result = await untilAbort(
    edge
      ? supabase.functions.invoke(name, {
          body: args,
          headers: { Authorization },
          signal,
          timeout: 30000,
        })
      : supabase.rpc(name, args)
          .setHeader("Authorization", Authorization)
          .abortSignal(signal),
    signal
  );

  if (result.error) {
    let detail;

    try {
      detail = await result.error.context?.clone().json();
    } catch {}

    throw new Error(
      detail?.error ||
      result.error.message ||
      "The request could not finish."
    );
  }

  const { data: current } = await untilAbort(
    supabase.auth.getSession(),
    signal
  );

  if (
    signal.aborted ||
    current?.session?.user.id !== userId
  ) {
    throw new Error(
      "Your account changed. Reopen Manager tools."
    );
  }

  return result.data;
}