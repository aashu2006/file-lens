/* File-Lens -- an Express backend for the folder analyzer.
 *
 * The browser reads metadata from the folder the user picks and POSTs it here.
 * File contents never leave the user's machine, and this server never reads a
 * path off its own disk, which is what makes it safe to deploy publicly.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import express from 'express';
import { z } from 'zod';

import { analyze } from './analyzer.js';

// Browsers get slow enumerating folders past this, and the JSON payload gets
// large. The client stops collecting here and flags the result as truncated.
const MAX_FILES = 50_000;

const PORT = process.env.PORT || 8000;
const STATIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'static');

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

// A 50,000-file payload runs about 8 MB. Express defaults to a 100 KB limit,
// which would reject every real scan with a 413.
app.use(express.json({ limit: '32mb' }));

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

// Registered after the API routes so it cannot shadow them. index.html is
// served at "/" automatically.
app.use(express.static(STATIC_DIR));

app.listen(PORT, () => {
    console.log(`File-Lens running on http://127.0.0.1:${PORT}`);
});
