const { getResponses, computeStats } = require('./_db');

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
    const stats = computeStats(list);

    // Return in reverse chronological order (newest first)
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
};
