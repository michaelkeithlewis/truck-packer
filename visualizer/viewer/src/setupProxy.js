const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");

const PROJECT_ROOT = path.resolve(__dirname, "../../..");
const CSV_PATH = path.resolve(__dirname, "../../packaging/src/test/resources/cases.csv");

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
        "mvn test -pl visualizer/packaging -Dtest=CsvPackerTest#generateAllConfigs";

      console.log("[upload-csv] Running Maven...");
      exec(cmd, { cwd: PROJECT_ROOT, env, timeout: 120000 }, (err, stdout, stderr) => {
        if (err) {
          console.error("[upload-csv] Maven failed:", stderr.slice(-500));
          return res
            .status(500)
            .json({ error: "Packing failed. Check server logs." });
        }
        console.log("[upload-csv] Maven succeeded");
        res.json({ ok: true });
      });
    });
  });
};
