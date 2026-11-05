const tables = [
  "employees", "tasks", "announcements", "time_entries", "shifts",
  "leave_requests", "shift_change_requests", "payslips",
  "workplace_records", "workplace_interactions",
];

export function watchWorkspaceChanges(client, user, loadWorkspace) {
  let disposed = false;
  let running = false;
  let dirty = false;
  let timer;
  let connectedBefore = false;

  function queueRefresh() {
    if (disposed) return;

    if (running) {
      dirty = true;
      return;
    }

    if (timer !== undefined) return;

    timer = window.setTimeout(() => {
      timer = undefined;
      void refresh();
    }, 250);
  }

  async function refresh() {
    if (disposed) return;

    running = true;
    try {
      await loadWorkspace(user);
    } finally {
      running = false;
      if (dirty) {
        dirty = false;
        queueRefresh();
      }
    }
  }

  const channel = client.channel(`workspace-${user.id}`);

  for (const table of tables) {
    channel.on("postgres_changes", {
      event: "*",
      schema: "public",
      table,
    }, queueRefresh);
  }

  channel.subscribe(status => {
    if (disposed || status !== "SUBSCRIBED") return;
    if (connectedBefore) queueRefresh();
    connectedBefore = true;
  });

  void refresh();

  return () => {
    disposed = true;
    window.clearTimeout(timer);
    void client.removeChannel(channel);
  };
}