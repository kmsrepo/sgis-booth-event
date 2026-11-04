// Vercel Serverless Function Helper for SGIS Quiz Event
const fs = require('fs');
const path = require('path');

const DB_FILE = path.join('/tmp', 'sgis_quiz_responses.json');

const CORRECT_ANSWERS = {
  q1: "SGIS (통계지리정보서비스)",
  q2: "업종통계지도",
  q3: "일자리맵",
  q4: "자료제공 서비스"
};

function getResponses() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const data = fs.readFileSync(DB_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error("Failed to read DB file:", err);
  }
  return [];
}

function saveResponses(list) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(list, null, 2), 'utf-8');
  } catch (err) {
    console.error("Failed to write DB file:", err);
  }
}

function computeStats(responses) {
  const total = responses.length;
  let perfect = 0;
  let sumScore = 0;
  let q1C = 0, q2C = 0, q3C = 0, q4C = 0;

  for (const r of responses) {
    if (r.score === 4) perfect++;
    sumScore += (r.score || 0);
    if (r.is_q1_correct) q1C++;
    if (r.is_q2_correct) q2C++;
    if (r.is_q3_correct) q3C++;
    if (r.is_q4_correct) q4C++;
  }

  return {
    total_responses: total,
    perfect_scores: perfect,
    avg_score: total > 0 ? Number((sumScore / total).toFixed(2)) : 0,
    q1_accuracy: total > 0 ? Number(((q1C / total) * 100).toFixed(1)) : 0,
    q2_accuracy: total > 0 ? Number(((q2C / total) * 100).toFixed(1)) : 0,
    q3_accuracy: total > 0 ? Number(((q3C / total) * 100).toFixed(1)) : 0,
    q4_accuracy: total > 0 ? Number(((q4C / total) * 100).toFixed(1)) : 0
  };
}

module.exports = {
  DB_FILE,
  CORRECT_ANSWERS,
  getResponses,
  saveResponses,
  computeStats
};
