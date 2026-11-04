# 🗺️ 국가데이터처 SGIS 부스 모바일 이벤트 웹페이지 (Vercel & Local Ready)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/kmsrepo/sgis-booth-event)

> **국가데이터처 SGIS(통계지리정보서비스) 홍보부스 방문객 전용 모바일 퀴즈 설문 & 4대 통계지도 현장 체험 웹 애플리케이션**  
> 외부 네이버폼 의존성을 100% 제거하고 자체 퀴즈 시스템, SQLite/Serverless 영구 저장, 엑셀 호환 CSV/JSON 내보내기, 실시간 관리자 콘솔을 탑재했습니다.

---

## 🌟 주요 핵심 기능

### 1. ⚡ 0ms 즉각 렌더링 (외부 의존성 제로)
- 외부 CDN 네트워크 지연 및 렌더링 랙 원천 제거
- 독립 완전 내장 CSS 및 자체 `tailwind.js` 탑재로 접속 즉시 깜빡임 없이 로딩
- 초기 접속 시 답변을 선택하지 않아도 최상단에 **[⚡ 4대 통계지도 실제 주소 바로가기]** 카드가 즉각 표시되어 현장 모바일 지도를 바로 체험 가능

### 2. 📝 1단계: 로컬 퀴즈 & 설문 (네이버폼 대체)
- 기존 외부 네이버폼 설문 문항(Q1~Q4 퀴즈, Q5 방문 소감)을 100% 로컬 반응형 웹 폼으로 구현
- 선택 즉시 시각적 피드백 제공 및 실시간 진행률 게이지(0~5 완료)
- 제출 즉시 자동 채점 및 접수번호(#ID) 발급

### 3. 🗺️ 2단계: SGIS 4대 통계지도 실제 모바일 서비스 주소 직행
일반 포털 메인 홈이 아닌, **실제 동작하는 4대 모바일 서비스 상세 주소**로 1클릭 연결:
1. **대화형 통계지도 (01)**: 국화공원 일대 상세 인구·가구·주택 통계 조회  
   `https://sgis.mods.go.kr/mobile/m2020/map/current/currentMap.sgis?areaCode=|31104570|933750|1963450&type=full`
2. **생활권역 통계지도 (02)**: 도보·차량 5~15분 배후 상권 및 인구 빅데이터 분석  
   `https://sgis.mods.go.kr/mobile/m2021/map/catchmentareaMap.sgis?areaCode=|31104570|933750|1963450&type=full`
3. **통계주제도 (인구변화) (03)**: 고양시 대화동 및 국화공원 인구 증감 색상 시각화  
   `https://sgis.mods.go.kr/mobile/m2020/map/thematic/thematicMap.sgis?selParam=CTGR_001&stat_thema_map_id=tzvK4xEuFD20160121115806965LnKnzJtJ7F&areaCode=|31104570|933750|1963450&type=full`
4. **일자리 맵 (04)**: 워크넷·인크루트·사람인 연계 내 주변 실시간 채용 정보  
   `https://sgis.mods.go.kr/mobile/m2020/map/workroad/myNeighberhoodJobMap.sgis?areaCode=|31104|933750|1963450&type=full&zoom=5`

### 4. 📊 부스 운영자 관리자 대시보드 (`/admin`)
- 총 참여자 수, 퀴즈 만점자(4/4) 비율, 평균 정답수, 소감 수렴 현황 실시간 집계
- 문항별 정답률 시각화 프로그레스 바
- 검색 필터링이 가능한 실시간 응답 내역 테이블
- **한글 깨짐 없는 엑셀 호환 CSV(UTF-8 BOM)** 및 **JSON** 원클릭 즉시 다운로드

---

## 🚀 배포 및 실행 방법

### 방법 A: Vercel 원클릭 클라우드 배포 (Vercel Ready)
본 저장소는 `vercel.json` 및 `api/` Serverless Function이 구성되어 있어 Vercel에 리포지토리를 연결하면 설정 없이 즉시 배포됩니다.
- **Root Page**: `index.html` (참여자 모바일 화면)
- **Admin Page**: `/admin` 또는 `/admin.html` (운영자 대시보드)
- **Serverless API**:
  - `POST /api/submit` : 퀴즈 응답 제출 및 채점
  - `GET /api/responses` : 응답 목록 조회
  - `GET /api/stats` : 집계 통계
  - `GET /api/export/csv` : 엑셀 호환 CSV 다운로드
  - `GET /api/export/json` : JSON 다운로드

### 방법 B: 현장 부스 로컬 오프라인 구동 (Python 표준 라이브러리)
별도의 `pip install` 없이 순수 Python 3 표준 라이브러리만으로 동작합니다:
```bash
# 1. 로컬 서버 실행 (포트 8080)
python3 server.py 8080

# 2. 브라우저 접속
# 참여자 화면: http://localhost:8080/
# 관리자 콘솔: http://localhost:8080/admin
```

### 방법 C: Cloudflare 터널로 모바일 기기 외부 공개
```bash
# Cloudflare Tunnel 생성 및 즉시 외부 HTTPS 연결
cloudflared tunnel --url http://localhost:8080
```

---

## 📁 프로젝트 구조

```text
├── index.html                   # 메인 부스 모바일 이벤트 및 4대 서비스 페이지
├── admin.html                   # 부스 운영자 관리자 콘솔 대시보드
├── tailwind.js                  # 로컬 독립형 Tailwind 런타임 스크립트
├── guide.html                   # 4대 통계지도 상세 안내 단독 페이지
├── server.py                    # Python 표준 라이브러리 로컬 서버 (SQLite 지원)
├── vercel.json                  # Vercel 배포 및 라우팅/리라이트 설정
├── package.json                 # Vercel 메타데이터 파일
├── .gitignore                   # Git 제외 항목 (.db, node_modules 등)
├── api/                         # Vercel Serverless Functions
│   ├── _db.js                   # 저장소 및 통계 계산 헬퍼
│   ├── submit.js                # POST /api/submit
│   ├── responses.js             # GET /api/responses
│   ├── stats.js                 # GET /api/stats
│   └── export.js                # GET /api/export (CSV / JSON)
└── SGIS_모바일_이벤트_웹페이지_패키지/ # 오프라인 현장 배포용 독립 패키지 폴더
```

---

## 🔒 라이선스
MIT License
