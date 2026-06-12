/*
 * db.ts
 *
 * Creates and exports the shared PostgreSQL connection pool.
 * Validates that all required environment variables are present at startup
 * so the server fails loudly rather than silently connecting with bad credentials.
 */
import pg from 'pg';
import * as path from 'path';
import { Configuration } from './config.js';
const { Pool } = pg;
const configFileName = Configuration.setConfigurationFilename("config.json");
const config = Configuration.readFileAsJSON(configFileName);
// Validate required env vars before creating the pool.
// Configuration.getEnvVar() throws if a variable is missing or empty,
// which stops the server immediately with a clear error message.
const dbName = Configuration.getEnvVar(config.env.dbname);
const dbUser = Configuration.getEnvVar(config.env.dbuser);
const dbPw = Configuration.getEnvVar(config.env.dbpw);
export const pool = new Pool({
    host: config.sql.host,
    port: config.sql.port,
    database: dbName,
    user: dbUser,
    password: dbPw,
    ssl: false,
});
export { config };
//# sourceMappingURL=db.js.map