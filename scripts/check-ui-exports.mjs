import fs from "fs";
import path from "path";

function walk(d, a = []) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory() && e.name !== "node_modules" && e.name !== ".next") walk(p, a);
    else if (/\.(tsx|ts)$/.test(e.name)) a.push(p);
  }
  return a;
}

const files = walk("apps/web/src");
const importRe = /import\s*\{([^}]+)\}\s*from\s*['"]@\/components\/ui['"]/g;
const names = new Set();
for (const f of files) {
  const c = fs.readFileSync(f, "utf8");
  let m;
  while ((m = importRe.exec(c))) {
    m[1].split(",").forEach((x) => {
      const n = x.replace(/\s+as\s+\w+/, "").trim();
      if (n) names.add(n);
    });
  }
}
const ui =
  fs.readFileSync("apps/web/src/components/ui.tsx", "utf8") +
  "\n" +
  fs.readFileSync("apps/web/src/components/ui-select.tsx", "utf8");
const missing = [...names].filter((n) => {
  const re = new RegExp(`export (function|const|type|class) ${n}\\b|export \\{[^}]*\\b${n}\\b`);
  return !re.test(ui);
});
console.log("imported count", names.size);
console.log("missing", missing);
