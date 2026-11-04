const { getResponses } = require('./_db');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  try {
    const list = getResponses();
    const format = (req.query?.format || 'csv').toLowerCase();

    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="sgis_quiz_responses.json"');
      return res.status(200).send(JSON.stringify(list, null, 2));
    }

    // CSV format with UTF-8 BOM
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

    // UTF-8 BOM \ufeff for Excel Korean compatibility
    const csvContent = '\ufeff' + lines.join('\r\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="sgis_quiz_responses.csv"');
    return res.status(200).send(csvContent);
  } catch (err) {
    console.error('Export error:', err);
    return res.status(500).json({ success: false, error: '데이터 내보내기 중 오류가 발생했습니다.' });
  }
};
