import {
  readdir,
  readFile,
  writeFile,
} from "node:fs/promises";

import {
  resolve,
  relative,
} from "node:path";

import { createHash } from "node:crypto";

export default function offlineBuild() {
  let config;

  return {
    name: "legion-offline-shell",
    apply: "build",
    enforce: "post",

    configResolved(value) {
      config = value;
    },

    async closeBundle() {
      const directory = resolve(
        config.root,
        config.build.outDir
      );

      const worker = resolve(
        directory,
        "legion-push-sw.js"
      );

      const files = [];

      async function visit(folder) {
        for (
          const entry of await readdir(
            folder,
            { withFileTypes: true }
          )
        ) {
          const path = resolve(folder, entry.name);

          if (entry.isDirectory()) {
            await visit(path);
          } else if (
            /\.(?:html|js|css|svg|png|jpg|jpeg|webp|ico|woff2?|ttf)$/i
              .test(entry.name) &&
            path !== worker
          ) {
            files.push(
              relative(directory, path)
                .replace(/\\/g, "/")
            );
          }
        }
      }

      await visit(directory);
      files.sort();

      const hash = createHash("sha256");

      for (const file of files) {
        hash.update(file);

        hash.update(
          await readFile(resolve(directory, file))
        );
      }

      const template = await readFile(
        worker,
        "utf8"
      );

      await writeFile(
        worker,
        template
          .replace(
            "const SHELL_FILES = [];",
            `const SHELL_FILES = ${JSON.stringify(files)};`
          )
          .replace(
            'const SHELL_VERSION = "dev";',
            `const SHELL_VERSION = "${hash.digest("hex").slice(0, 16)}";`
          )
      );
    },
  };
}