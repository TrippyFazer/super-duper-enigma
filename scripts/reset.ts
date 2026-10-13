import fs from "node:fs";
import { resolveDbPath } from "../src/db/client";

const p = resolveDbPath();
for (const suffix of ["", "-wal", "-shm", "-journal"]) {
  if (fs.existsSync(p + suffix)) fs.rmSync(p + suffix);
}
console.log(`Removed ${p}. Run \`npm run db:migrate\` or start the app to recreate it.`);
