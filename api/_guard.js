// Shared abuse protection for the API routes. Files starting with "_" are not
// exposed as endpoints by Vercel, so this is a helper module only.
//
//  - originOk:   reject calls that don't come from our own pages
//  - rateLimit:  per-IP counters in the same Upstash Redis the reports use
//  - systemOk:   the system prompt must be our skill, so /api/chat can't be used
//                as a free general-purpose Claude proxy

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

const ALLOWED_HOSTS = [
  'enjoythefundraise.ai',
  'www.enjoythefundraise.ai',
  'localhost',
  '127.0.0.1',
];

function hostOf(url) {
  try { return new URL(url).hostname.toLowerCase(); } catch (e) { return ''; }
}

export function originOk(req) {
  const src = req.headers.origin || req.headers.referer || '';
  const h = hostOf(src);
  if (!h) return false;
  if (ALLOWED_HOSTS.includes(h)) return true;
  // Vercel preview deployments of this project
  if (h.endsWith('.vercel.app')) return true;
  return false;
}

export function clientIp(req) {
  const xff = String(req.headers['x-forwarded-for'] || '');
  return (xff.split(',')[0] || req.headers['x-real-ip'] || 'unknown').trim();
}

// Fixed-window counter. Returns true if the call is allowed.
// Fails open (allows) if Redis isn't configured or errors, so the site never breaks over this.
export async function rateLimit(req, bucket, limit, windowSeconds) {
  if (!REDIS_URL || !REDIS_TOKEN) return true;
  const key = 'rl:' + bucket + ':' + clientIp(req) + ':' + Math.floor(Date.now() / 1000 / windowSeconds);
  try {
    const r = await fetch(REDIS_URL + '/pipeline', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + REDIS_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify([['INCR', key], ['EXPIRE', key, windowSeconds]]),
    });
    const data = await r.json();
    const count = Array.isArray(data) && data[0] ? Number(data[0].result) : 0;
    return count <= limit;
  } catch (e) {
    return true;
  }
}

const FALLBACK_SYSTEM = 'You are an expert pitch coach helping startup founders improve their fundraising pitch.';
let skillPrefix = null;

async function loadSkillPrefix(req) {
  if (skillPrefix) return skillPrefix;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const r = await fetch('https://' + host + '/founder-pitch-feedback-skill.md');
  if (!r.ok) throw new Error('skill fetch ' + r.status);
  const text = await r.text();
  // Same transform the page applies in loadSkill()
  skillPrefix = text.replace(/^---[\s\S]*?---\n/, '').trim().slice(0, 400);
  return skillPrefix;
}

export async function systemOk(req, system) {
  if (typeof system !== 'string') return false;
  if (system.startsWith(FALLBACK_SYSTEM)) return true;
  try {
    const prefix = await loadSkillPrefix(req);
    return system.startsWith(prefix);
  } catch (e) {
    return true; // can't verify right now — don't break real founders
  }
}

export function deny(res, status, msg) {
  return res.status(status).json({ error: msg });
}
