from flask import Flask, render_template, request
from scan_folder import scan_folder
import os

app = Flask(__name__)

DEFAULT_PATH = r"C:\Users\Akshat Patil\OneDrive\Desktop"


def windows_to_wsl_path(win_path: str) -> str:
    """Convert Windows path (C:\\Users...) → WSL path (/mnt/c/Users/...)"""
    if not win_path:
        return ""
    win_path = win_path.strip().replace("\\", "/")
    if ":" in win_path:
        drive, rest = win_path.split(":", 1)
        return f"/mnt/{drive.lower()}/{rest.lstrip('/')}"
    return win_path


@app.route("/", methods=["GET", "POST"])
def index():
    path = DEFAULT_PATH
    results = None
    error = None

    if request.method == "POST":
        input_path = request.form.get("path", DEFAULT_PATH).strip()
        wsl_path = windows_to_wsl_path(input_path)

        print(f"🧭 Converted Windows path → {wsl_path}")

        if os.path.exists(wsl_path):
            try:
                results = scan_folder(wsl_path)
                results["scanned_path"] = input_path
            except Exception as e:
                error = f"⚠️ Error while scanning: {e}"
        else:
            error = f"❌ Folder not found: {input_path}"

        path = input_path  

    return render_template("index.html", results=results, path=path, error=error)


if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5000)
