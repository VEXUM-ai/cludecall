import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const runtimePath = resolve(process.cwd(), ".next", "server", "webpack-runtime.js");

const alreadyPatchedPatterns = [
  'require("./chunks/"+c.u(d))',
  'require("./chunks/" + __webpack_require__.u(chunkId))',
];

const patchCandidates = [
  {
    broken: 'require("./"+c.u(d))',
    fixed: 'require("./chunks/"+c.u(d))',
  },
  {
    broken: 'require("./" + __webpack_require__.u(chunkId))',
    fixed: 'require("./chunks/" + __webpack_require__.u(chunkId))',
  },
];

function main() {
  if (!existsSync(runtimePath)) {
    throw new Error(
      "Cannot find .next/server/webpack-runtime.js. Run `next build` before patching the runtime."
    );
  }

  const current = readFileSync(runtimePath, "utf8");

  if (alreadyPatchedPatterns.some((pattern) => current.includes(pattern))) {
    console.log("Next runtime chunk path is already patched.");
    return;
  }

  for (const candidate of patchCandidates) {
    if (current.includes(candidate.broken)) {
      const updated = current.replace(candidate.broken, candidate.fixed);
      writeFileSync(runtimePath, updated, "utf8");
      console.log("Patched .next/server/webpack-runtime.js for numeric server chunks.");
      return;
    }
  }

  throw new Error("Could not find a known Next runtime chunk loader pattern to patch.");
}

main();
