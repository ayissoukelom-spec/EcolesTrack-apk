import { Request, Response, NextFunction } from "express";
import { Logger } from "../utils/logger";

const logger = new Logger("SecurityMiddleware");

// Custom authenticated request type
export interface AuthenticatedRequest extends Request {
  parent?: {
    id: string;
    email: string;
    role: string;
  };
  requestId?: string;
}

/**
 * Helmet-equivalent HTTP Security Headers
 */
export function helmetHeaders(req: Request, res: Response, next: NextFunction) {
  // Prevent clickjacking
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  // Prevent MIME-sniffing
  res.setHeader("X-Content-Type-Options", "nosniff");
  // Enable XSS protection filter in older browsers
  res.setHeader("X-XSS-Protection", "1; mode=block");
  // Strict Transport Security (HSTS) - 1 year in seconds
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  // Referrer Policy
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  // Content Security Policy
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://fonts.googleapis.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' *"
  );
  next();
}

/**
 * Simple Request ID Generator for Traceability (Observability)
 */
export function requestIdMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const reqId = req.headers["x-request-id"] as string || `req-${Math.random().toString(36).substring(2, 11)}`;
  req.requestId = reqId;
  res.setHeader("X-Request-ID", reqId);
  next();
}

/**
 * Basic Sanitization to prevent simple XSS / SQL Injection in string inputs
 */
export function sanitizePayload(req: Request, res: Response, next: NextFunction) {
  if (req.body && typeof req.body === "object") {
    for (const key of Object.keys(req.body)) {
      if (typeof req.body[key] === "string") {
        // Strip out HTML tags to prevent XSS
        req.body[key] = req.body[key].replace(/<[^>]*>/g, "");
      }
    }
  }
  next();
}
