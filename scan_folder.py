import os
from datetime import datetime

def wsl_to_windows_path(wsl_path: str) -> str:
    """Convert WSL path (/mnt/c/Users/...) → Windows path (C:\\Users\\...)"""
    if wsl_path.startswith("/mnt/"):
        parts = wsl_path.split("/")
        if len(parts) > 3:
            drive = parts[2].upper()
            rest = "\\".join(parts[3:])
            return f"{drive}:\\{rest}"
    return wsl_path.replace("/", "\\")

def scan_folder(path, max_depth=2, limit=5000):
    """Scan folder, return detailed overview + category-wise file breakdown."""
    files_data = []
    total_size = 0
    total_files = 0

    # Define categories and their extensions
    categories = {
        "Images": [".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp"],
        "Videos": [".mp4", ".mkv", ".avi", ".mov", ".wmv", ".flv"],
        "Documents": [".pdf", ".docx", ".txt", ".pptx", ".xls", ".xlsx"],
        "Audio": [".mp3", ".wav", ".flac", ".aac", ".ogg"],
        "Archives": [".zip", ".rar", ".7z", ".tar", ".gz"],
        "Others": []
    }

    # Will store categorized files
    categorized_files = {cat: [] for cat in categories}

    # Recursive scan
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
                            file_ext = os.path.splitext(entry.name.lower())[1]

                            file_info = {
                                "name": entry.name,
                                "path": win_path,
                                "size_kb": f"{size / 1024:.2f}",
                                "modified": mtime.strftime("%Y-%m-%d %H:%M:%S"),
                                "size_bytes": size
                            }

                            files_data.append(file_info)
                            total_files += 1
                            total_size += size

                            # categorize
                            found = False
                            for cat, exts in categories.items():
                                if file_ext in exts:
                                    categorized_files[cat].append(file_info)
                                    found = True
                                    break
                            if not found:
                                categorized_files["Others"].append(file_info)

                        elif entry.is_dir(follow_symlinks=False):
                            _scan(entry.path, depth + 1)
                    except (PermissionError, FileNotFoundError):
                        continue
        except (PermissionError, FileNotFoundError):
            pass

    # start scan
    if not os.path.exists(path):
        return {"error": f"Path not found: {path}"}

    _scan(path)

    # sort everything by size
    files_data.sort(key=lambda f: float(f["size_kb"]), reverse=True)
    for cat in categorized_files:
        categorized_files[cat].sort(key=lambda f: float(f["size_kb"]), reverse=True)

    # build overview for pie chart
    overview = []
    for cat, file_list in categorized_files.items():
        cat_size = sum(f["size_bytes"] for f in file_list)
        percent = (cat_size / total_size * 100) if total_size > 0 else 0
        overview.append({
            "category": cat,
            "count": len(file_list),
            "size_mb": round(cat_size / (1024 * 1024), 2),
            "percent": round(percent, 2)
        })

    return {
        "total_files": total_files,
        "total_size_mb": f"{total_size / (1024 * 1024):.2f}",
        "scanned_path": wsl_to_windows_path(path),
        "files": files_data,
        "overview": overview,
        "categorized_files": categorized_files,
        "limit_reached": len(files_data) >= limit
    }
