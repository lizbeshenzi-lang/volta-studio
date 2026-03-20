// api/admin.js
// Password-protected submissions dashboard
// GET ?password=SECRET → returns all recent submissions as JSON
// Used by the admin.html dashboard page

export default async function handler(req, res) {
  const { password } = req.query;

  if (password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const KV_URL = process.env.KV_REST_API_URL;
  const KV_TOKEN = process.env.KV_REST_API_TOKEN;

  if (!KV_URL || !KV_TOKEN) {
    return res.status(500).json({ error: 'Storage not configured' });
  }

  try {
    // List all submission keys
    const listRes = await fetch(`${KV_URL}/keys/sub_*`, {
      headers: { Authorization: `Bearer ${KV_TOKEN}` }
    });
    const listData = await listRes.json();
    const keys = listData.result || [];

    // Fetch each submission
    const submissions = await Promise.all(
      keys.slice(0, 100).map(async (key) => {
        const r = await fetch(`${KV_URL}/get/${key}`, {
          headers: { Authorization: `Bearer ${KV_TOKEN}` }
        });
        const j = await r.json();
        return j.result ? JSON.parse(j.result) : null;
      })
    );

    const valid = submissions
      .filter(Boolean)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    return res.status(200).json({ count: valid.length, submissions: valid });

  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch submissions', detail: err.message });
  }
}
