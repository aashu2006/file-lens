/* Categorize file metadata and build the storage overview.
 *
 * This module never touches the disk. It receives metadata the browser
 * already read from the user's chosen folder -- names, sizes, timestamps --
 * and turns it into the numbers the page renders.
 */

import path from 'node:path';

// Extension -> category. "Others" is the fallback and stays empty on purpose.
export const CATEGORIES = {
    Images: ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg', '.heic'],
    Videos: ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm'],
    Documents: ['.pdf', '.doc', '.docx', '.txt', '.md', '.ppt', '.pptx', '.xls', '.xlsx', '.csv'],
    Audio: ['.mp3', '.wav', '.flac', '.aac', '.ogg', '.m4a'],
    Archives: ['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz'],
    Code: ['.py', '.js', '.ts', '.jsx', '.tsx', '.html', '.css', '.json', '.java',
           '.c', '.cpp', '.h', '.go', '.rs', '.rb', '.php', '.sh', '.yml', '.yaml'],
    Others: [],
};

// Flattened once at import so categorizing a file is a Map lookup, not a scan
// over every category's extension list.
const EXT_TO_CATEGORY = new Map(
    Object.entries(CATEGORIES).flatMap(
        ([category, extensions]) => extensions.map((ext) => [ext, category])
    )
);

const MB = 1024 * 1024;

const round2 = (value) => Math.round(value * 100) / 100;

/** Return the category a filename belongs to, based on its extension. */
export function categorize(filename) {
    const ext = path.extname(filename.toLowerCase());
    return EXT_TO_CATEGORY.get(ext) ?? 'Others';
}

/**
 * Turn a list of file metadata into the summary the page renders.
 *
 * `files` is an array of { name, size, modified_ms, relpath }. Returns totals,
 * per-category overview data for the pie chart, the largest files per
 * category, and the overall largest files.
 */
export function analyze(files, { folder = '', truncated = false, topN = 10, perCategory = 5 } = {}) {
    const buckets = new Map(Object.keys(CATEGORIES).map((category) => [category, []]));
    let totalSize = 0;

    for (const file of files) {
        buckets.get(categorize(file.name)).push({
            name: file.name,
            path: file.relpath || file.name,
            size_bytes: file.size,
            size_kb: round2(file.size / 1024),
            modified_ms: file.modified_ms,
        });
        totalSize += file.size;
    }

    const largestFirst = (a, b) => b.size_bytes - a.size_bytes;

    const overview = [];
    for (const [category, entries] of buckets) {
        if (entries.length === 0) continue;
        entries.sort(largestFirst);
        const categorySize = entries.reduce((sum, e) => sum + e.size_bytes, 0);
        overview.push({
            category,
            count: entries.length,
            size_mb: round2(categorySize / MB),
            percent: totalSize ? round2((categorySize / totalSize) * 100) : 0,
            files: entries.slice(0, perCategory),
        });
    }

    // Biggest categories first, so the pie legend and the cards below it agree.
    overview.sort((a, b) => b.size_mb - a.size_mb);

    const everyFile = [...buckets.values()].flat().sort(largestFirst);

    return {
        folder,
        total_files: everyFile.length,
        total_size_mb: round2(totalSize / MB),
        overview,
        largest_files: everyFile.slice(0, topN),
        truncated,
    };
}
