import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);

export default function techdevPerformance() {
  return {
    name: "techdev-performance",
    apply: "build",

    config(config) {
      const output = config.build?.rollupOptions?.output || {};

      if (
        Array.isArray(output) ||
        (output.manualChunks && typeof output.manualChunks !== "function")
      ) {
        throw new Error(
          "Merge the LiveKit split into the existing Rollup output config."
        );
      }

      const previous = output.manualChunks;
      const root = dirname(dirname(require.resolve("livekit-client")));
      const sdk = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
      const source = join(root, "src", "index.ts");

      const alias = sdk.version === "2.23.0" && existsSync(source)
        ? [{ find: /^livekit-client$/, replacement: source }]
        : [];

      return {
        resolve: { alias },
        build: {
          manifest: true,
          rollupOptions: {
            output: {
              onlyExplicitManualChunks: true,
              manualChunks(rawId, api) {
                const id = rawId.replaceAll("\\", "/");

                if (id.includes("/node_modules/@livekit/protocol/")) {
                  return "livekit-protocol";
                }
                if (id.includes("/node_modules/livekit-client/")) {
                  return "livekit-client";
                }
                if (/\/node_modules\/@livekit\/components-(react|core)\//.test(id)) {
                  return "livekit-ui";
                }

                return previous?.(rawId, api);
              },
            },
          },
        },
      };
    },

    generateBundle(_options, bundle) {
      if (process.env.TECHDEV_STRICT_BUNDLES !== "1") return;

      const oversized = Object.values(bundle).filter(chunk =>
        chunk.type === "chunk" && Buffer.byteLength(chunk.code) > 500_000
      );

      if (oversized.length) {
        this.error(
          `Over 500 kB: ${oversized.map(chunk => chunk.fileName).join(", ")}`
        );
      }
    },
  };
}