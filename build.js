// The manager executes these modules in one closure. Do not tokenize JavaScript
// with a comment stripper: regex literals, ASI and template text must survive.
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function assemble(dir = __dirname) {
  const parts = Array.from({ length: 6 }, (_, i) => `part${i + 1}.js`);
  const files = fs
    .readdirSync(path.join(dir, "src"))
    .filter((n) => n.endsWith(".js"))
    .sort();
  if (files.join() !== parts.join()) throw Error("Unexpected src modules; update the explicit build order.");
  const source = parts
    .map((p) => fs.readFileSync(path.join(dir, "src", p), "utf8").replace(/\r\n?/g, "\n"))
    .join("\n");
  const header = /^\/\/ ==UserScript==\n([\s\S]*?)^\/\/ ==\/UserScript==$/m.exec(source);
  if (!header || header.index !== 0) throw Error("Missing userscript header");
  const fields = [...header[1].matchAll(/^\/\/ @version\s+(\S+)\s*$/gm)];
  if (fields.length !== 1 || !/^(?:0|[1-9]\d*)(?:\.(?:0|[1-9]\d*)){2}$/.test(fields[0][1]))
    throw Error("Expected one stable @version");
  if (source.split("__IGNIS_VERSION__").length !== 2) throw Error("Missing or duplicate runtime version stamp");
  const code = source.replace("__IGNIS_VERSION__", fields[0][1]);
  new vm.Script(code, { filename: "ignis.user.js" });
  return { code, version: fields[0][1] };
}
if (require.main === module) {
  const { code, version } = assemble();
  if (process.argv[2] === "--version") console.log(version);
  else {
    const dest = process.argv[2] || path.join(__dirname, "ignis.user.js");
    fs.writeFileSync(dest, code);
    console.log(`Built IGNIS ${version} (${Buffer.byteLength(code)} bytes)`);
  }
}
module.exports = { assemble };
