import { useRef } from "react";
import { Terminal, ChevronRight } from "lucide-react";
import { APP_BUILD_NUMBER } from "./DevAppTest.jsx";

export default function AdminBuildButton({
  role,
  onOpen,
}) {
  const taps = useRef({ count: 0, last: 0 });

  if (role !== "admin") return null;

  return (
    <button
      type="button"
      className="drawer-build-number"
      onClick={() => {
        const now = Date.now();

        taps.current.count =
          now - taps.current.last > 30000
            ? 1
            : taps.current.count + 1;

        taps.current.last = now;

        if (taps.current.count >= 10) {
          taps.current = { count: 0, last: 0 };
          onOpen();
        }
      }}
    >
      <span className="drawer-build-symbol">
        <Terminal size={18} aria-hidden="true" />
      </span>

      <span className="drawer-build-copy">
        <small>LEGION WORKSPACE</small>
        <strong>Build {APP_BUILD_NUMBER}</strong>
      </span>

      <ChevronRight size={15} aria-hidden="true" />
    </button>
  );
}