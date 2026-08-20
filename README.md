# 📁 file-Lens

**file-Lens** scans a folder and shows you what is eating your disk — a storage
breakdown pie chart, per-category totals, and the largest files — in a
deliberately vintage, 90s file-explorer interface.

You pick a folder with the native OS folder picker. The browser reads only
metadata — name, size, modified date, and the path relative to the folder you
picked — and sends that to the server, which categorizes it and returns the
numbers. File contents are never read and never uploaded, and the server has no
filesystem access of its own.

Runs on macOS, Windows and Linux.

---

### 🗂 Project layout

| File | Purpose |
|---|---|
| `server.js` | Express app — serves the page, exposes `POST /api/analyze` |
| `analyzer.js` | Categorization and totals. Pure functions, no disk access |
| `static/index.html` | Page shell |
| `static/app.js` | Folder picker, metadata collection, rendering |
| `static/style.css` | The vintage styling |
| `package.json` | Node + Express, with zod for request validation |
| `render.yaml` | Render deployment blueprint |

---
