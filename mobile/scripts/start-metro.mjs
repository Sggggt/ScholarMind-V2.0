import { spawn } from "node:child_process";
import http from "node:http";
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
const args = [expoCli, "start", "--dev-client", "--port", port];

function fetchPackagerStatus(targetPort) {
  return new Promise((resolve) => {
    const req = http.get(
      {
        host: "127.0.0.1",
        port: Number(targetPort),
        path: "/status",
        timeout: 1500,
      },
      (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => {
          resolve({
            ok: response.statusCode === 200 && body.includes("packager-status:running"),
          });
        });
      }
    );

    req.on("timeout", () => {
      req.destroy();
      resolve({ ok: false });
    });

    req.on("error", () => {
      resolve({ ok: false });
    });
  });
}

async function main() {
  const status = await fetchPackagerStatus(port);
  if (status.ok) {
    console.log(`[start-metro] Metro is already running on http://localhost:${port}; reusing it.`);
    process.exit(0);
  }

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
}

main().catch((error) => {
  console.error("[start-metro] Unexpected failure:", error);
  process.exit(1);
});
