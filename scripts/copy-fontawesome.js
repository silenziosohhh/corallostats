const fs = require("fs");
const path = require("path");

function ensureDirSync(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyFileSync(src, dst) {
  ensureDirSync(path.dirname(dst));
  fs.copyFileSync(src, dst);
}

function copyDirSync(srcDir, dstDir) {
  ensureDirSync(dstDir);
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const src = path.join(srcDir, entry.name);
    const dst = path.join(dstDir, entry.name);
    if (entry.isDirectory()) copyDirSync(src, dst);
    else if (entry.isFile()) copyFileSync(src, dst);
  }
}

function main() {
  const root = path.join(__dirname, "..");
  const srcRoot = path.join(root, "node_modules", "@fortawesome", "fontawesome-free");
  const dstRoot = path.join(root, "public", "vendor", "fontawesome");

  const cssSrc = path.join(srcRoot, "css", "all.min.css");
  const cssDst = path.join(dstRoot, "css", "all.min.css");
  const webfontsSrc = path.join(srcRoot, "webfonts");
  const webfontsDst = path.join(dstRoot, "webfonts");

  if (!fs.existsSync(cssSrc) || !fs.existsSync(webfontsSrc)) {
    console.error("Font Awesome sorgente non trovata. Esegui prima `npm i`.");
    process.exitCode = 1;
    return;
  }

  copyFileSync(cssSrc, cssDst);
  copyDirSync(webfontsSrc, webfontsDst);
  console.log("Font Awesome copiato in public/vendor/fontawesome");
}

main();
