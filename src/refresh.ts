import { readFileSync, writeFileSync } from "node:fs";
import { refreshTokens } from "./token.js";

const tokens = JSON.parse(readFileSync("data/tokens.json", "utf8"));
const clientId = readFileSync("data/client-id.txt", "utf8").trim();

const newTokens = await refreshTokens(tokens.refresh_token, clientId);
// keep the old values, then put the new ones on top
writeFileSync("data/tokens.json", JSON.stringify({ ...tokens, ...newTokens }, null, 2));
console.log("Refreshed:", Object.keys(newTokens));