/*
 * middleware/errorHandler.ts
 *
 * Centralised error handler — registered last in index.ts so it catches any
 * error passed via next(err) from route handlers.
 * Returns a consistent JSON error shape regardless of where the error came from.
 */

import type { Request, Response, NextFunction } from 'express';

export function errorHandler(
    err: any,
    req: Request,
    res: Response,
    next: NextFunction
): void {
    console.error("Unhandled error:", err);

    const status  = err.status ?? 500;
    const message = err.message ?? "An unexpected error occurred.";

    res.status(status).json({
        error:   message,
        details: process.env.NODE_ENV !== "production" ? String(err) : undefined,
    });
}
