"""Development server for the twin.

    python tools/serve.py [port]        (default 8000, binds 127.0.0.1)

Same as `python -m http.server`, with two differences that matter while the code changes:

- Every response carries `Cache-Control: no-cache`, so the browser revalidates each file
  (cheap 304s) instead of mixing fresh and heuristically cached scripts.
- `/sw.js` answers with a self-destroying service worker. The twin registers none, but a
  worker left on this origin by another localhost project keeps intercepting requests and
  serving its cached copies. Browsers re-fetch `/sw.js` to update such a worker; this
  replacement unregisters it and reloads the pages it controlled.
"""
import functools
import http.server
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

KILL_SWITCH = b"""// Retire any service worker on this origin: the twin does not use one.
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) { return Promise.all(keys.map(function (k) { return caches.delete(k); })); })
      .then(function () { return self.registration.unregister(); })
      .then(function () { return self.clients.matchAll({ type: 'window' }); })
      .then(function (clients) { clients.forEach(function (c) { c.navigate(c.url); }); })
  );
});
"""


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, ".js": "text/javascript", ".pbf": "application/x-protobuf"}

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def do_GET(self):
        if self.path.split("?")[0] == "/sw.js":
            self.send_response(200)
            self.send_header("Content-Type", "text/javascript")
            self.send_header("Content-Length", str(len(KILL_SWITCH)))
            self.end_headers()
            self.wfile.write(KILL_SWITCH)
            return
        super().do_GET()

    def log_message(self, fmt, *args):
        sys.stderr.write("%s %s\n" % (self.log_date_time_string(), fmt % args))


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    handler = functools.partial(Handler, directory=ROOT)
    with http.server.ThreadingHTTPServer(("127.0.0.1", port), handler) as httpd:
        print(f"CASCADE 72 twin on http://localhost:{port}/  (Ctrl+C to stop)", flush=True)
        httpd.serve_forever()


if __name__ == "__main__":
    main()
