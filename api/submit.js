const { CORRECT_ANSWERS, getResponses, saveResponses } = require('./_db');

module.exports = async (req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

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

    const list = getResponses();
    const newId = list.length + 1;
    const now = new Date();
    // Format YYYY-MM-DD HH:MM:SS in KST (UTC+9)
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
    saveResponses(list);

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
};
