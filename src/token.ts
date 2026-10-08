export async function exchangeCode(code: string, verifier: string, clientId: string) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: clientId,
    code: code,
    code_verifier: verifier,   // proves we're the app that started the sign-in (PKCE!)
    redirect_uri: "http://127.0.0.1:1455/auth/callback",
    resource: "https://api.openai.com/v1",
  });
  const response = await fetch("https://auth.openai.com/api/accounts/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body,
  });
  if (!response.ok) {
    throw new Error(`Error ${response.status}: ${await response.text()}`);
  }
  return await response.json();
}
export async function refreshTokens(refreshToken: string, clientId: string) {

  const body = new URLSearchParams({
    grant_type: "refresh_token",   
    client_id: clientId,
    refresh_token: refreshToken, 
    resource: "https://api.openai.com/v1",
  });

  const response = await fetch("https://auth.openai.com/api/accounts/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body,
  });
  if (!response.ok) {
    throw new Error(`Error ${response.status}: ${await response.text()}`);
  }
  return await response.json();
}