import { useId, useLayoutEffect, useRef } from "react";
import globeSource from "../assets/techdev-globe.svg?raw";

const SVG_NS = "http://www.w3.org/2000/svg";

// Original nodes: top, bottom, right, lower-left, inner, left.
const ROUTES = [
  { track: 1, seconds: 3.6, phase: 0.748948 },
  { track: 1, seconds: 3.6, phase: 0.248984 },
  { track: 2, seconds: 3.2, phase: 0.975338 },
  { track: 3, seconds: 3.9, phase: 0.434182 },
  { track: 1, seconds: 3.6, phase: 0.849373 },
  { track: 0, seconds: 4.4, phase: 0.535835 },
];

export default function TechDevGlobe({ animated = false }) {
  const host = useRef(null);
  const scope = `td-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}-`;

  useLayoutEffect(() => {
    const container = host.current;

    const documentSvg = new DOMParser().parseFromString(
      globeSource,
      "image/svg+xml",
    );

    const svg = document.importNode(
      documentSvg.documentElement,
      true,
    );

    if (svg.localName !== "svg") return;

    // Remove the original background rectangles.
    Array.from(svg.children).forEach(element => {
      if (element.localName === "rect") element.remove();
    });

    // Frame the globe without the large empty margins.
    // Remove the glow surrounding TD and its code symbol.
const tdPath = svg.querySelector('path[stroke-width="8"]');

if (tdPath) {
  let tdGroup = tdPath.parentElement;

  while (
    tdGroup.parentElement &&
    tdGroup.parentElement !== svg
  ) {
    tdGroup = tdGroup.parentElement;
  }

  tdGroup.removeAttribute("filter");

  tdGroup.querySelectorAll("[filter]").forEach(element => {
    element.removeAttribute("filter");
  });
}
    svg.setAttribute("viewBox", "254 152 480 480");
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "100%");
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");

    // Prevent filters and masks from conflicting between logos.
    svg.querySelectorAll("[id]").forEach(element => {
      element.id = scope + element.id;
    });

    svg.querySelectorAll("*").forEach(element => {
      Array.from(element.attributes).forEach(attribute => {
        if (attribute.name === "id") return;

        attribute.value = attribute.value.replace(
          /url\(#([^)]+)\)/g,
          (_, id) => `url(#${scope}${id})`,
        );
      });
    });

    // These are the four existing globe lines.
    const tracks = Array.from(
      svg.querySelectorAll('path[stroke="#19D8FF"]'),
    ).filter(
      path => Number(path.getAttribute("stroke-width")) <= 6,
    );

    // These are the six existing blue nodes.
    const nodes = Array.from(svg.querySelectorAll("circle"));

    if (animated && tracks.length === 4 && nodes.length === 6) {
      // Keep the globe lines and their nodes in one rotating group.
const wireGroup = tracks[0].parentElement;

const rotatingGroup = document.createElementNS(
  SVG_NS,
  "g",
);

wireGroup.parentNode.insertBefore(
  rotatingGroup,
  wireGroup,
);

rotatingGroup.appendChild(wireGroup);

const nodeGroups = new Set(
  nodes.map(node => node.parentElement),
);

nodeGroups.forEach(group => {
  rotatingGroup.appendChild(group);
});

const rotation = document.createElementNS(
  SVG_NS,
  "animateTransform",
);

rotation.setAttribute("attributeName", "transform");
rotation.setAttribute("type", "rotate");
rotation.setAttribute("from", "0 494 392");
rotation.setAttribute("to", "360 494 392");
rotation.setAttribute("dur", "12s");
rotation.setAttribute("repeatCount", "indefinite");

rotatingGroup.appendChild(rotation);
      tracks.forEach((path, index) => {
        path.id = `${scope}track-${index}`;
      });

      nodes.forEach((node, index) => {
        const route = ROUTES[index];

        const filterReference =
          node.parentElement.getAttribute("filter");

        const filterId =
          filterReference?.match(/url\(#([^)]+)\)/)?.[1];

        const filter = filterId
          ? svg.querySelector(`[id="${filterId}"]`)
          : null;

        // Make the existing glow follow the moving node.
        if (filter) {
          filter.setAttribute("filterUnits", "objectBoundingBox");
          filter.setAttribute("x", "-50%");
          filter.setAttribute("y", "-50%");
          filter.setAttribute("width", "200%");
          filter.setAttribute("height", "200%");
        }

        node.setAttribute("cx", "0");
        node.setAttribute("cy", "0");

        const motion = document.createElementNS(
          SVG_NS,
          "animateMotion",
        );

        motion.setAttribute("dur", `${route.seconds}s`);
        motion.setAttribute(
          "begin",
          `${-route.phase * route.seconds}s`,
        );
        motion.setAttribute("repeatCount", "indefinite");
        motion.setAttribute("calcMode", "paced");

        const pathReference = document.createElementNS(
          SVG_NS,
          "mpath",
        );

        const reference = `#${tracks[route.track].id}`;

        pathReference.setAttribute("href", reference);
        pathReference.setAttributeNS(
          "http://www.w3.org/1999/xlink",
          "xlink:href",
          reference,
        );

        motion.appendChild(pathReference);
        node.appendChild(motion);
      });
    }

    container.replaceChildren(svg);

    const preference = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    );

    const updateMotion = () => {
      if (!animated || preference.matches) {
        svg.pauseAnimations();
      } else {
        svg.unpauseAnimations();
      }
    };

    svg.setCurrentTime(0);
    updateMotion();
    preference.addEventListener("change", updateMotion);

    return () => {
      preference.removeEventListener("change", updateMotion);
      svg.pauseAnimations();
      container.replaceChildren();
    };
  }, [animated, scope]);

  return (
    <span
      ref={host}
      className="techdev-globe"
      aria-hidden="true"
    />
  );
}