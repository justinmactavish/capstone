/*
 * index.ts
 *
 * Application entry point — wires together middleware and routes, then starts
 * the server. All business logic lives in the imported modules.
 *
 * Routes:
 *   GET /                              — health check
 *   GET /robots                        — list available robots and sensors
 *   GET /robot1/:sensor/metrics        — list distinct metric names for a sensor
 *   GET /robot1/:sensor/readings       — query raw sensor readings with optional filters
 *   GET /robot1/:sensor/summary        — avg / min / max / count for a metric
 *   GET /robot1/torque/redline         — motor wear / redline analysis
 *   GET /timestable/:table             — times table demo
 */
import express from 'express';
import { config } from './db.js';
import { rateLimiter } from './middleware/rateLimiter.js';
import { errorHandler } from './middleware/errorHandler.js';
import { discoveryRouter } from './routes/discovery.js';
import { filterRouter } from './routes/filter.js';
import { aggregateRouter } from './routes/aggregate.js';
import { redlineRouter } from './routes/redline.js';
import { timestableRouter } from './routes/timestable.js';
const PORT = 4000;
const app = express();
// ── CORS ──────────────────────────────────────────────────────────────────────
// Allows any origin to call this API — required for browser-based visualizations.
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
        res.sendStatus(204);
        return;
    }
    next();
});
// ── Request logging ───────────────────────────────────────────────────────────
app.use((req, _res, next) => {
    console.log(`${req.method} ${req.path}`);
    next();
});
// ── Rate limiting ─────────────────────────────────────────────────────────────
app.use(rateLimiter);
// ── Static files ──────────────────────────────────────────────────────────────
app.use(express.static('public'));
// ── Health check ──────────────────────────────────────────────────────────────
app.get('/', (_req, res) => {
    res.json({
        status: "ok",
        message: "Hbot Robot Telemetry API",
        routes: [
            "GET /sensors",
            "GET /:sensor/columns",
            "GET /:sensor/readings",
            "GET /:sensor/summary",
            "GET /hbot-torque/redline",
        ],
        sensors: [
            "hbot-position",
            "hbot-status",
            "hbot-torque",
            "cell-status",
        ],
    });
});
// ── Routes ────────────────────────────────────────────────────────────────────
app.use(discoveryRouter);
app.use(filterRouter);
app.use(aggregateRouter);
app.use(redlineRouter);
app.use(timestableRouter);
// ── Centralised error handler (must be last) ──────────────────────────────────
app.use(errorHandler);
// ── Start server ──────────────────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`Project: ${config.projectTitle}`);
    console.log(`Listening on port ${PORT}`);
});
//# sourceMappingURL=index.js.map