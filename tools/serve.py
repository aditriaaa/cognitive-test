# serve.py — local web server for testing the site on this computer.
#
#   python3 tools/serve.py        then open http://localhost:8000/
#
# Same as "python3 -m http.server 8000", except it tells the browser NEVER to
# keep old copies of the files. Without that, Safari often keeps running old
# JavaScript after a file changes, so a fix seems not to work.
# For local testing only; the real site is hosted elsewhere.
import http.server
import os

class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))  # serve the project folder
print("Serving the project at http://localhost:8000/ (Ctrl+C to stop)")
http.server.ThreadingHTTPServer(("", 8000), NoCacheHandler).serve_forever()
