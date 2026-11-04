#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
국가데이터처 SGIS 부스 모바일 이벤트 로컬 백엔드 서버
- 순수 Python 3 표준 라이브러리 (추가 패키지 설치 필요 없음)
- SQLite3 기반 설문 응답 로컬 영구 저장
- 실시간 응답 집계 및 CSV / JSON 다운로드 기능 제공
- 부스 운영자용 관리자 대시보드 (/admin) 기본 내장
"""

import os
import sys
import json
import csv
import io
import sqlite3
import urllib.parse
from datetime import datetime
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

# 정답 사전 정의
CORRECT_ANSWERS = {
    "q1": "SGIS (통계지리정보서비스)",
    "q2": "업종통계지도",
    "q3": "일자리맵",
    "q4": "자료제공 서비스"
}

def resolve_base_dir():
    """웹 리소스가 위치한 기본 디렉터리를 동적으로 탐색합니다."""
    current_dir = os.path.dirname(os.path.abspath(__file__))
    if os.path.exists(os.path.join(current_dir, "index.html")):
        return current_dir
    pkg_sub = os.path.join(current_dir, "SGIS_모바일_이벤트_웹페이지_패키지")
    if os.path.isdir(pkg_sub) and os.path.exists(os.path.join(pkg_sub, "index.html")):
        return pkg_sub
    return current_dir

BASE_DIR = resolve_base_dir()
DB_FILE = os.path.join(BASE_DIR, "quiz_responses.db")

def init_db():
    """SQLite 데이터베이스 및 응답 저장 테이블을 초기화합니다."""
    with sqlite3.connect(DB_FILE) as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS quiz_responses (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                created_at TEXT NOT NULL,
                q1_answer TEXT NOT NULL,
                is_q1_correct INTEGER NOT NULL,
                q2_answer TEXT NOT NULL,
                is_q2_correct INTEGER NOT NULL,
                q3_answer TEXT NOT NULL,
                is_q3_correct INTEGER NOT NULL,
                q4_answer TEXT NOT NULL,
                is_q4_correct INTEGER NOT NULL,
                q5_feedback TEXT NOT NULL,
                score INTEGER NOT NULL,
                user_agent TEXT,
                ip_address TEXT
            )
        """)
        conn.commit()

