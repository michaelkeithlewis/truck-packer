const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");

const PROJECT_ROOT = path.resolve(__dirname, "../../..");
const CSV_PATH = path.resolve(__dirname, "../../packaging/src/test/resources/cases.csv");
const STAGING_DIR = path.resolve(__dirname, "../../packaging/target/pack-output");
const ASSETS_DIR = path.resolve(__dirname, "../public/assets");

function getJavaHome() {
  const candidates = [
    process.env.JAVA_HOME,
    "/opt/homebrew/opt/openjdk/libexec/openjdk.jdk/Contents/Home",
    "/usr/local/opt/openjdk/libexec/openjdk.jdk/Contents/Home",
  ];
  for (const c of candidates) {
    if (c && fs.existsSync(path.join(c, "bin", "java"))) return c;
  }
  return "";
}

function batchCopyConfigs() {
  if (!fs.existsSync(STAGING_DIR)) return 0;
  const files = fs.readdirSync(STAGING_DIR).filter(f => f.endsWith(".json"));
  if (!fs.existsSync(ASSETS_DIR)) fs.mkdirSync(ASSETS_DIR, { recursive: true });
  for (const f of files) {
    fs.copyFileSync(path.join(STAGING_DIR, f), path.join(ASSETS_DIR, f));
  }
  return files.length;
}

module.exports = function (app) {
  app.post("/api/upload-csv", (req, res) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      if (!body.trim()) {
        return res.status(400).json({ error: "Empty CSV" });
      }

      fs.writeFileSync(CSV_PATH, body);

      const javaHome = getJavaHome();
      const env = {
        ...process.env,
        ...(javaHome && {
          JAVA_HOME: javaHome,
          PATH: `${javaHome}/bin:${process.env.PATH}`,
        }),
      };

      const cmd =
        "mvn test -pl visualizer/packaging -Dtest=CsvPackerTest#generateAllConfigs " +
        "-Dmaven.javadoc.skip=true -Dmaven.source.skip=true -Dmoditect.skip=true";

      console.log("[upload-csv] Running Maven (writing to staging dir)...");
      exec(cmd, { cwd: PROJECT_ROOT, env, timeout: 180000 }, (err, stdout, stderr) => {
        if (err) {
          console.error("[upload-csv] Maven failed:", stderr.slice(-500));
          return res
            .status(500)
            .json({ error: "Packing failed. Check server logs." });
        }
        const count = batchCopyConfigs();
        console.log(`[upload-csv] Maven succeeded — copied ${count} configs to public/assets`);
        res.json({ ok: true, configs: count });
      });
    });
  });
};
