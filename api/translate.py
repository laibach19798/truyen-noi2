# Dịch sang tiếng Việt. POST {text, engine: groq|google} → {translated, engine}.
# engine=groq cần biến môi trường GROQ_API_KEY trên Vercel; thiếu key hoặc lỗi thì dùng Google.
import json
import os
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler

GROQ_API_KEY = os.environ.get('GROQ_API_KEY', '')
GROQ_MODEL = os.environ.get('GROQ_MODEL', 'llama-3.3-70b-versatile')
SYSTEM_PROMPT = (
    'Bạn là chuyên gia dịch truyện Trung sang tiếng Việt (tiên hiệp, tu tiên, huyền huyễn). '
    'Giữ nguyên thuật ngữ Hán Việt, tên nhân vật, môn phái, địa danh; câu văn thuần Việt, mượt mà. '
    'Chỉ trả về bản dịch, không giải thích.'
)


def translate_google(text):
    query = urllib.parse.urlencode({'client': 'gtx', 'sl': 'auto', 'tl': 'vi', 'dt': 't', 'q': text[:5000]})
    req = urllib.request.Request(
        f'https://translate.googleapis.com/translate_a/single?{query}',
        headers={'User-Agent': 'Mozilla/5.0 (compatible; TruyenNoi/1.0)'},
    )
    with urllib.request.urlopen(req, timeout=15) as res:
        result = json.loads(res.read().decode())
    return ''.join(s[0] for s in (result[0] or []) if s and s[0]).strip()


def translate_groq(text):
    payload = {
        'model': GROQ_MODEL,
        'messages': [{'role': 'system', 'content': SYSTEM_PROMPT}, {'role': 'user', 'content': text[:4000]}],
        'temperature': 0.3,
        'max_tokens': 4000,
    }
    req = urllib.request.Request(
        'https://api.groq.com/openai/v1/chat/completions',
        data=json.dumps(payload).encode(),
        headers={'Authorization': f'Bearer {GROQ_API_KEY}', 'Content-Type': 'application/json'},
        method='POST',
    )
    with urllib.request.urlopen(req, timeout=30) as res:
        result = json.loads(res.read().decode())
    return result['choices'][0]['message']['content'].strip()


class handler(BaseHTTPRequestHandler):
    def _json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('X-Truyen-TTS', '1')
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_POST(self):
        try:
            length = int(self.headers.get('Content-Length') or 0)
            data = json.loads(self.rfile.read(length) or b'{}')
        except ValueError:
            return self._json(400, {'error': 'JSON không hợp lệ'})
        text = str(data.get('text') or '').strip()
        if not text:
            return self._json(400, {'error': 'Thiếu text'})
        if data.get('engine') != 'google' and GROQ_API_KEY:
            try:
                return self._json(200, {'translated': translate_groq(text), 'engine': 'groq'})
            except Exception:
                pass
        try:
            return self._json(200, {'translated': translate_google(text), 'engine': 'google'})
        except Exception as e:
            return self._json(502, {'error': str(e), 'engine': 'google'})
