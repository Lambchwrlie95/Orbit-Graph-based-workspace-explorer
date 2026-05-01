import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const frontendPath = join(root, "frontend/src/lib/tauriCommands.ts");
const rustPath = join(root, "src-tauri/src/main.rs");

const frontend = readFileSync(frontendPath, "utf8");
const rust = readFileSync(rustPath, "utf8");

const catalogMatch = frontend.match(/TAURI_COMMANDS\s*=\s*\[([\s\S]*?)\]\s*as const/);
if (!catalogMatch) {
  console.error("Could not find TAURI_COMMANDS in frontend/src/lib/tauriCommands.ts");
  process.exit(1);
}

const handlerMatch = rust.match(/tauri::generate_handler!\s*\[([\s\S]*?)\]/);
if (!handlerMatch) {
  console.error("Could not find tauri::generate_handler![...] in src-tauri/src/main.rs");
  process.exit(1);
}

const frontendCommands = [...catalogMatch[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]).sort();
const rustCommands = handlerMatch[1]
  .split(",")
  .map((entry) => entry.trim())
  .filter(Boolean)
  .map((entry) => entry.split("::").at(-1))
  .sort();

const missingInFrontend = rustCommands.filter((command) => !frontendCommands.includes(command));
const missingInRust = frontendCommands.filter((command) => !rustCommands.includes(command));

if (missingInFrontend.length || missingInRust.length) {
  console.error("Tauri command catalog drift detected.");
  if (missingInFrontend.length) {
    console.error(`Missing in frontend catalog: ${missingInFrontend.join(", ")}`);
  }
  if (missingInRust.length) {
    console.error(`Missing in Rust generate_handler: ${missingInRust.join(", ")}`);
  }
  process.exit(1);
}

console.log(`Tauri command catalog matches Rust registry (${frontendCommands.length} commands).`);
