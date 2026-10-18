import { RequestHandler } from "express";
import { createRemoteJWKSet, jwtVerify, JWTVerifyGetKey } from "jose";
import { AppError } from "./errorHandler";

export interface StudentAuthConfig { issuer: string; authorizedParties: string[] }

/** Trust configuration comes from the server, never from a token or request. */
export function studentAuthConfig(env: NodeJS.ProcessEnv = process.env): StudentAuthConfig {
  const issuer = env.CLERK_ISSUER_URL?.trim().replace(/\/$/, "");
  const parties = env.CLERK_AUTHORIZED_PARTIES?.split(",").map(s => s.trim()).filter(Boolean) ?? [];
  if (!issuer || !parties.length) throw new Error("CLERK_ISSUER_URL and CLERK_AUTHORIZED_PARTIES are required for Notes authentication");
  const url = new URL(issuer);
  if (url.protocol !== "https:" || url.origin !== issuer || url.username || url.password) throw new Error("CLERK_ISSUER_URL must be an HTTPS origin");
  for (const party of parties) {
    const origin = new URL(party);
    if (!["http:", "https:"].includes(origin.protocol) || origin.origin !== party) throw new Error("CLERK_AUTHORIZED_PARTIES must contain exact frontend origins");
  }
  return { issuer, authorizedParties: parties };
}

export function createStudentAuth(config: StudentAuthConfig, keys?: JWTVerifyGetKey): RequestHandler {
  // A cached, fixed JWKS endpoint prevents untrusted token issuers choosing a key server.
  const keySet = keys ?? createRemoteJWKSet(new URL(`${config.issuer}/.well-known/jwks.json`), { timeoutDuration: 5000 });
  return async (req, res, next) => {
    res.setHeader("Cache-Control", "private, no-store");
    const header = req.get("Authorization");
    if (!header || !/^Bearer [^\s]+$/i.test(header)) {
      res.setHeader("WWW-Authenticate", "Bearer");
      return next(new AppError("Sign in to access your notes", 401));
    }
    try {
      const { payload } = await jwtVerify(header.slice(7), keySet, {
        issuer: config.issuer, algorithms: ["RS256"], typ: "JWT",
        requiredClaims: ["sub", "sid", "exp", "iat", "nbf"], clockTolerance: 5,
      });
      if (typeof payload.sub !== "string" || !payload.sub.startsWith("user_") ||
          typeof payload.sid !== "string" || !payload.sid.startsWith("sess_") ||
          typeof payload.iat !== "number" || payload.iat > Date.now() / 1000 + 5 ||
          (payload.azp !== undefined && (typeof payload.azp !== "string" || !config.authorizedParties.includes(payload.azp))) ||
          payload.sts === "pending") throw new Error("Invalid student session");
      // Native sessions may omit azp. A supplied browser Origin must also be allowed.
      const origin = req.get("Origin");
      if (origin && !config.authorizedParties.includes(origin)) throw new Error("Untrusted browser origin");
      res.locals.studentId = payload.sub;
      return next();
    } catch {
      res.setHeader("WWW-Authenticate", "Bearer");
      return next(new AppError("Your session could not be verified. Please sign in again.", 401));
    }
  };
}

export function studentId(res: { locals: Record<string, any> }): string {
  if (typeof res.locals.studentId !== "string") throw new AppError("Sign in to access your notes", 401);
  return res.locals.studentId;
}
