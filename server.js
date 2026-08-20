/* Local and long-running-host entry point.
 *
 * Vercel does not use this file -- it calls the app through api/index.js
 * instead. This is what `npm run dev`, `npm start` and Render use.
 */

import app, { MAX_FILES } from './app.js';

const PORT = process.env.PORT || 8000;

app.listen(PORT, () => {
    console.log(`File-Lens running on http://127.0.0.1:${PORT}`);
    console.log(`Max files per scan: ${MAX_FILES.toLocaleString()}`);
});
