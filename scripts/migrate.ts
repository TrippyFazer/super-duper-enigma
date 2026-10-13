import { getDb, resolveDbPath } from "../src/db/client";
import { seedRecipes } from "../src/db/seed";

getDb();
const n = seedRecipes();
console.log(`Database ready at ${resolveDbPath()} (migrations applied, ${n} recipes seeded).`);
