export function buildAuthorizeUrl(hostId: string, state: string, nonce: string, challenge: string): string {
  const url = new URL("https://auth.openai.com/api/accounts/authorize");
  url.searchParams.set("client_id", "dynamic_agent_client");
  url.searchParams.set("agent_name_hint", "Mega Super AI");
  url.searchParams.set("ext_agent_host_id", hostId);
  url.searchParams.set("redirect_uri", "http://127.0.0.1:1455/auth/callback");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct");
  url.searchParams.set("resource", "https://api.openai.com/v1");
  // TODO: set "state", "nonce", "code_challenge", and "code_challenge_method" (value: "S256")
    url.searchParams.set("state", state);
    url.searchParams.set("nonce", nonce);
    url.searchParams.set("code_challenge", challenge);
    url.searchParams.set("code_challenge_method", "S256");

  return url.toString();
}