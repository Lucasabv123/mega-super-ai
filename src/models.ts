import { readFileSync } from "node:fs";
import { getAccessToken } from "./auth.js";

const accessToken = await getAccessToken();

const response = await fetch("https://api.openai.com/v1/models", {
  headers: { Authorization: `Bearer ${accessToken}` },  // blank 1: the access token
});
if (!response.ok) {
  throw new Error(`Error ${response.status}: ${await response.text()}`);
}

const data = await response.json();
for (const model of data.models) {
  if (model.visibility === "list") console.log(model.slug);
}