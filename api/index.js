// Unified Serverless Handler for Vercel
// Routes all /api/* endpoints within a single Lambda function so warm instances share memory
const { CORRECT_ANSWERS, getResponses, saveResponses, computeStats } = require('./_db');

module.exports = async (req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  // Parse path
  const urlObj = new URL(req.url, `https://${req.headers.host || 'localhost'}`);
  const pathname = urlObj.pathname.replace(/\/+$/, '') || '/';
  const query = Object.fromEntries(urlObj.searchParams);

  // 1. POST /api/submit
  if (pathname === '/api/submit' || pathname.endsWith('/submit')) {
    if (req.method !== 'POST') {
      return res.status(405).json({ success: false, error: 'POST 요청만 지원합니다.' });
    }

    try {
      let body = req.body;
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch (e) {}
      }
      if (!body || typeof body !== 'object') {
        return res.status(400).json({ success: false, error: '요청 본문이 올바르지 않습니다.' });
      }

      const q1 = String(body.q1 || '').trim();
      const q2 = String(body.q2 || '').trim();
      const q3 = String(body.q3 || '').trim();
      const q4 = String(body.q4 || '').trim();
      const q5 = String(body.q5 || '').trim();

      if (!q1 || !q2 || !q3 || !q4 || !q5) {
        return res.status(400).json({ success: false, error: '1번부터 5번 문항까지 모두 작성해야 합니다.' });
      }

      const isQ1 = q1 === CORRECT_ANSWERS.q1 ? 1 : 0;
      const isQ2 = q2 === CORRECT_ANSWERS.q2 ? 1 : 0;
      const isQ3 = q3 === CORRECT_ANSWERS.q3 ? 1 : 0;
      const isQ4 = q4 === CORRECT_ANSWERS.q4 ? 1 : 0;
      const score = isQ1 + isQ2 + isQ3 + isQ4;

      const list = await getResponses();
      const newId = list.length + 1;
      const now = new Date();
      const kstTime = new Date(now.getTime() + 9 * 60 * 60 * 1000);
      const createdAt = kstTime.toISOString().replace('T', ' ').substring(0, 19);

      const record = {
        id: newId,
        created_at: createdAt,
        q1_answer: q1,
        is_q1_correct: isQ1,
        q2_answer: q2,
        is_q2_correct: isQ2,
        q3_answer: q3,
        is_q3_correct: isQ3,
        q4_answer: q4,
        is_q4_correct: isQ4,
        q5_feedback: q5,
        score: score,
        user_agent: req.headers['user-agent'] || '',
        ip_address: req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1'
      };

      list.push(record);
      await saveResponses(list);

      return res.status(200).json({
        success: true,
        id: newId,
        score: score,
        total: 4,
        created_at: createdAt,
        message: '퀴즈 응답이 정상적으로 제출 및 저장되었습니다!'
      });
    } catch (err) {
      console.error('Submit error:', err);
      return res.status(500).json({ success: false, error: '서버 내부 오류가 발생했습니다.' });
    }
  }

  // 2. GET /api/responses
  if (pathname === '/api/responses' || pathname.endsWith('/responses')) {
    try {
      const list = await getResponses();
      const stats = computeStats(list);
      const reversed = [...list].reverse();

      return res.status(200).json({
        success: true,
        count: list.length,
        stats: stats,
        responses: reversed
      });
    } catch (err) {
      console.error('Get responses error:', err);
      return res.status(500).json({ success: false, error: '응답 목록 조회 중 오류가 발생했습니다.' });
    }
  }

  // 3. GET /api/stats
  if (pathname === '/api/stats' || pathname.endsWith('/stats')) {
    try {
      const list = await getResponses();
      const stats = computeStats(list);
      return res.status(200).json({ success: true, stats });
    } catch (err) {
      console.error('Get stats error:', err);
      return res.status(500).json({ success: false, error: '통계 집계 중 오류가 발생했습니다.' });
    }
  }

  // 4. GET /api/export, /api/export/csv, /api/export/json
  if (pathname.includes('/export')) {
    try {
      const list = await getResponses();
      const format = (pathname.endsWith('/json') ? 'json' : (query.format || 'csv')).toLowerCase();

      if (format === 'json') {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="sgis_quiz_responses.json"');
        return res.status(200).send(JSON.stringify(list, null, 2));
      }

      // CSV with UTF-8 BOM
      const headers = [
        '접수번호',
        '제출일시',
        '1번 응답(SGIS명칭)',
        '1번 정답여부',
        '2번 응답(상권지도)',
        '2번 정답여부',
        '3번 응답(일자리맵)',
        '3번 정답여부',
        '4번 응답(자료제공)',
        '4번 정답여부',
        '5번 방문소감 및 바라는 점',
        '총점(4점 만점)',
        'IP주소',
        '브라우저환경'
      ];

      const escapeCsv = (val) => {
        const s = String(val === undefined || val === null ? '' : val);
        if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
          return `"${s.replace(/"/g, '""')}"`;
        }
        return s;
      };

      const lines = [headers.map(escapeCsv).join(',')];

      for (const r of list) {
        lines.push([
          r.id,
          r.created_at,
          r.q1_answer,
          r.is_q1_correct ? '정답' : '오답',
          r.q2_answer,
          r.is_q2_correct ? '정답' : '오답',
          r.q3_answer,
          r.is_q3_correct ? '정답' : '오답',
          r.q4_answer,
          r.is_q4_correct ? '정답' : '오답',
          r.q5_feedback,
          r.score,
          r.ip_address,
          r.user_agent
        ].map(escapeCsv).join(','));
      }

      const csvContent = '\ufeff' + lines.join('\r\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="sgis_quiz_responses.csv"');
      return res.status(200).send(csvContent);
    } catch (err) {
      console.error('Export error:', err);
      return res.status(500).json({ success: false, error: '데이터 내보내기 중 오류가 발생했습니다.' });
    }
  }

  return res.status(404).json({ success: false, error: '요청한 API 엔드포인트를 찾을 수 없습니다.' });
};
