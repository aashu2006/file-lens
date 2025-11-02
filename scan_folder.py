import os
from datetime import datetime

# 🪟 Convert WSL → Windows path
def wsl_to_windows_path(wsl_path: str) -> str:
    if wsl_path.startswith("/mnt/"):
        parts = wsl_path.split("/")
        if len(parts) > 3:
            drive = parts[2].upper()
            rest = "\\".join(parts[3:])
            return f"{drive}:\\{rest}"
    return wsl_path.replace("/", "\\")


def scan_folder(path, max_depth=2, limit=5000):
    """Scan folder, returning details + categorized overview for visualization."""
    files_data = []
    total_size = 0
    total_files = 0

    # Category structure
    categories = {
        "Images": {"exts": [".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp"], "count": 0, "size": 0},
        "Videos": {"exts": [".mp4", ".mkv", ".avi", ".mov", ".wmv", ".flv"], "count": 0, "size": 0},
        "Documents": {"exts": [".pdf", ".docx", ".txt", ".pptx", ".xls", ".xlsx"], "count": 0, "size": 0},
        "Audio": {"exts": [".mp3", ".wav", ".flac", ".aac", ".ogg"], "count": 0, "size": 0},
        "Archives": {"exts": [".zip", ".rar", ".7z", ".tar", ".gz"], "count": 0, "size": 0},
        "Others": {"exts": [], "count": 0, "size": 0}
    }

    def _scan(current_path, depth=0):
        nonlocal total_files, total_size
        if depth > max_depth or len(files_data) >= limit:
            return

        try:
            with os.scandir(current_path) as entries:
                for entry in entries:
                    if len(files_data) >= limit:
                        return

                    try:
                        if entry.is_file(follow_symlinks=False):
                            stat_info = entry.stat(follow_symlinks=False)
                            size = stat_info.st_size
                            mtime = datetime.fromtimestamp(stat_info.st_mtime)
                            win_path = wsl_to_windows_path(entry.path)

                            files_data.append({
                                "name": entry.name,
                                "path": win_path,
                                "size_kb": f"{size / 1024:.2f}",
                                "modified": mtime.strftime("%Y-%m-%d %H:%M:%S")
                            })

                            total_files += 1
                            total_size += size

                            # Categorize file
                            ext = os.path.splitext(entry.name.lower())[1]
                            added = False
                            for cat, info in categories.items():
                                if ext in info["exts"]:
                                    info["count"] += 1
                                    info["size"] += size
                                    added = True
                                    break
                            if not added:
                                categories["Others"]["count"] += 1
                                categories["Others"]["size"] += size

                        elif entry.is_dir(follow_symlinks=False):
                            _scan(entry.path, depth + 1)

                    except (PermissionError, FileNotFoundError):
                        continue
        except (PermissionError, FileNotFoundError):
            pass

    # ❌ Invalid path check
    if not os.path.exists(path):
        return {"error": f"Path not found: {path}"}

    # 🚀 Start scanning
    _scan(path)

    # Sort by size (descending)
    files_data.sort(key=lambda f: float(f["size_kb"]), reverse=True)

    # Compute category percentages
    overview = []
    for cat, info in categories.items():
        percent = (info["size"] / total_size * 100) if total_size > 0 else 0
        overview.append({
            "category": cat,
            "count": info["count"],
            "size_mb": round(info["size"] / (1024 * 1024), 2),
            "percent": round(percent, 2)
        })

    return {
        "total_files": total_files,
        "total_size_mb": f"{total_size / (1024 * 1024):.2f}",
        "scanned_path": wsl_to_windows_path(path),
        "files": files_data,
        "overview": overview,
        "limit_reached": len(files_data) >= limit
    }
