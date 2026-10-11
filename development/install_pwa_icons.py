#!/usr/bin/env python3
"""Install the user's exact maskable PWA icon ZIP into a working OCR checkout.

This is an explicit developer action, not part of the OCR runtime. It never
downloads external icons or replaces user-supplied PNG bytes. Install before
committing/deploying the branch to GitHub Pages.
"""
from __future__ import annotations
import argparse
import json
import os
import re
import struct
import tempfile
import zipfile
from pathlib import Path

ASSETS={
  "icon-192.png":(192,192),
  "icon-512.png":(512,512),
  "icon-maskable-192.png":(192,192),
  "icon-maskable-512.png":(512,512),
  "apple-touch-icon.png":(180,180),
  "favicon-32.png":(32,32),
}

def ensure_png(name,content):
    if len(content)<26 or not content.startswith(b"\x89PNG\r\n\x1a\n"):
        raise ValueError(f"Not a PNG: {name}")
    wh=struct.unpack(">II",content[16:24])
    if wh!=ASSETS[name]:raise ValueError(f"Unexpected PNG dimensions {name}: {wh}")
    if len(content)>800_000:raise ValueError(f"PNG too large: {name}")

def prepare(root:Path, icon_zip:Path):
    with zipfile.ZipFile(icon_zip) as src:
        names=set(src.namelist())
        expected={"icons/"+name for name in ASSETS}
        if not expected.issubset(names):
            raise ValueError(f"Missing icon assets: {sorted(expected-names)}")
        assets={}
        for name in ASSETS:
            data=src.read("icons/"+name)
            ensure_png(name,data)
            assets[name]=data
    manifest_path=root/"manifest.webmanifest"
    sw_path=root/"sw.js"
    html_path=root/"index.html"
    if any(not p.is_file() for p in [manifest_path,sw_path,html_path]):
        raise ValueError("Run in STEP3 OCR checkout with manifest, sw.js, and index.html")
    manifest=json.loads(manifest_path.read_text(encoding="utf-8"))
    def ico(name,size,purpose):
        return {"src":"./icons/"+name,"sizes":size,
                "type":"image/png","purpose":purpose}
    manifest["icons"]=[
      ico("icon-192.png","192x192","any"),
      ico("icon-maskable-192.png","192x192","maskable"),
      ico("icon-512.png","512x512","any"),
      ico("icon-maskable-512.png","512x512","maskable"),
      ico("apple-touch-icon.png","180x180","any"),
    ]
    manifest["theme_color"]="#2f6ce8"
    sw=sw_path.read_text(encoding="utf-8")
    if "versioned('./android_roi.js')" not in sw:
        raise ValueError("STEP3 Service Worker missing (refuse unsafe partial install)")
    if "versioned('./icons/icon-maskable-192.png')" not in sw:
        anchor="  versioned('./icons/icon-512.png'),"
        if anchor not in sw:raise ValueError("Cannot find icon pre-cache insertion point")
        sw=sw.replace(anchor,anchor+
            "\n  versioned('./icons/icon-maskable-192.png'),"+
            "\n  versioned('./icons/icon-maskable-512.png'),")
    if "-step3-dev-android-roi-review-iconsv1" not in sw:
        if "-step3-dev-android-roi-review" not in sw:
            raise ValueError("Unexpected Service Worker version")
        sw=sw.replace("-step3-dev-android-roi-review",
            "-step3-dev-android-roi-review-iconsv1")
    html=html_path.read_text(encoding="utf-8")
    for icon_name in ["favicon-32.png","apple-touch-icon.png"]:
        pattern=r'(\./icons/'+re.escape(icon_name)+r'\?release=[^"\'\s]+)'
        html=re.sub(pattern,lambda m:m.group(1).split("&iconset=")[0]+"&iconset=maskable-v1",html)
    return assets,manifest,sw,html

def install(root:Path, icon_zip:Path):
    assets,manifest,sw,html=prepare(root,icon_zip)
    (root/"icons").mkdir(parents=True,exist_ok=True)
    # Validate every member before touching any existing icon.
    for name,data in assets.items():
        (root/"icons"/name).write_bytes(data)
    (root/"manifest.webmanifest").write_text(
        json.dumps(manifest,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    (root/"sw.js").write_text(sw,encoding="utf-8")
    (root/"index.html").write_text(html,encoding="utf-8")
    print("Installed six exact PNG assets and maskable PWA manifest.")
    print("Deploy the matching icons, manifest and SW together. Android Pixel may")
    print("require closing Chrome / reinstalling an already-installed PWA.")

if __name__=="__main__":
    parser=argparse.ArgumentParser()
    parser.add_argument("zip_file",type=Path,help="icons-pwa-maskable-set.zip")
    parser.add_argument("--root",type=Path,default=Path(__file__).resolve().parents[1])
    args=parser.parse_args()
    install(args.root.resolve(),args.zip_file.resolve())
