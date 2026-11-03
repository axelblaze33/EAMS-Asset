import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

// The cookie only carries identity (user id + session version). Role, permissions
// and active status are re-read from the database on every request in dal.ts, so
// deactivating a user or changing their role takes effect immediately.

export const SESSION_COOKIE = "eams_session";
const SESSION_TTL_SECONDS = 60 * 60 * 12; // 12 hours

export type SessionPayload = { sub: string; ver: number };

function secretKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET must be set to at least 32 characters.");
  }
  return new TextEncoder().encode(secret);
}

export async function encryptSession(payload: SessionPayload) {
  return new SignJWT({ ver: payload.ver })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secretKey());
}

export async function decryptSession(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    if (typeof payload.sub !== "string" || typeof payload.ver !== "number") return null;
    return { sub: payload.sub, ver: payload.ver };
  } catch {
    return null;
  }
}

export async function createSession(userId: string, sessionVersion: number) {
  const token = await encryptSession({ sub: userId, ver: sessionVersion });
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function readSession() {
  const store = await cookies();
  return decryptSession(store.get(SESSION_COOKIE)?.value);
}

export async function deleteSession() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}
