import type { NextFunction, Request, RequestHandler, Response } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config";
import { HttpError } from "../http";
import { Role, User } from "../models";

export const COOKIE_NAME = "gp_token";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function signToken(userId: string) {
  // NOTE: the token carries ONLY the user id. The role is always read from MongoDB.
  return jwt.sign({}, config.jwtSecret, { subject: userId, expiresIn: config.jwtExpiresIn as jwt.SignOptions["expiresIn"] });
}

export function setAuthCookie(res: Response, token: string) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.cookieSecure,
    maxAge: 8 * 60 * 60 * 1000,
    path: "/",
  });
}
export function clearAuthCookie(res: Response) {
  res.clearCookie(COOKIE_NAME, { httpOnly: true, sameSite: "lax", secure: config.cookieSecure, path: "/" });
}

async function loadUser(req: Request) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  let sub: string;
  try {
    const payload = jwt.verify(token, config.jwtSecret) as jwt.JwtPayload;
    sub = String(payload.sub);
  } catch {
    throw new HttpError(401, "Session expired or invalid", "UNAUTHENTICATED");
  }
  // The role is read from MongoDB on every request — never from the token or the client.
  const user = await User.findById(sub).lean();
  if (!user || !user.active) throw new HttpError(401, "Account not available", "UNAUTHENTICATED");
  req.user = { id: String(user._id), name: user.name, email: user.email, role: user.role as Role };
}

/** 401 unless a valid cookie maps to an ACTIVE user that still exists in MongoDB. */
export const authenticate: RequestHandler = async (req: Request, _res: Response, next: NextFunction) => {
  await loadUser(req);
  next();
};

/**
 * auth()            -> any signed-in user   (401 if not signed in)
 * auth("ADMIN")     -> only that role       (401 if not signed in, 403 if wrong role)
 */
export function auth(...roles: Role[]): RequestHandler {
  return async (req, _res, next) => {
    await loadUser(req);
    if (roles.length && !roles.includes(req.user!.role)) {
      throw new HttpError(403, `Forbidden: this action is restricted to ${roles.join(" / ")}`, "FORBIDDEN");
    }
    next();
  };
}
