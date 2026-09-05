"""
Minimal demo server for the RAG project that requires no external packages.
Provides lightweight endpoints to exercise health, auth, chat and admin stats.
Run with: `python demo_server.py`
"""

from http.server import BaseHTTPRequestHandler, HTTPServer
import json
from urllib.parse import urlparse
from datetime import datetime

HOST = 'localhost'
PORT = 8001


def json_response(handler, code, obj):
    body = json.dumps(obj).encode('utf-8')
    handler.send_response(code)
    handler.send_header('Content-Type', 'application/json')
    handler.send_header('Content-Length', str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


class DemoHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        p = urlparse(self.path)
        if p.path == '/' or p.path == '/health':
            json_response(self, 200, {
                'status': 'healthy',
                'timestamp': datetime.utcnow().isoformat(),
                'components': {'api': 'running', 'demo': 'ok'}
            })
            return
        if p.path == '/admin/stats':
            json_response(self, 200, {
                'total_books': 0,
                'total_chunks': 0,
                'total_users': 1,
                'system_health': 'healthy',
                'last_updated': datetime.utcnow().isoformat()
            })
            return
        # 404
        json_response(self, 404, {'error': 'Not found'})

    def do_POST(self):
        p = urlparse(self.path)
        length = int(self.headers.get('Content-Length', 0))
        raw = self.rfile.read(length) if length else b''
        try:
            payload = json.loads(raw.decode('utf-8')) if raw else {}
        except Exception:
            payload = {}

        if p.path == '/auth/signup':
            # naive signup echo
            json_response(self, 200, {
                'user_id': 'demo_user',
                'email': payload.get('email'),
                'message': 'signup simulated'
            })
            return

        if p.path == '/auth/login':
            # return fake token
            json_response(self, 200, {
                'access_token': 'demo-token',
                'token_type': 'bearer',
                'user_id': 'demo_user'
            })
            return

        if p.path == '/chat':
            q = payload.get('query', '')
            if not q:
                json_response(self, 400, {'error': 'query required'})
                return
            # simple echo response with fake source
            resp = {
                'chat_id': 'demo_chat',
                'response': f"Echo: {q}",
                'sources': [
                    {'chunk_id': 'demo_1', 'book_name': 'Demo Book', 'book_id': 'demo_book', 'page_range': '1-2', 'relevance_score': 0.9, 'formulas_cited': []}
                ],
                'timestamp': datetime.utcnow().isoformat(),
                'token_usage': None
            }
            json_response(self, 200, resp)
            return

        # fallback
        json_response(self, 404, {'error': 'Not found'})


if __name__ == '__main__':
    server = HTTPServer((HOST, PORT), DemoHandler)
    print(f"Demo server running at http://{HOST}:{PORT}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nShutting down')
        server.server_close()
