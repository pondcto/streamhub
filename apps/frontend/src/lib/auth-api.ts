import type { Account, TokenResponse } from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

/** Extract the backend's `{ detail: { message } }` error shape into a string. */
async function errorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const data = await res.json();
    if (data?.detail?.message) return String(data.detail.message);
    if (typeof data?.detail === "string") return data.detail;
  } catch {
    // non-JSON body
  }
  return `${fallback} (${res.status})`;
}

async function postJson<T>(path: string, body: unknown, fallback: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(await errorMessage(res, fallback));
  }
  return res.json() as Promise<T>;
}

export function loginRequest(email: string, password: string): Promise<TokenResponse> {
  return postJson<TokenResponse>("/api/accounts/login", { email, password }, "Sign in failed");
}

export function signupRequest(
  email: string,
  password: string,
  display_name: string
): Promise<TokenResponse> {
  return postJson<TokenResponse>(
    "/api/accounts/signup",
    { email, password, display_name },
    "Sign up failed"
  );
}

export async function fetchMe(token: string): Promise<Account> {
  const res = await fetch(`${API_BASE}/api/accounts/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(await errorMessage(res, "Session check failed"));
  }
  return res.json() as Promise<Account>;
}
