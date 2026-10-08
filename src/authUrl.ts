export function buildAuthorizeUrl(hostId: string, state: string, nonce: string, challenge: string, savedClientId: string | null): string {
  const url = new URL("https://auth.openai.com/api/accounts/authorize");
  if (savedClientId) {
    // We signed in before: reuse the ID OpenAI gave us (no name hint needed).
    url.searchParams.set("client_id", savedClientId);
  } else {
    // Very first sign-in: ask OpenAI to register the app.
    url.searchParams.set("client_id", "dynamic_agent_client");
    url.searchParams.set("agent_name_hint", "Mega Super AI");
  }
  url.searchParams.set("ext_agent_host_id", hostId);
  url.searchParams.set("redirect_uri", "http://127.0.0.1:1455/auth/callback");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct");
  url.searchParams.set("resource", "https://api.openai.com/v1");
  url.searchParams.set("state", state);
  url.searchParams.set("nonce", nonce);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");

  return url.toString();
}