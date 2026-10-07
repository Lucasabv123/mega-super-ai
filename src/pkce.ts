import {randomBytes, createHash} from "node:crypto";
export function makeAuthSecrets() {
    const state = randomBytes(32).toString("hex");
    const nonce = randomBytes(32).toString("hex");
    const verifier = randomBytes(32).toString("hex");
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    return { state, nonce, verifier, challenge };
}