class SGISServerHandler(SimpleHTTPRequestHandler):
    """SGIS 부스 이벤트 웹서버 및 로컬 API 핸들러"""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=BASE_DIR, **kwargs)

    def end_headers(self):
        # 모든 요청에 대해 CORS 및 보안 헤더 추가
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(HTTPStatus.NO_CONTENT)
        self.end_headers()

    def do_HEAD(self):
        self.do_GET()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        if path in ("/admin", "/admin/"):
            # 관리자 대시보드 제공
            self.send_response(HTTPStatus.FOUND)
            self.send_header("Location", "/admin.html")
            self.end_headers()
            return

        if path == "/api/responses":
            self.handle_get_responses()
            return

        if path == "/api/export/csv":
            self.handle_export_csv()
            return

        if path == "/api/export/json":
            self.handle_export_json()
            return

        if path == "/api/stats":
            self.handle_get_stats()
            return

        # 기본 정적 파일 처리 (index.html, guide.html, admin.html 등)
        super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/submit":
            self.handle_submit()
            return

        self.send_error(HTTPStatus.NOT_FOUND, "요청한 API 엔드포인트를 찾을 수 없습니다.")

    def handle_submit(self):
        """참여자 퀴즈 응답 제출 처리 및 DB 저장"""
        try:
            content_length = int(self.headers.get("Content-Length", 0))
            if content_length <= 0:
                self.send_json_response({"success": False, "error": "요청 본문이 비어있습니다."}, status=400)
                return

            body = self.rfile.read(content_length).decode("utf-8")
            data = json.loads(body)

            q1 = str(data.get("q1", "")).strip()
            q2 = str(data.get("q2", "")).strip()
            q3 = str(data.get("q3", "")).strip()
            q4 = str(data.get("q4", "")).strip()
            q5 = str(data.get("q5", "")).strip()

            if not all([q1, q2, q3, q4, q5]):
                self.send_json_response({
                    "success": False,
                    "error": "모든 문항(Q1~Q4 객관식 및 Q5 소감)에 답변을 작성해 주세요."
                }, status=400)
                return

            # 채점 진행
            is_q1 = 1 if q1 == CORRECT_ANSWERS["q1"] else 0
            is_q2 = 1 if q2 == CORRECT_ANSWERS["q2"] else 0
            is_q3 = 1 if q3 == CORRECT_ANSWERS["q3"] else 0
            is_q4 = 1 if q4 == CORRECT_ANSWERS["q4"] else 0
            score = is_q1 + is_q2 + is_q3 + is_q4

            now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            user_agent = self.headers.get("User-Agent", "")
            ip_addr = self.client_address[0] if self.client_address else "127.0.0.1"

            with sqlite3.connect(DB_FILE) as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    INSERT INTO quiz_responses (
                        created_at, q1_answer, is_q1_correct,
                        q2_answer, is_q2_correct, q3_answer, is_q3_correct,
                        q4_answer, is_q4_correct, q5_feedback, score,
                        user_agent, ip_address
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (now_str, q1, is_q1, q2, is_q2, q3, is_q3, q4, is_q4, q5, score, user_agent, ip_addr))
                row_id = cursor.lastrowid
                conn.commit()

            self.send_json_response({
                "success": True,
                "id": row_id,
                "score": score,
                "total": 4,
                "created_at": now_str,
                "message": "퀴즈 응답이 정상적으로 제출 및 저장되었습니다!"
            })

        except Exception as e:
            self.send_json_response({"success": False, "error": f"서버 오류: {str(e)}"}, status=500)

    def handle_get_responses(self):
        """전체 응답 목록 및 통계 반환"""
        try:
            with sqlite3.connect(DB_FILE) as conn:
                conn.row_factory = sqlite3.Row
                cur = conn.cursor()
                cur.execute("SELECT * FROM quiz_responses ORDER BY id DESC")
                rows = [dict(row) for row in cur.fetchall()]

            stats = self.calculate_stats(rows)
            self.send_json_response({
                "success": True,
                "count": len(rows),
                "stats": stats,
                "responses": rows
            })
        except Exception as e:
            self.send_json_response({"success": False, "error": str(e)}, status=500)

    def handle_get_stats(self):
        """간단 통계 반환"""
        try:
            with sqlite3.connect(DB_FILE) as conn:
                conn.row_factory = sqlite3.Row
                cur = conn.cursor()
                cur.execute("SELECT * FROM quiz_responses")
                rows = [dict(row) for row in cur.fetchall()]
            stats = self.calculate_stats(rows)
            self.send_json_response({"success": True, "stats": stats})
        except Exception as e:
            self.send_json_response({"success": False, "error": str(e)}, status=500)

    def calculate_stats(self, rows):
        total = len(rows)
        if total == 0:
            return {
                "total_responses": 0,
                "perfect_scores": 0,
                "avg_score": 0.0,
                "q1_accuracy": 0.0,
                "q2_accuracy": 0.0,
                "q3_accuracy": 0.0,
                "q4_accuracy": 0.0
            }

        q1_corr = sum(r["is_q1_correct"] for r in rows)
        q2_corr = sum(r["is_q2_correct"] for r in rows)
        q3_corr = sum(r["is_q3_correct"] for r in rows)
        q4_corr = sum(r["is_q4_correct"] for r in rows)
        perfect = sum(1 for r in rows if r["score"] == 4)
        avg_score = round(sum(r["score"] for r in rows) / total, 2)

        return {
            "total_responses": total,
            "perfect_scores": perfect,
            "avg_score": avg_score,
            "q1_accuracy": round(q1_corr / total * 100, 1),
            "q2_accuracy": round(q2_corr / total * 100, 1),
            "q3_accuracy": round(q3_corr / total * 100, 1),
            "q4_accuracy": round(q4_corr / total * 100, 1)
        }

    def handle_export_csv(self):
        """Excel에서 바로 깨짐 없이 열리는 UTF-8 BOM 인코딩 CSV 파일 다운로드"""
        try:
            with sqlite3.connect(DB_FILE) as conn:
                conn.row_factory = sqlite3.Row
                cur = conn.cursor()
                cur.execute("SELECT * FROM quiz_responses ORDER BY id ASC")
                rows = cur.fetchall()

            output = io.StringIO()
            # UTF-8 BOM 표기 (\ufeff)
            output.write("\ufeff")

            writer = csv.writer(output)
            headers = [
                "접수번호", "제출일시",
                "1번 응답(SGIS명칭)", "1번 정답여부",
                "2번 응답(상권지도)", "2번 정답여부",
                "3번 응답(일자리맵)", "3번 정답여부",
                "4번 응답(자료제공)", "4번 정답여부",
                "5번 방문소감 및 바라는 점",
                "총점(4점 만점)", "IP주소", "브라우저환경"
            ]
            writer.writerow(headers)

            for r in rows:
                writer.writerow([
                    r["id"],
                    r["created_at"],
                    r["q1_answer"],
                    "정답" if r["is_q1_correct"] else "오답",
                    r["q2_answer"],
                    "정답" if r["is_q2_correct"] else "오답",
                    r["q3_answer"],
                    "정답" if r["is_q3_correct"] else "오답",
                    r["q4_answer"],
                    "정답" if r["is_q4_correct"] else "오답",
                    r["q5_feedback"],
                    r["score"],
                    r["ip_address"],
                    r["user_agent"]
                ])

            csv_bytes = output.getvalue().encode("utf-8")
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"sgis_booth_quiz_responses_{timestamp}.csv"

            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", "text/csv; charset=utf-8")
            self.send_header("Content-Disposition", f'attachment; filename="{filename}"')
            self.send_header("Content-Length", str(len(csv_bytes)))
            self.end_headers()
            self.wfile.write(csv_bytes)

        except Exception as e:
            self.send_json_response({"success": False, "error": str(e)}, status=500)

    def handle_export_json(self):
        """전체 응답 JSON 다운로드"""
        try:
            with sqlite3.connect(DB_FILE) as conn:
                conn.row_factory = sqlite3.Row
                cur = conn.cursor()
                cur.execute("SELECT * FROM quiz_responses ORDER BY id ASC")
                rows = [dict(r) for r in cur.fetchall()]

            data = {
                "exported_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                "total_count": len(rows),
                "stats": self.calculate_stats(rows),
                "responses": rows
            }
            json_bytes = json.dumps(data, ensure_ascii=False, indent=2).encode("utf-8")
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"sgis_booth_quiz_responses_{timestamp}.json"

            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Disposition", f'attachment; filename="{filename}"')
            self.send_header("Content-Length", str(len(json_bytes)))
            self.end_headers()
            self.wfile.write(json_bytes)
        except Exception as e:
            self.send_json_response({"success": False, "error": str(e)}, status=500)

    def send_json_response(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

def run(port=8080):
    init_db()
    server_address = ("", port)
    httpd = ThreadingHTTPServer(server_address, SGISServerHandler)
    print("=" * 64)
    print(f"✨ SGIS 모바일 이벤트 로컬 백엔드 서버가 시작되었습니다.")
    print(f"📂 웹 루트 경로: {BASE_DIR}")
    print(f"💾 SQLite DB 경로: {DB_FILE}")
    print(f"🌐 부스 참여자 페이지: http://localhost:{port}/")
    print(f"📊 관리자 및 CSV 다운로드: http://localhost:{port}/admin.html")
    print("=" * 64)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n서버를 종료합니다.")
        httpd.server_close()

if __name__ == "__main__":
    port = 8080
    if len(sys.argv) > 1:
        try:
            port = int(sys.argv[1])
        except ValueError:
            pass
    run(port)
