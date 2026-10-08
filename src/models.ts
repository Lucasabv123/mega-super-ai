import { readFileSync } from "node:fs";

const tokens = JSON.parse(readFileSync("data/tokens.json", "utf8"));

const response = await fetch("https://api.openai.com/v1/models", {
  headers: { Authorization: `Bearer ${ tokens.access_token }` },  // blank 1: the access token
});
if (!response.ok) {
  throw new Error(`Error ${response.status}: ${await response.text()}`);
}

const data = await response.json();
for (const model of data.models) {
  if (model.visibility === "list") console.log(model.slug);
}