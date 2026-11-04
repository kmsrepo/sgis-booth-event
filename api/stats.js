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

    return res.status(200).json({
      success: true,
      stats: stats
    });
  } catch (err) {
    console.error('Get stats error:', err);
    return res.status(500).json({ success: false, error: '통계 집계 중 오류가 발생했습니다.' });
  }
};
