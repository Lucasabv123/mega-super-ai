import { readFileSync, writeFileSync } from "node:fs";
import { refreshTokens } from "./token.js";
import { existsSync } from "node:fs";

export async function getAccessToken() {
  const tokens = JSON.parse(readFileSync("data/tokens.json", "utf8"));

  // still good for 5 more minutes or longer? use it
  const fiveMinutes = 5 * 60 * 1000;
  if (tokens.expires_at && Date.now() < tokens.expires_at - fiveMinutes) {
    return tokens.access_token;
  }

  // too old (or we don't know its age): get a new one
  const clientId = readFileSync("data/client-id.txt", "utf8").trim();
  const newTokens = await refreshTokens(tokens.refresh_token, clientId); // blank 2
  const expires_at = Date.now() + newTokens.expires_in * 1000; // expires_in is seconds, Date.now() is milliseconds
  writeFileSync("data/tokens.json", JSON.stringify({ ...tokens, ...newTokens, expires_at }, null, 2));
  return newTokens.access_token;
}
export function getSavedClientId() {
  if (!existsSync("data/client-id.txt")) return null;
  return readFileSync("data/client-id.txt", "utf8").trim();
}