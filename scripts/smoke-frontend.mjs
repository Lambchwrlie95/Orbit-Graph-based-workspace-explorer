import { spawn, spawnSync } from "node:child_process";

const root = process.cwd();
const port = process.env.ORBIT_SMOKE_PORT ?? "1420";
const url = `http://127.0.0.1:${port}/`;

function findBrowser() {
  for (const candidate of ["chromium", "chromium-browser", "google-chrome", "google-chrome-stable"]) {
    const result = spawnSync("sh", ["-lc", `command -v ${candidate}`], {
      encoding: "utf8",
    });
    const path = result.stdout.trim();
    if (result.status === 0 && path) {
      return path;
    }
  }
  return null;
}

async function waitForServer(timeoutMs = 20_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // Vite is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Frontend did not respond at ${url}`);
}

const vite = spawn("npm", ["run", "dev", "--prefix", "frontend", "--", "--port", port, "--strictPort"], {
  cwd: root,
  detached: true,
  env: { ...process.env, BROWSER: "none" },
  stdio: ["ignore", "pipe", "pipe"],
});

function stopServer() {
  if (!vite.pid) return;
  try {
    process.kill(-vite.pid, "SIGTERM");
  } catch {
    try {
      vite.kill("SIGTERM");
    } catch {
      // Process already exited.
    }
  }
}

let logs = "";
vite.stdout.on("data", (chunk) => {
  logs += chunk.toString();
});
vite.stderr.on("data", (chunk) => {
  logs += chunk.toString();
});

try {
  await waitForServer();

  const browser = findBrowser();
  if (!browser) {
    console.log("Frontend server responded; browser smoke skipped because no Chromium-compatible binary was found.");
    process.exitCode = 0;
  } else {
    const result = spawnSync(
      browser,
      [
        "--headless=new",
        "--disable-gpu",
        "--window-size=1440,900",
        "--dump-dom",
        url,
      ],
      { encoding: "utf8", timeout: 20_000 }
    );

    if (result.status !== 0) {
      console.error(result.stderr || result.stdout || "Chromium smoke failed without output.");
      process.exitCode = result.status ?? 1;
    } else if (!result.stdout.includes("Orbit") || !result.stdout.includes("app-shell")) {
      console.error("Frontend loaded, but expected Orbit workbench markers were missing.");
      process.exitCode = 1;
    } else {
      console.log(`Frontend smoke passed at ${url}.`);
    }
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  console.error(logs);
  process.exitCode = 1;
} finally {
  stopServer();
}
