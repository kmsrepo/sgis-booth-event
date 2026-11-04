// Vercel Serverless Function Helper for SGIS Quiz Event
// Supports:
// 1. Persistent Cloud Vercel KV (Upstash Redis) if KV_REST_API_URL is configured
// 2. In-Memory & /tmp local cache fallback for ephemeral serverless instances

const fs = require('fs');
const path = require('path');

const DB_FILE = path.join('/tmp', 'sgis_quiz_responses.json');

const CORRECT_ANSWERS = {
  q1: "SGIS (통계지리정보서비스)",
  q2: "업종통계지도",
  q3: "일자리맵",
  q4: "자료제공 서비스"
};

// Global in-memory cache shared across warm invocations within the same container
if (!global._inMemoryResponses) {
  global._inMemoryResponses = null;
}

async function getResponses() {
  // 1. Try Vercel KV cloud storage if environment variables are present
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    try {
      const url = `${process.env.KV_REST_API_URL}/get/sgis_responses`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.result !== undefined && data.result !== null) {
          const parsed = typeof data.result === 'string' ? JSON.parse(data.result) : data.result;
          if (Array.isArray(parsed)) {
            global._inMemoryResponses = parsed;
            return parsed;
          }
        }
      }
    } catch (err) {
      console.warn("Vercel KV fetch failed, falling back to local memory:", err.message);
    }
  }

  // 2. Try in-memory cache
  if (Array.isArray(global._inMemoryResponses)) {
    return global._inMemoryResponses;
  }

  // 3. Try /tmp file cache
  try {
    if (fs.existsSync(DB_FILE)) {
      const data = fs.readFileSync(DB_FILE, 'utf-8');
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed)) {
        global._inMemoryResponses = parsed;
        return parsed;
      }
    }
  } catch (err) {
    console.warn("Failed to read /tmp DB file:", err.message);
  }

  global._inMemoryResponses = [];
  return global._inMemoryResponses;
}

async function saveResponses(list) {
  // Update in-memory
  global._inMemoryResponses = list;

  // Update /tmp file
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(list, null, 2), 'utf-8');
  } catch (err) {
    console.warn("Failed to write to /tmp DB file:", err.message);
  }

  // Update Vercel KV if available
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    try {
      const url = `${process.env.KV_REST_API_URL}/set/sgis_responses`;
      await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(list)
      });
    } catch (err) {
      console.warn("Vercel KV save failed:", err.message);
    }
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
