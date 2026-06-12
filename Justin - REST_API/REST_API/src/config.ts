/*
 * config.ts
 * 
 *
 * Static utility class for loading application configuration at startup.
 * All methods are pure/static — no instance state is held here.
 *
 * Responsibilities:
 *   - Resolve config file paths relative to the script location
 *   - Read tag list files into sanitized string arrays
 *   - Read and parse JSON config files
 *   - Safely resolve environment variable values by name
 */

import * as fs from 'fs';
import * as path from 'path';


export class Configuration {

    //=============================================================================
    // setConfigurationFilename()
    //
    // Resolves a bare filename to a fully qualified path relative to this
    // script's directory, stepping up one level (/../). This ensures config
    // files are found regardless of the working directory the process
    // was launched from.
    //
    // Example:
    //   Script at : /home/user/mqtt02/src/config.ts
    //   fname     : "config.json"
    //   Returns   : /home/user/mqtt02/config.json
    //
    // Parameters:
    //   fname  - bare filename to resolve, e.g. "config.json"
    //
    // Returns:
    //   Fully qualified path string. Does NOT verify the file exists.
    //=============================================================================
    public static setConfigurationFilename(fname: string): string {
        return path.resolve(path.dirname(import.meta.filename), '..', fname);
    }

    //=============================================================================
    // readFileAsArray()
    //
    // Reads a plain-text file and returns its non-empty lines as a sanitized
    // string array. Designed for tag-list files (tags.txt) with these rules:
    //
    //   - Inline comments : anything after "//" on a line is stripped
    //   - Whitespace      : leading/trailing whitespace trimmed; internal
    //                       whitespace removed so "HMI_GVL. M.Rob1" becomes
    //                       "HMI_GVL.M.Rob1"
    //   - Blank lines     : skipped (including lines that were comment-only)
    //   - Line endings    : handles both Windows (\r\n) and Unix (\n)
    //
    // Parameters:
    //   fname  - fully qualified path to the text file
    //
    // Returns:
    //   string[] of cleaned, non-empty lines.
    //   Returns [] on any read or processing failure (error is logged).
    //=============================================================================
    public static readFileAsArray(fname: string): string[] {
        try {
            const raw: string = fs.readFileSync(fname).toString();

            // Normalise line endings: replace \r\n (Windows) then split on \n (Unix/Mac)
            const textlines: string[] = raw.replace(/\r\n/g, '\n').split('\n');

            const cleanedLines: string[] = [];

            for (let line of textlines) {
                // Strip inline comments — everything from "//" to end of line
                const commentIndex: number = line.indexOf('//');
                if (commentIndex !== -1) {
                    line = line.substring(0, commentIndex);
                }

                // Remove leading and trailing whitespace
                line = line.trim();

                // Remove any whitespace embedded within the tag name
                // e.g. "HMI_GVL. M.Rob1"  →  "HMI_GVL.M.Rob1"
                line = line.replace(/\s+/g, '');

                // Discard empty lines (blank rows, comment-only rows, etc.)
                if (line.length === 0) continue;

                cleanedLines.push(line);
            }

            return cleanedLines;

        } catch (err) {
            console.error(`[Config] Failed to read tag file "${fname}":`, err);
            return [];
        }
    }

    //=============================================================================
    // readFileAsJSON()
    //
    // Reads a file from disk and parses its contents as JSON, returning the
    // resulting object. Used to load config.json at startup.
    //
    // Parameters:
    //   fname  - fully qualified path to the JSON file
    //
    // Returns:
    //   Parsed JSON object (type any).
    //   Returns {} on any read or parse failure (error is logged).
    //=============================================================================
    public static readFileAsJSON(fname: string): any {
        try {
            const data: string = fs.readFileSync(fname).toString();
            return JSON.parse(data);
        } catch (err) {
            console.error(`[Config] Failed to read or parse JSON file "${fname}":`, err);
            return {};
        }
    }

    //=============================================================================
    // getEnvVar()
    //
    // Safely retrieves the value of a named environment variable.
    //
    // This replaces the previous eval()-based approach (e.g. eval("process.env." + key))
    // which was vulnerable to code injection if a malicious string were ever placed
    // in config.json. Direct property lookup via process.env[key] is both safe
    // and equivalent for all valid environment variable names.
    //
    // Parameters:
    //   key  - environment variable name, e.g. "POSTGRESUSER"
    //
    // Returns:
    //   The string value if the variable is set and non-empty.
    //   Throws an Error if the variable is missing or empty, so startup fails
    //   loudly rather than continuing with an undefined credential.
    //=============================================================================
    public static getEnvVar(key: string): string {
        const value: string | undefined = process.env[key];
        if (!value) {
            throw new Error(`[Config] Required environment variable "${key}" is not set.`);
        }
        return value;
    }
}
