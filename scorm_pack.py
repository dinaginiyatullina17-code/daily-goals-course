#!/usr/bin/env python3
"""
SCORM 1.2 packer
----------------
Place this file in any web-project folder and run:  python scorm_pack.py
Produces a ready-to-upload SCORM 1.2 ZIP next to this script.

Button in your HTML:
    <button onclick="SCORM.complete()">Завершить</button>
"""

import os
import re
import zipfile
from pathlib import Path

# ── SCORM 1.2 API (injected into index.html inside the ZIP) ───────────────
SCORM_API_JS = """\
/* SCORM 1.2 API wrapper — auto-injected by scorm_pack.py */
(function () {
  var _api = null;
  var _ready = false;

  function _findAPI(win) {
    var depth = 0;
    while (!win.API && win.parent && win.parent !== win) {
      if (++depth > 7) return null;
      win = win.parent;
    }
    return win.API || null;
  }

  function _getAPI() {
    var api = _findAPI(window);
    if (!api && window.opener) api = _findAPI(window.opener);
    return api;
  }

  var SCORM = {
    init: function () {
      _api = _getAPI();
      if (!_api) { console.warn("[SCORM] LMS API not found — running outside LMS"); return false; }
      var r = _api.LMSInitialize("");
      _ready = (r === "true" || r === true);
      if (!_ready) console.warn("[SCORM] LMSInitialize() returned false");
      return _ready;
    },

    set: function (key, value) {
      if (!_ready) return;
      _api.LMSSetValue(key, String(value));
    },

    get: function (key) {
      if (!_ready) return "";
      return _api.LMSGetValue(key);
    },

    commit: function () {
      if (!_ready) return;
      _api.LMSCommit("");
    },

    finish: function () {
      if (!_ready) return;
      _api.LMSFinish("");
      _ready = false;
    },

    /* One-call shortcut — use on your "Завершить" button */
    complete: function () {
      this.set("cmi.core.lesson_status", "passed");
      this.set("cmi.core.score.raw",     "100");
      this.set("cmi.core.score.min",     "0");
      this.set("cmi.core.score.max",     "100");
      this.commit();
      this.set("cmi.core.exit", "logout");
      this.commit();
      this.finish();
    }
  };

  window.addEventListener("load",         function () { SCORM.init(); });
  window.addEventListener("beforeunload", function () { SCORM.finish(); });

  window.SCORM = SCORM;
})();
"""

# ── imsmanifest.xml template (SCORM 1.2) ──────────────────────────────────
MANIFEST_TEMPLATE = """\
<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="{course_id}" version="1.0"
  xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2"
  xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.imsproject.org/xsd/imscp_rootv1p1p2 imscp_rootv1p1p2.xsd
                      http://www.adlnet.org/xsd/adlcp_rootv1p2 adlcp_rootv1p2.xsd">
  <metadata>
    <schema>ADL SCORM</schema>
    <schemaversion>1.2</schemaversion>
  </metadata>
  <organizations default="ORG_{course_id}">
    <organization identifier="ORG_{course_id}">
      <title>{course_title}</title>
      <item identifier="ITEM_1" identifierref="RES_1">
        <title>{course_title}</title>
      </item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="RES_1" type="webcontent"
              adlcp:scormtype="sco" href="index.html">
{file_entries}
    </resource>
  </resources>
</manifest>
"""

# ── Config ─────────────────────────────────────────────────────────────────
# Files and folders to exclude from the ZIP
SKIP_FILES = {"scorm_pack.py", "HERO-PROMPT.txt", ".DS_Store", "Thumbs.db"}
SKIP_DIRS  = {".git", ".svn", "__pycache__", "node_modules", ".vscode"}
SKIP_EXTS  = {".pyc", ".pyo", ".zip", ".py", ".docx"}
COURSE_IDENTIFIER = "kak_upravlyat_dostizheniem_celey_na_den"


def slugify(name: str) -> str:
    """Convert folder name to a stable SCORM identifier (no spaces, ASCII-safe)."""
    s = name.strip().lower()
    s = re.sub(r"[^\w]+", "_", s, flags=re.ASCII)
    s = s.strip("_") or "course"
    return s


def xml_escape(text: str) -> str:
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")


def inject_script(html_bytes: bytes) -> bytes:
    """Insert <script src="scorm_api.js"></script> before </head> (or at start)."""
    tag = b'<script src="scorm_api.js"></script>'
    lower = html_bytes.lower()

    pos = lower.find(b"</head>")
    if pos != -1:
        return html_bytes[:pos] + b"\n  " + tag + b"\n" + html_bytes[pos:]

    pos = lower.find(b"<head>")
    if pos != -1:
        end = pos + len(b"<head>")
        return html_bytes[:end] + b"\n  " + tag + html_bytes[end:]

    # No <head> at all — prepend
    return tag + b"\n" + html_bytes


def collect_files(base: Path) -> list[tuple[str, Path]]:
    """Return [(arc_path, abs_path), ...] for all project files."""
    result = []
    for abs_path in sorted(base.rglob("*")):
        if abs_path.is_dir():
            continue
        rel = abs_path.relative_to(base)
        parts = rel.parts

        # Skip hidden files/dirs and excluded names
        if any(p.startswith(".") for p in parts):
            continue
        if any(p in SKIP_DIRS for p in parts[:-1]):  # intermediate dirs
            continue
        if rel.name in SKIP_FILES:
            continue
        if abs_path.suffix.lower() in SKIP_EXTS:
            continue

        arc = str(rel).replace("\\", "/")
        result.append((arc, abs_path))
    return result


def build():
    base = Path(__file__).parent.resolve()
    folder_name = base.name
    course_id    = COURSE_IDENTIFIER
    course_title = folder_name
    zip_path     = base / "course.zip"

    # Sanity check
    index_html = base / "index.html"
    if not index_html.exists():
        raise FileNotFoundError(
            "index.html not found in this folder.\n"
            "Place scorm_pack.py in the root of your web project."
        )

    files = collect_files(base)

    # Корпоративные шрифты остаются в общей папке reusable, но при упаковке
    # попадают внутрь автономного SCORM-пакета.
    shared_fonts = base.parent / "reusable" / "Fonts"
    for font_name in ("FLAME-REGULAR.OTF", "FLAME-BOLD.OTF"):
        font_path = shared_fonts / font_name
        if font_path.exists():
            files.append((f"Fonts/{font_name}", font_path))

    # All arc names for <file href="..."/> entries (includes scorm_api.js)
    all_arcs = sorted({arc for arc, _ in files} | {"scorm_api.js"})
    file_entries = "\n".join(f'      <file href="{arc}"/>' for arc in all_arcs)

    manifest = MANIFEST_TEMPLATE.format(
        course_id    = course_id,
        course_title = xml_escape(course_title),
        file_entries = file_entries,
    )

    existed = zip_path.exists()
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("imsmanifest.xml", manifest.encode("utf-8"))
        zf.writestr("scorm_api.js",    SCORM_API_JS.encode("utf-8"))

        for arc_name, abs_path in files:
            data = abs_path.read_bytes()
            if arc_name == "index.html":
                data = inject_script(data)
            zf.writestr(arc_name, data)

    action = "Repacked" if existed else "Packed"
    print(f"[SCORM] {action}: {zip_path.name}")
    print(f"        Course ID : {course_id}")
    print(f"        Title     : {course_title}")
    print(f"        Files     : {len(files)} source + imsmanifest.xml + scorm_api.js")


if __name__ == "__main__":
    build()
