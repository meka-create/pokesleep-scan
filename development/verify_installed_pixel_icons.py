#!/usr/bin/env python3
"""STEP3 Pixel maskable pack gate: original PNG bytes, manifest, offline shell.

User-supplied icon PNGs are opaque RGB at maskable sizes; compare SHA-256
against the user-provided ZIP, not a reconstructed rendering.
"""
import hashlib
import json
import re
import struct
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
EXPECTED={
 "apple-touch-icon.png": (180,180,"878b81f376b474f19e61ab86724934c00e8cb3058517b65dc0872aabd22e0688"),
 "favicon-32.png": (32,32,"87c006c09b99b58864777e8aa566fc4fed066c5423191c476835357ac97b1760"),
 "icon-192.png": (192,192,"75550a30c39818f43cd39157544bb1d64d8bd1d77e5a88067c270f127d0d37e5"),
 "icon-512.png": (512,512,"dd0f157cf81aed9325f5208e54caa03626c29854ae69751e511667951215c418"),
 "icon-maskable-192.png": (192,192,"d80de0922bb8be973cce16a0cb1b8d6a2119b9848dec996a271132de65ff29d5"),
 "icon-maskable-512.png": (512,512,"fafc1a3be39aee764127d29eeb2d8cbffdaf0f81abd7ab5eb77291c3a37ae8f7")
}
def assert_pixels(name,width,height,sha):
    data=(ROOT/"icons"/name).read_bytes()
    assert hashlib.sha256(data).hexdigest()==sha, "Icon differs from user's original: "+name
    assert data.startswith(b"\x89PNG\r\n\x1a\n") and data[12:16]==b"IHDR",name
    assert struct.unpack(">II",data[16:24])==(width,height),name
    if "maskable" in name:
        assert data[25]==2, "Maskable must be opaque RGB PNG: "+name
        assert b"tRNS" not in data, "Maskable PNG unexpectedly has transparency: "+name
def run():
    for name,(w,h,digest) in EXPECTED.items():
        assert_pixels(name,w,h,digest)
    manifest=json.loads((ROOT/"manifest.webmanifest").read_text(encoding="utf-8"))
    icons=manifest["icons"]
    assert len(icons)==5
    for size in (192,512):
        name=f"icon-maskable-{size}.png"
        assert any(i.get("src")==f"./icons/{name}" and
                   i.get("sizes")==f"{size}x{size}" and
                   i.get("purpose")=="maskable" and
                   i.get("type")=="image/png" for i in icons),"maskable absent "+name
    sw=(ROOT/"sw.js").read_text(encoding="utf-8")
    assert "-step3-dev-android-roi-review-iconsv1" in sw, "PWA cache was not bumped"
    for size in (192,512):
        assert f"versioned('./icons/icon-maskable-{size}.png')" in sw, "SW missing maskable cache"
    html=(ROOT/"index.html").read_text(encoding="utf-8")
    assert 'rel="manifest"' in html
    for name in ("favicon-32.png","apple-touch-icon.png"):
        assert re.search(re.escape(name)+r'\?release=[^"\s]+&iconset=maskable-v1',html),name
    assert 'content="#2f6ce8"' in html
    print("PASS: 6 unmodified PNGs, 192/512 maskable manifest, PWA precache, cache version")
if __name__=="__main__":run()
