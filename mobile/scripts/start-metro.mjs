import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

function resolvePort(rawPort) {
  if (!rawPort) {
    return "8081";
  }

  const port = Number.parseInt(rawPort, 10);

  if (Number.isNaN(port) || port <= 0) {
    console.warn(
      `[start-metro] Ignoring invalid EXPO_PORT="${rawPort}", falling back to 8081.`,
    );
    return "8081";
  }

  return String(port);
}

const port = resolvePort(process.env.EXPO_PORT);
const expoCli = require.resolve("expo/bin/cli");
const command = process.execPath;
const args = [expoCli, "start", "--web", "--port", port];

const child = spawn(command, args, {
  stdio: "inherit",
  env: process.env,
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});

child.on("error", (error) => {
  console.error("[start-metro] Failed to launch Expo:", error);
  process.exit(1);
});
