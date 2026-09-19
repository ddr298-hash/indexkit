import { SignJWT, importPKCS8 } from "jose";

export interface ServiceAccount {
  client_email: string;
  private_key: string;
}

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

/**
 * Exchanges a service-account key for a short-lived access token by
 * self-signing a JWT (RS256) and trading it via the OAuth2 JWT-bearer flow.
 * Uses only fetch + WebCrypto (via `jose`), so this runs the same in Node
 * (CLI) and in a Capacitor WebView (app) — no Node-only `googleapis` client.
 */
export async function getAccessToken(sa: ServiceAccount, scope: string): Promise<string> {
  const privateKey = await importPKCS8(sa.private_key, "RS256");
  const now = Math.floor(Date.now() / 1000);

  const jwt = await new SignJWT({ scope })
    .setProtectedHeader({ alg: "RS256" })
    .setIssuer(sa.client_email)
    .setSubject(sa.client_email)
    .setAudience(TOKEN_ENDPOINT)
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(privateKey);

  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error_description || data.error || `OAuth 토큰 발급 실패 (${res.status})`);
  }
  return data.access_token as string;
}
