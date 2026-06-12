import type { Request, Response, NextFunction } from 'express';
/**
 * Express middleware that enforces the rate limit.
 * Calls next() if the request is within quota, or sends 429 if exceeded.
 */
export declare function rateLimiter(req: Request, res: Response, next: NextFunction): void;
//# sourceMappingURL=rateLimiter.d.ts.map