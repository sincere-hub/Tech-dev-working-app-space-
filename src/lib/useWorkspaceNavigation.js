import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import {
  canAccessWorkplaceModule,
} from "./workplaceModules.js";

function homePage(owner) {
  return {
    owner,
    view: "overview",
    moduleId: "",
    history: [],
    scrollTop: 0,
  };
}

function pageTarget(view, moduleId = "") {
  return {
    view,
    moduleId:
      view === "suite" && typeof moduleId === "string"
        ? moduleId
        : "",
  };
}

function samePage(left, right) {
  return (
    left.view === right.view &&
    left.moduleId === right.moduleId
  );
}

export default function useWorkspaceNavigation({
  userId,
  role,
  items = [],
  onCloseMenu,
  onUnavailable,
}) {
  const [state, setState] = useState(
    () => homePage(userId)
  );

  const current = useRef(state);
  const settings = useRef(null);

  settings.current = {
    userId,
    role,
    items,
    onCloseMenu,
    onUnavailable,
  };

  function allowed(target) {
    const context = settings.current;

    return (
      context.items.some(
        item => item.id === target.view
      ) &&
      (
        target.view !== "suite" ||
        !target.moduleId ||
        canAccessWorkplaceModule(
          target.moduleId,
          context.role || "employee"
        )
      )
    );
  }

  function commit(next) {
    current.current = next;
    setState(next);
  }

  useEffect(() => {
    if (current.current.owner !== userId) {
      commit(homePage(userId));
      settings.current.onCloseMenu?.();
    }
  }, [userId]);

  useLayoutEffect(() => {
    if (state.owner !== userId) return;

    const frame = window.requestAnimationFrame(() => {
      window.scrollTo({
        top: state.scrollTop,
        behavior: "instant",
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [state, userId]);

  const navigate = useCallback(
    (view, moduleId = "") => {
      const context = settings.current;
      const target = pageTarget(view, moduleId);

      if (!allowed(target)) {
        context.onUnavailable?.();
        context.onCloseMenu?.();
        return false;
      }

      const previous =
        current.current.owner === context.userId
          ? current.current
          : homePage(context.userId);

      if (!samePage(previous, target)) {
        commit({
          owner: context.userId,
          ...target,
          history: [
            ...previous.history,
            {
              view: previous.view,
              moduleId: previous.moduleId,
              scrollY: window.scrollY || 0,
            },
          ],
          scrollTop: 0,
        });
      }

      context.onCloseMenu?.();
      return true;
    },
    []
  );

  const goBack = useCallback(() => {
    const context = settings.current;

    const previous =
      current.current.owner === context.userId
        ? current.current
        : homePage(context.userId);

    const remaining = [...previous.history];

    while (remaining.length) {
      const saved = remaining.pop();

      const target = pageTarget(
        saved.view,
        saved.moduleId
      );

      if (
        !allowed(target) ||
        samePage(previous, target)
      ) {
        continue;
      }

      commit({
        owner: context.userId,
        ...target,
        history: remaining,
        scrollTop: Math.max(
          0,
          Number(saved.scrollY) || 0
        ),
      });

      context.onCloseMenu?.();
      return true;
    }

    if (
      previous.view !== "overview" &&
      allowed(pageTarget("overview"))
    ) {
      commit(homePage(context.userId));
      context.onCloseMenu?.();
      return true;
    }

    if (previous.history.length) {
      commit({ ...previous, history: [] });
    }

    context.onCloseMenu?.();
    return false;
  }, []);

  const page =
    state.owner === userId
      ? state
      : homePage(userId);

  return {
    activeView: page.view,
    suiteModule: page.moduleId,

    canGoBack:
      page.view !== "overview" ||
      page.history.some(
        saved =>
          allowed(
            pageTarget(saved.view, saved.moduleId)
          ) &&
          !samePage(saved, page)
      ),

    navigate,
    goBack,
  };
}