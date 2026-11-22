
import { useEffect } from "react";

export default function MotionPerformance() {
  useEffect(() => {
    const root = document.documentElement;

    const update = () => root.toggleAttribute(
      "data-td-motion-paused",
      document.hidden
    );

    update();
    document.addEventListener("visibilitychange", update);

    return () => {
      document.removeEventListener("visibilitychange", update);
      root.removeAttribute("data-td-motion-paused");
    };
  }, []);

  return null;
}
