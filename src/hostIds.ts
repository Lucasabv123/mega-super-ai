// get host ID function
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

// Where we save the ID. "data/" sits next to package.json,
// because that's the folder `npm run dev` runs from.
const HOST_ID_FILE = "data/host-id.txt";

// Returns this computer's host ID.
// The first time, it makes a new one and saves it. After that, it reuses the saved one.
// "export" lets other files (like server.ts) use this function.
export function getHostId(): string {
  // Already saved? Read it and give it back.
  if (existsSync(HOST_ID_FILE)) {
    return readFileSync(HOST_ID_FILE, "utf8").trim(); // trim() removes extra spaces/new lines
  }

  // First run: make a brand-new random ID, like urn:uuid:3f2b8c1e-...
  const id = "urn:uuid:" + randomUUID();

  // Create the data folder (recursive: true = no error if it already exists).
  mkdirSync("data", { recursive: true });

  // Save it so next time we read the same one instead of making a new one.
  writeFileSync(HOST_ID_FILE, id);

  return id;
}
