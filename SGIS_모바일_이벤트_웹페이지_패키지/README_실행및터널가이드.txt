================================================================================
국가데이터처 SGIS 통계지리정보서비스 홍보부스 모바일 이벤트 웹페이지 패키지 (로컬 독립형)
================================================================================

[주요 구성 및 동작 방식]
1. 초기 접속 즉시 렌더링 및 4대 통계지도 즉시 체험:
   - 외부 Tailwind CDN 지연(defer) 문제 및 네트워크 랙 원천 차단:
     * 독립 내장 CSS 및 로컬 정적 tailwind.js 탑재로 첫 접속 시 0ms 즉각 UI 렌더링
   - 답변을 선택하지 않고 최초 접속했을 때에도 최상단에 [⚡ 4대 통계지도 실제 주소 바로가기] 카드 즉시 노출
   - 참여자가 문제를 풀기 전 현장 부스에서 4대 모바일 통계지도를 직접 열어보며 정답(Q1~Q4)을 즉시 탐색 가능

2. 1단계 (로컬 퀴즈/설문 제출):
   - 네이버폼 의존성 완전 제거: 5개 퀴즈 문항을 반응형 웹 폼으로 자체 제공
   - 제출 시 로컬 SQLite DB(quiz_responses.db)에 자동 채점 결과(0~4점) 및 소감 영구 저장
   - 실시간 답변 진행률 표시기 (0~5문항)

3. 2단계 (SGIS 4대 통계지도 실제 서비스 주소 직접 연결):
   - 일반 포털 메인 홈(sgis.mods.go.kr)이 아닌, 4가지 통계지도의 실제 모바일 서비스 상세 주소로 직접 연결됩니다.
   - [01 대화형 통계지도]
     https://sgis.mods.go.kr/mobile/m2020/map/current/currentMap.sgis?areaCode=|31104570|933750|1963450&type=full
   - [02 생활권역 통계지도]
     https://sgis.mods.go.kr/mobile/m2021/map/catchmentareaMap.sgis?areaCode=|31104570|933750|1963450&type=full
   - [03 통계주제도 (인구변화)]
     https://sgis.mods.go.kr/mobile/m2020/map/thematic/thematicMap.sgis?selParam=CTGR_001&stat_thema_map_id=tzvK4xEuFD20160121115806965LnKnzJtJ7F&areaCode=|31104570|933750|1963450&type=full
   - [04 일자리 맵]
     https://sgis.mods.go.kr/mobile/m2020/map/workroad/myNeighberhoodJobMap.sgis?areaCode=|31104|933750|1963450&type=full&zoom=5
   - 퀴즈 제출 즉시 4개 서비스 원클릭 바로가기 팝업 및 상세 카드 화면이 활성화됩니다.
   - 상단 스텝 탭([1단계: 퀴즈 설문] / [2단계: 4대 통계지도])을 통해 언제든지 자유롭게 화면 전환 가능

4. 부스 운영자 관리자 콘솔 (/admin):
   - 실시간 참여 현황, 만점자 비율, 문항별 정답률 시각화
   - 한글 깨짐 없는 엑셀 호환 CSV(UTF-8 BOM) 및 JSON 즉시 다운로드 제공

================================================================================
[현재 실행 중인 실시간 서비스 주소]
- Cloudflare Tunnel 활성 주소:
  * 부스 참여자 화면 (QR코드용): https://allows-purchasing-etc-housing.trycloudflare.com/
  * 운영자 관리자 콘솔        : https://allows-purchasing-etc-housing.trycloudflare.com/admin.html
  * 엑셀(CSV) 즉시 다운로드    : https://allows-purchasing-etc-housing.trycloudflare.com/api/export/csv

- 로컬 접속 주소:
  * 참여자 화면: http://localhost:8080/
  * 관리자 콘솔: http://localhost:8080/admin
================================================================================

[서버 재시작 및 터널 수동 구동 방법]
1. 로컬 백엔드 서버 구동:
   python3 server.py 8080

2. Cloudflare 터널 생성:
   cloudflared tunnel --url http://localhost:8080
================================================================================
