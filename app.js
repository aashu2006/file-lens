/* File-Lens -- the Express app.
 *
 * The browser reads metadata from the folder the user picks and POSTs it here.
 * File contents never leave the user's machine, and this server never reads a
 * path off its own disk, which is what makes it safe to deploy publicly.
 *
 * Built here and exported without listening, so the same app can be started by
 * server.js locally and wrapped as a serverless function by api/index.js.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import express from 'express';
import { z } from 'zod';

import { analyze } from './analyzer.js';

// The client gzips the payload, which shrinks it about 14x, so 50k files
// crosses the wire in roughly 0.5 MB -- comfortably inside Vercel's 4.5 MB
// serverless request cap. The real ceiling is how long a browser takes to
// enumerate a folder that large, not the transfer.
export const MAX_FILES = Number(process.env.MAX_FILES) || 50_000;

const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');

/** One file, as the browser's File API describes it. */
const FileMeta = z.object({
    name: z.string(),
    size: z.number().int().nonnegative(),
    modified_ms: z.number().int().default(0),
    relpath: z.string().default(''),
});

const AnalyzeRequest = z.object({
    files: z.array(FileMeta).max(MAX_FILES),
    folder: z.string().default(''),
    truncated: z.boolean().default(false),
});

const app = express();

// Express defaults to a 100 KB limit, which would reject every real scan with
// a 413. Note this limit is checked against the *inflated* body, so it has to
// cover the uncompressed size (~7 MB at 50k files), not the ~0.5 MB sent.
// inflate is on by default, which is what transparently handles the gzip.
app.use(express.json({ limit: '16mb' }));

// The client reads its own file cap from here, so the limit lives in exactly
// one place and the two cannot drift apart.
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', max_files: MAX_FILES });
});

app.post('/api/analyze', (req, res) => {
    const parsed = AnalyzeRequest.safeParse(req.body);
    if (!parsed.success) {
        return res.status(422).json({ error: 'Invalid payload', detail: parsed.error.issues });
    }

    const { files, folder, truncated } = parsed.data;
    res.json(analyze(files, { folder, truncated }));
});

// Registered after the API routes so it cannot shadow them. On Vercel these
// files are served straight from the CDN and never reach this middleware;
// locally, Express serves them.
app.use(express.static(PUBLIC_DIR));

export default app;
