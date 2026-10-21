import { useEffect, useRef, useState } from "react";

const views = new Set([
  "overview", "tasks", "attendance", "leave", "suite",
  "payslips", "notices", "activity",
]);

function targetFrom(value) {
  if (!value || !views.has(value.view)) return null;

  const moduleId =
    typeof value.moduleId === "string" ? value.moduleId : "";

  if (
    moduleId &&
    (
      moduleId.length > 100 ||
      !/^[a-z][a-z0-9-]*\.[a-z][a-z0-9.-]*$/.test(moduleId)
    )
  ) {
    return null;
  }

  return {
    view: value.view,
    moduleId: value.view === "suite" ? moduleId : "",
  };
}

function readTarget() {
  const url = new URL(window.location.href);

  return targetFrom({
    view: url.searchParams.get("notificationView"),
    moduleId: url.searchParams.get("notificationModule") || "",
  });
}

export default function usePushNavigation({
  ready,
  userId,
  onNavigate,
}) {
  const [pending, setPending] = useState(readTarget);
  const navigateRef = useRef(onNavigate);
  navigateRef.current = onNavigate;

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const base = new URL(
      import.meta.env.BASE_URL || "/",
      window.location.origin,
    );

    const workerUrl = new URL("legion-push-sw.js", base).href;

    function receive(event) {
      if (
        event.origin !== window.location.origin ||
        event.source?.scriptURL !== workerUrl ||
        event.data?.type !== "LEGION_NOTIFICATION_OPEN"
      ) {
        return;
      }

      const target = targetFrom(event.data);
      if (target) setPending(target);
    }

    navigator.serviceWorker.addEventListener("message", receive);

    return () => {
      navigator.serviceWorker.removeEventListener("message", receive);
    };
  }, []);

  useEffect(() => {
    if (!ready || !userId || !pending) return;

    setPending(null);

    const url = new URL(window.location.href);
    url.searchParams.delete("notificationView");
    url.searchParams.delete("notificationModule");

    window.history.replaceState(
      window.history.state,
      "",
      url.href,
    );

    navigateRef.current(pending.view, pending.moduleId);
  }, [ready, userId, pending]);
}