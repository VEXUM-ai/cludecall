import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const runtimePath = resolve(process.cwd(), ".next", "server", "webpack-runtime.js");
const notFoundTracePath = resolve(
  process.cwd(),
  ".next",
  "server",
  "app",
  "_not-found",
  "page.js.nft.json"
);

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
  if (!existsSync(notFoundTracePath)) {
    mkdirSync(dirname(notFoundTracePath), { recursive: true });
    writeFileSync(notFoundTracePath, JSON.stringify({ version: 1, files: [] }), "utf8");
    console.log("Created placeholder _not-found trace manifest.");
  }

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

  console.log("Skipping Next runtime patch because no known chunk loader pattern was found.");
}

main();
