import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const runtimePath = resolve(process.cwd(), ".next", "server", "webpack-runtime.js");

const targetPatterns = [
  'require(("number"==typeof d?"./chunks/":"./")+c.u(d))',
  'require((typeof chunkId === "number" ? "./chunks/" : "./") + __webpack_require__.u(chunkId))',
];

const patchCandidates = [
  {
    broken: 'require("./"+c.u(d))',
    fixed: 'require(("number"==typeof d?"./chunks/":"./")+c.u(d))',
  },
  {
    broken: 'require("./chunks/"+c.u(d))',
    fixed: 'require(("number"==typeof d?"./chunks/":"./")+c.u(d))',
  },
  {
    broken: 'require("./" + __webpack_require__.u(chunkId))',
    fixed:
      'require((typeof chunkId === "number" ? "./chunks/" : "./") + __webpack_require__.u(chunkId))',
  },
  {
    broken: 'require("./chunks/" + __webpack_require__.u(chunkId))',
    fixed:
      'require((typeof chunkId === "number" ? "./chunks/" : "./") + __webpack_require__.u(chunkId))',
  },
];

function main() {
  if (!existsSync(runtimePath)) {
    console.log("Skipping Next runtime patch because no production build exists yet.");
    return;
  }

  const current = readFileSync(runtimePath, "utf8");

  if (targetPatterns.some((pattern) => current.includes(pattern))) {
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
