import { SignJWT, jwtVerify, errors as joseErrors } from "jose";

const ISSUER = "chaibook-lm";
const AUDIENCE = "chaibook-lm";
const DEV_FALLBACK = "chaibook-dev-auth-secret-not-for-production-use!!";

export type AccessClaims = {
  sub: string;
  email: string;
  name: string;
  sid: string;
};

function secretKey() {
  const raw = (process.env.AUTH_SECRET || "").trim();
  if (raw) {
    if (process.env.NODE_ENV === "production" && raw.length < 32) {
      throw new Error("AUTH_SECRET must be at least 32 characters in production.");
    }
    return new TextEncoder().encode(raw);
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SECRET is required in production.");
  }
  return new TextEncoder().encode(DEV_FALLBACK);
}

export async function signAccessToken(user: AccessClaims) {
  return new SignJWT({
    email: user.email,
    name: user.name,
    sid: user.sid,
    typ: "access",
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(user.sub)
    .setIssuedAt()
    .setNotBefore("0s")
    .setExpirationTime("15m")
    .setJti(crypto.randomUUID())
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .sign(secretKey());
}

export async function verifyAccessToken(token: string): Promise<AccessClaims | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ["HS256"],
    });
    const sub = typeof payload.sub === "string" ? payload.sub : "";
    const email = typeof payload.email === "string" ? payload.email : "";
    const name = typeof payload.name === "string" ? payload.name : "";
    const sid = typeof payload.sid === "string" ? payload.sid : "";
    if (!sub || !email || !sid || payload.typ !== "access") return null;
    return { sub, email, name: name || email.split("@")[0] || "user", sid };
  } catch (err) {
    if (err instanceof joseErrors.JOSEError) return null;
    return null;
  }
}
