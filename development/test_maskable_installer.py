#!/usr/bin/env python3
"""Unit tests for exact, locally supplied PWA maskable ZIP integration."""
from __future__ import annotations
import json
import shutil
import struct
import tempfile
import unittest
import zipfile
import zlib
from pathlib import Path

from install_pwa_icons import ASSETS, prepare, install

ROOT=Path(__file__).resolve().parents[1]

def fake_png(w,h):
    def chunk(t,data):
        return struct.pack(">I",len(data))+t+data+struct.pack(">I",zlib.crc32(t+data)&0xffffffff)
    raw=b"".join(b"\x00"+(bytes([42,170,232,255])*w) for _ in range(h))
    return (b"\x89PNG\r\n\x1a\n"+
            chunk(b"IHDR",struct.pack(">IIBBBBB",w,h,8,6,0,0,0))+
            chunk(b"IDAT",zlib.compress(raw,6))+
            chunk(b"IEND",b""))

class MaskableInstallerTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(prefix="ocr-maskable-")
        self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name)/"repo";self.root.mkdir()
        for f in ("manifest.webmanifest","sw.js","index.html"):
            shutil.copyfile(ROOT/f,self.root/f)
        self.zip=Path(self.temp.name)/"icons.zip"
        with zipfile.ZipFile(self.zip,"w",zipfile.ZIP_DEFLATED) as z:
            for name,(w,h) in ASSETS.items():
                z.writestr("icons/"+name,fake_png(w,h))
    def test_install_exact_pngs_and_maskable_manifest(self):
        install(self.root,self.zip)
        m=json.loads((self.root/"manifest.webmanifest").read_text(encoding="utf-8"))
        i=m["icons"]
        assert len(i)==5
        masks=[x for x in i if x["purpose"]=="maskable"]
        assert sorted(x["sizes"] for x in masks)==["192x192","512x512"]
        assert all((self.root /x["src"]).is_file() for x in i)
        sw=(self.root/"sw.js").read_text(encoding="utf-8")
        assert "versioned('./icons/icon-maskable-512.png')" in sw
        assert "versioned('./icons/icon-maskable-192.png')" in sw
        assert "-step3-dev-android-roi-review-iconsv1" in sw
        html=(self.root/"index.html").read_text(encoding="utf-8")
        assert "iconset=maskable-v1" in html
    def test_invalid_icon_fails_before_modifying_anything(self):
        with zipfile.ZipFile(self.zip,"a",zipfile.ZIP_DEFLATED) as z:
            # The archive has duplicate entries: zipfile reads the final, invalid one.
            z.writestr("icons/icon-maskable-512.png",b"not-a-png")
        old=(self.root/"manifest.webmanifest").read_bytes()
        with self.assertRaises(ValueError):
            prepare(self.root,self.zip)
        assert (self.root/"manifest.webmanifest").read_bytes()==old

if __name__=="__main__":
    unittest.main()
