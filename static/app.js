/* File-Lens front end.
 *
 * Reads metadata (name, size, modified date, relative path) from the folder
 * the user picks and sends only that to the backend. File contents are never
 * read and never uploaded.
 */

const MAX_FILES = 50000;

// Vibrant distinct palette (VIBGYOR + extras), carried over from the original.
const COLORS = [
    '#FF0000', '#FF7F00', '#FFD700', '#00A000', '#0000FF',
    '#4B0082', '#8F00FF', '#FF1493', '#00CED1', '#808000'
];

const els = {
    input: document.getElementById('folder-input'),
    button: document.getElementById('pick-button'),
    status: document.getElementById('status'),
    error: document.getElementById('error'),
    results: document.getElementById('results'),
    folder: document.getElementById('stat-folder'),
    files: document.getElementById('stat-files'),
    size: document.getElementById('stat-size'),
    truncated: document.getElementById('truncated-notice'),
    categories: document.getElementById('categories'),
    largest: document.getElementById('largest-files'),
    canvas: document.getElementById('fileChart'),
};

let chart = null;

els.button.addEventListener('click', () => {
    // The change event does not fire until the browser has walked the entire
    // tree, which can take many seconds on a large folder. Say so up front,
    // otherwise the page looks frozen for that whole stretch.
    setBusy(true, 'Waiting for your folder… large folders take a while to open.');
    els.input.click();
});

// If the picker is dismissed without choosing anything, no change event
// arrives -- this clears the "waiting" message once focus comes back.
window.addEventListener('focus', () => {
    if (els.button.disabled && !els.input.files?.length) setBusy(false);
});

els.input.addEventListener('change', handleFolderPicked);

async function handleFolderPicked(event) {
    const picked = event.target.files || [];
    if (picked.length === 0) {
        setBusy(false);
        return;
    }

    showError(null);
    const started = performance.now();

    try {
        const payload = await buildPayload(picked);
        const readMs = performance.now() - started;

        setBusy(true, `Analyzing ${payload.files.length.toLocaleString()} files…`);
        const sentAt = performance.now();

        const response = await fetch('/api/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            throw new Error(`Server responded ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        const serverMs = performance.now() - sentAt;

        render(data);
        // Show where the time went, so a slow scan is explainable rather than
        // just mysterious.
        els.status.textContent =
            `Done — read ${Math.round(readMs)} ms · analyzed ${Math.round(serverMs)} ms`;
    } catch (err) {
        showError(`⚠️ ${err.message}`);
        els.results.hidden = true;
        els.status.textContent = '';
    } finally {
        els.button.disabled = false;
        // Let the same folder be re-picked, which otherwise fires no change event.
        els.input.value = '';
    }
}

async function buildPayload(picked) {
    // webkitRelativePath is "<folder>/<sub>/<file>" and always uses forward
    // slashes, on every OS. That is why this app needs no path translation.
    const folder = (picked[0].webkitRelativePath || '').split('/')[0] || 'Selected folder';
    const total = Math.min(picked.length, MAX_FILES);
    const files = [];

    // Built in chunks with a yield between them. Done in one pass this blocks
    // the main thread on a big folder, which freezes the progress text at the
    // exact moment the user most wants to see it moving.
    for (let i = 0; i < total; i++) {
        const file = picked[i];
        files.push({
            name: file.name,
            size: file.size,
            modified_ms: file.lastModified || 0,
            relpath: file.webkitRelativePath || file.name,
        });

        if (i % 5000 === 4999) {
            setBusy(true, `Reading… ${files.length.toLocaleString()} of ${total.toLocaleString()} files`);
            await new Promise((resolve) => setTimeout(resolve, 0));
        }
    }

    return { folder, files, truncated: picked.length > MAX_FILES };
}

function render(data) {
    els.folder.textContent = data.folder;
    els.files.textContent = data.total_files.toLocaleString();
    els.size.textContent = `${data.total_size_mb.toLocaleString()} MB`;

    if (data.truncated) {
        els.truncated.textContent =
            `⚠️ This folder holds more than ${MAX_FILES.toLocaleString()} files. ` +
            `Only the first ${data.total_files.toLocaleString()} were analyzed, ` +
            `so the totals above are a floor, not the full picture.`;
    }
    els.truncated.hidden = !data.truncated;

    renderCategories(data.overview);
    renderLargestFiles(data.largest_files);
    renderChart(data.overview);

    els.results.hidden = false;
}

function renderCategories(overview) {
    els.categories.replaceChildren(...overview.map((entry) => {
        const block = document.createElement('div');
        block.className = 'category-block';

        const heading = document.createElement('h3');
        heading.textContent = `${entry.category} (${entry.count.toLocaleString()} files)`;

        const meta = document.createElement('p');
        meta.className = 'meta';
        meta.textContent = `${entry.size_mb.toLocaleString()} MB · ${entry.percent}% of total`;

        const list = document.createElement('ul');
        list.replaceChildren(...entry.files.map((file) => {
            const item = document.createElement('li');
            item.textContent = `${file.name} — ${file.size_kb.toLocaleString()} KB`;
            item.title = file.path;
            return item;
        }));

        block.append(heading, meta, list);
        return block;
    }));
}

function renderLargestFiles(files) {
    els.largest.replaceChildren(...files.map((file) => {
        const row = document.createElement('tr');
        for (const value of [
            file.name,
            file.size_kb.toLocaleString(),
            formatDate(file.modified_ms),
            file.path,
        ]) {
            const cell = document.createElement('td');
            cell.textContent = value;
            row.append(cell);
        }
        return row;
    }));
}

function renderChart(overview) {
    // Chart.js keeps a registry per canvas, so an old chart must be torn down
    // before a second scan draws over the same element.
    if (chart) chart.destroy();

    chart = new Chart(els.canvas.getContext('2d'), {
        type: 'pie',
        data: {
            labels: overview.map((entry) => entry.category),
            datasets: [{
                data: overview.map((entry) => entry.size_mb),
                backgroundColor: overview.map((_, i) => COLORS[i % COLORS.length]),
                borderColor: '#000',
                borderWidth: 1.2,
            }],
        },
        options: {
            responsive: true,
            plugins: {
                legend: { position: 'bottom', labels: { color: '#000', font: { size: 13 } } },
                title: {
                    display: true,
                    text: '💾 Storage Breakdown by File Type',
                    color: '#000',
                    font: { family: 'Times New Roman', size: 15 },
                },
                tooltip: {
                    callbacks: {
                        label: (ctx) => {
                            const entry = overview[ctx.dataIndex];
                            return ` ${entry.category}: ${entry.size_mb} MB (${entry.percent}%)`;
                        },
                    },
                },
            },
        },
    });
}

function formatDate(ms) {
    if (!ms) return '—';
    return new Date(ms).toLocaleString();
}

function setBusy(busy, message = '') {
    els.button.disabled = busy;
    els.status.textContent = message;
}

function showError(message) {
    els.error.textContent = message || '';
    els.error.hidden = !message;
}
