#!/usr/bin/env python3
"""Serve the preserved runtime locally without installing dependencies."""
from __future__ import annotations
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--port", type=int, default=8000)
    args = p.parse_args()
    server = ThreadingHTTPServer(
        ("127.0.0.1", args.port),
        partial(SimpleHTTPRequestHandler, directory=str(ROOT))
    )
    print(f"Serving unchanged Candidate125 runtime at http://127.0.0.1:{args.port}/")
    print("Ctrl+C to stop. OCR model binaries may still be loaded from external hosts.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
