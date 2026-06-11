const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const appRoot = fs.realpathSync.native(path.resolve(__dirname, ".."));
process.chdir(appRoot);

const nextArgs = process.argv.slice(2);
const command = process.platform === "win32" ? "npx.cmd" : "npx";
const result = spawnSync(command, ["next", ...nextArgs], {
  stdio: "inherit",
  env: process.env,
  shell: true,
});

process.exit(result.status ?? 1);
