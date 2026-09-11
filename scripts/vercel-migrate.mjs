import { execFileSync } from "node:child_process";

if (process.env.VERCEL_ENV === "preview") {
  console.log("Preview deployment: migrations are skipped. Configure a preview database before using database-backed routes.");
} else {
  const npx = process.platform === "win32" ? "npx.cmd" : "npx";
  execFileSync(npx, ["prisma", "migrate", "deploy"], { stdio: "inherit" });
}
