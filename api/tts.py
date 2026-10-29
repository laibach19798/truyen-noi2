# Edge TTS chạy trên Vercel (Python). POST {text, voice: female|male, rate: "+10%"} → audio/mpeg.
# Cần edge-tts >= 7.3.0: Microsoft đã bỏ kiểu token Sec-MS-GEC v1 từ 10/2026.
import asyncio
import json
import re
from http.server import BaseHTTPRequestHandler

import edge_tts

VOICES = {'female': 'vi-VN-HoaiMyNeural', 'male': 'vi-VN-NamMinhNeural'}
MAX_CHARS = 5000


def normalize_rate(rate):
    if isinstance(rate, (int, float)):
        pct = int(round((rate - 1) * 100))
        return f'+{pct}%' if pct >= 0 else f'{pct}%'
    rate = str(rate or '+0%').strip()
    if not re.fullmatch(r'[+-]?\d{1,3}%?', rate):
        return '+0%'
    if rate[0] not in '+-':
        rate = '+' + rate
    return rate if rate.endswith('%') else rate + '%'


async def synthesize(text, voice, rate):
    audio = bytearray()
    async for chunk in edge_tts.Communicate(text=text, voice=voice, rate=rate).stream():
        if chunk['type'] == 'audio':
            audio += chunk['data']
    return bytes(audio)


class handler(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Access-Control-Expose-Headers', 'X-Truyen-TTS')
        self.send_header('X-Truyen-TTS', '1')

    def _json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode()
        self.send_response(status)
        self._cors()
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_POST(self):
        try:
            length = int(self.headers.get('Content-Length') or 0)
            data = json.loads(self.rfile.read(length) or b'{}')
        except ValueError:
            return self._json(400, {'error': 'JSON không hợp lệ'})
        text = str(data.get('text') or '').strip()[:MAX_CHARS]
        if not text:
            return self._json(400, {'error': 'Thiếu text'})
        voice = VOICES.get(data.get('voice'), VOICES['female'])
        rate = normalize_rate(data.get('rate'))

        last_error = None
        for _ in range(2):
            try:
                audio = asyncio.run(synthesize(text, voice, rate))
                if audio:
                    self.send_response(200)
                    self._cors()
                    self.send_header('Content-Type', 'audio/mpeg')
                    self.send_header('Content-Length', str(len(audio)))
                    self.end_headers()
                    self.wfile.write(audio)
                    return
            except Exception as e:  # lỗi mạng / Microsoft từ chối
                last_error = e
        self._json(502, {'error': str(last_error or 'Không có âm thanh')})
