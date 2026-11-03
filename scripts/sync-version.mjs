import fs from "node:fs";

const version = process.argv[2];
if (!version) {
  throw new Error("usage: node scripts/sync-version.mjs <version>");
}

const file = ".claude-plugin/plugin.json";
const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
manifest.version = version;
fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
