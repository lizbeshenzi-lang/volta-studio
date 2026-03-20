// api/availability.js
// Real-time slot availability for booking-heavy sites (clinics, salons, restaurants, gyms)
// GET  ?date=YYYY-MM-DD&service=facial    → returns available slots
// POST { date, time, service, name }      → marks slot as booked

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const KV_URL = process.env.KV_REST_API_URL;
  const KV_TOKEN = process.env.KV_REST_API_TOKEN;

  // Helper to read from KV
  async function kvGet(key) {
    if (!KV_URL || !KV_TOKEN) return null;
    const r = await fetch(`${KV_URL}/get/${key}`, {
      headers: { Authorization: `Bearer ${KV_TOKEN}` }
    });
    const j = await r.json();
    return j.result ? JSON.parse(j.result) : null;
  }

  // Helper to write to KV (with 24h TTL)
  async function kvSet(key, value) {
    if (!KV_URL || !KV_TOKEN) return;
    await fetch(`${KV_URL}/set/${key}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${KV_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ value: JSON.stringify(value), ex: 86400 })
    });
  }

  // GET: return available slots for a date
  if (req.method === 'GET') {
    const { date } = req.query;
    if (!date) return res.status(400).json({ error: 'date required' });

    const key = `slots_${date}`;
    const booked = await kvGet(key) || [];

    // Default 9AM–5PM slots every hour
    const allSlots = ['09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00'];
    const available = allSlots.map(t => ({
      time: t,
      available: !booked.includes(t)
    }));

    return res.status(200).json({ date, slots: available });
  }

  // POST: book a slot
  if (req.method === 'POST') {
    const { date, time, name, service } = req.body;
    if (!date || !time) return res.status(400).json({ error: 'date and time required' });

    const key = `slots_${date}`;
    const booked = await kvGet(key) || [];

    if (booked.includes(time)) {
      return res.status(409).json({ error: 'Slot already booked', time });
    }

    booked.push(time);
    await kvSet(key, booked);

    // Also log the booking detail
    const bookingKey = `booking_${date}_${time.replace(':','')}`;
    await kvSet(bookingKey, { date, time, name, service, bookedAt: new Date().toISOString() });

    return res.status(200).json({ success: true, date, time, message: `${time} on ${date} is confirmed.` });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
