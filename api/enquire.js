// api/enquire.js - Enhanced enquiry/booking handler
// Features: KV storage, Google Sheets webhook, WhatsApp link, email notifications (via webhook)

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    const { name, email, phone, service, date, time, guests, message, occasion, siteName, whatsappNumber } = req.body;

    // Validate
    if (!name || (!email && !phone)) {
      return res.status(400).json({ error: 'Name and contact (email or phone) required' });
    }

    const timestamp = new Date().toISOString();
    const submissionId = `sub_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    const submission = {
      id: submissionId,
      siteName: siteName || 'Unknown Site',
      name,
      email: email || '',
      phone: phone || '',
      service: service || '',
      date: date || '',
      time: time || '',
      guests: guests || '',
      occasion: occasion || '',
      message: message || '',
      timestamp,
      status: 'new',
      ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown'
    };

    // 1. Vercel KV Storage (optional but recommended)
    try {
      const KV_URL = process.env.KV_REST_API_URL;
      const KV_TOKEN = process.env.KV_REST_API_TOKEN;
      if (KV_URL && KV_TOKEN) {
        const headers = {
          Authorization: `Bearer ${KV_TOKEN}`,
          'Content-Type': 'application/json'
        };

        // Store individual submission (30 day TTL)
        await fetch(`${KV_URL}/set/${submissionId}`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            value: JSON.stringify(submission),
            ex: 2592000 // 30 days
          })
        });

        // Add to list for easy querying
        await fetch(`${KV_URL}/lpush/submissions_${siteName.replace(/\s+/g, '_')}`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ value: submissionId })
        });
      }
    } catch (e) {
      console.error('[KV Error]', e.message);
      // Continue even if KV fails
    }

    // 2. Google Sheets Webhook (via Zapier, Make, or custom script)
    try {
      if (process.env.GOOGLE_SHEETS_WEBHOOK_URL) {
        await fetch(process.env.GOOGLE_SHEETS_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(submission)
        });
      }
    } catch (e) {
      console.error('[Sheets Webhook Error]', e.message);
    }

    // 3. Email Notification (via SendGrid, Mailgun, or simple webhook)
    try {
      if (process.env.EMAIL_WEBHOOK_URL) {
        await fetch(process.env.EMAIL_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: email || 'noreply@example.com',
            subject: `Enquiry Confirmation - ${siteName}`,
            html: `
              <h2>Thank you for your enquiry</h2>
              <p>Hi ${name},</p>
              <p>We've received your enquiry and will be in touch shortly.</p>
              <hr>
              <h3>Your Details:</h3>
              <ul>
                <li><strong>Name:</strong> ${name}</li>
                ${phone ? `<li><strong>Phone:</strong> ${phone}</li>` : ''}
                ${service ? `<li><strong>Service:</strong> ${service}</li>` : ''}
                ${date ? `<li><strong>Date:</strong> ${date}</li>` : ''}
                ${time ? `<li><strong>Time:</strong> ${time}</li>` : ''}
              </ul>
              <p><strong>Reference ID:</strong> ${submissionId}</p>
            `
          })
        });
      }
    } catch (e) {
      console.error('[Email Error]', e.message);
    }

    // 4. WhatsApp Contact Link
    let whatsappUrl = null;
    const waNum = (whatsappNumber || process.env.WHATSAPP_NUMBER || '').replace(/\D/g, '');
    if (waNum) {
      const waMessage = [
        `Hi! I submitted an enquiry on ${siteName}.`,
        '',
        `Name: ${name}`,
        service && `Service: ${service}`,
        date && `Date: ${date}`,
        time && `Time: ${time}`,
        phone && `Phone: ${phone}`,
        '',
        `Ref ID: ${submissionId}`
      ].filter(Boolean).join('\n');

      whatsappUrl = `https://wa.me/${waNum}?text=${encodeURIComponent(waMessage)}`;
    }

    return res.status(200).json({
      success: true,
      submissionId,
      whatsappUrl,
      message: 'Thank you for your enquiry. We will be in touch shortly.',
      nextSteps: 'Check your email for confirmation details.'
    });

  } catch (error) {
    console.error('[Handler Error]', error);
    return res.status(500).json({
      success: false,
      error: 'An error occurred processing your enquiry. Please try again.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

