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
    const categorySizes = new Map(Object.keys(CATEGORIES).map((category) => [category, 0]));
    let totalSize = 0;
    let totalFiles = 0;

    // Single pass: bucket the file and accumulate its size at the same time,
    // rather than summing each bucket again afterwards.
    for (const file of files) {
        const category = categorize(file.name);
        buckets.get(category).push({
            name: file.name,
            path: file.relpath || file.name,
            size_bytes: file.size,
            size_kb: round2(file.size / 1024),
            modified_ms: file.modified_ms,
        });
        categorySizes.set(category, categorySizes.get(category) + file.size);
        totalSize += file.size;
        totalFiles++;
    }

    const largestFirst = (a, b) => b.size_bytes - a.size_bytes;
    const displayCount = Math.max(topN, perCategory);

    const overview = [];
    const topCandidates = [];
    for (const [category, entries] of buckets) {
        if (entries.length === 0) continue;

        const categorySize = categorySizes.get(category);
        const biggest = topLargest(entries, displayCount, largestFirst);

        overview.push({
            category,
            count: entries.length,
            size_mb: round2(categorySize / MB),
            percent: totalSize ? round2((categorySize / totalSize) * 100) : 0,
            files: biggest.slice(0, perCategory),
        });
        topCandidates.push(...biggest);
    }

    // Biggest categories first, so the pie legend and the cards below it agree.
    overview.sort((a, b) => b.size_mb - a.size_mb);

    // The globally largest files must be among the largest of their own
    // category, so merging each bucket's leaders is enough -- no need to sort
    // all 50,000 entries to show 10 of them.
    topCandidates.sort(largestFirst);

    return {
        folder,
        total_files: totalFiles,
        total_size_mb: round2(totalSize / MB),
        overview,
        largest_files: topCandidates.slice(0, topN),
        truncated,
    };
}

/**
 * The `k` largest entries, without sorting the whole array.
 *
 * Keeps a small ordered buffer and only touches it when an entry beats the
 * smallest one held, so the common case is a single comparison per file.
 */
function topLargest(entries, k, compare) {
    if (entries.length <= k) return [...entries].sort(compare);

    const best = entries.slice(0, k).sort(compare);
    for (let i = k; i < entries.length; i++) {
        const entry = entries[i];
        if (compare(entry, best[k - 1]) >= 0) continue;
        best[k - 1] = entry;
        // Bubble it up into place; the buffer is tiny and nearly sorted.
        for (let j = k - 1; j > 0 && compare(best[j], best[j - 1]) < 0; j--) {
            [best[j], best[j - 1]] = [best[j - 1], best[j]];
        }
    }
    return best;
}
