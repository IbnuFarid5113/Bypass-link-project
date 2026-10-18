// api/users.js
import { kv } from '@vercel/kv';

const ADMIN_KEY_1 = process.env.ADMIN_KEY_1;
const ADMIN_KEY_2 = process.env.ADMIN_KEY_2;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const { action, device, key1, key2, ip } = req.query;

  // ==========================================
  // MODE LOG (Kirim data user)
  // ==========================================
  if (action === 'log') {
    try {
      const ua = req.headers['user-agent'] || '';
      const clientIp = (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
              || req.headers['x-real-ip']
              || 'unknown';

      const rawLogs = await kv.lrange('user_logs', 0, -1) || [];
      let logs = [];
      for (const raw of rawLogs) {
        try { logs.push(typeof raw === 'string' ? JSON.parse(raw) : raw); } catch (e) {}
      }

      const existingIdx = logs.findIndex(l => l.ip === clientIp);

      if (existingIdx !== -1) {
        const existingUser = logs.splice(existingIdx, 1)[0];
        existingUser.time = new Date().toISOString();
        existingUser.device = device || 'unknown';
        existingUser.ua = ua.substring(0, 200);
        existingUser.visits = (existingUser.visits || 1) + 1;
        logs.unshift(existingUser);
      } else {
        logs.unshift({
          time: new Date().toISOString(),
          ip: clientIp,
          device: device || 'unknown',
          ua: ua.substring(0, 200),
          visits: 1
        });
      }

      logs = logs.slice(0, 50);
      await kv.del('user_logs');
      if (logs.length > 0) {
        await kv.lpush('user_logs', ...logs.map(l => JSON.stringify(l)));
        await kv.ltrim('user_logs', 0, 49);
      }

      return res.status(200).json({ success: true });
    } catch (e) {
      return res.status(500).json({ success: false, error: e.message });
    }
  }

  // ==========================================
  // VALIDASI KUNCI ADMIN (Untuk semua aksi di bawah ini)
  // ==========================================
  if (key1 !== ADMIN_KEY_1 || key2 !== ADMIN_KEY_2) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  // ==========================================
  // MODE CLEAR (Hapus semua log)
  // ==========================================
  if (action === 'clear') {
    try {
      await kv.del('user_logs');
      return res.status(200).json({ success: true, message: 'Semua log dihapus' });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ==========================================
  // MODE DELETE (Hapus 1 IP spesifik)
  // ==========================================
  if (action === 'delete' && ip) {
    try {
      const rawLogs = await kv.lrange('user_logs', 0, -1) || [];
      let logs = [];
      for (const raw of rawLogs) {
        try { logs.push(typeof raw === 'string' ? JSON.parse(raw) : raw); } catch (e) {}
      }

      // Filter: Buang IP yang mau dihapus
      const newLogs = logs.filter(l => l.ip !== ip);

      await kv.del('user_logs');
      if (newLogs.length > 0) {
        await kv.lpush('user_logs', ...newLogs.map(l => JSON.stringify(l)));
        await kv.ltrim('user_logs', 0, 49);
      }

      return res.status(200).json({ success: true, message: 'User dihapus' });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ==========================================
  // MODE GET (Ambil daftar user)
  // ==========================================
  try {
    const rawLogs = await kv.lrange('user_logs', 0, 49) || [];
    const logs = [];
    for (const raw of rawLogs) {
      try { logs.push(typeof raw === 'string' ? JSON.parse(raw) : raw); } catch (e) {}
    }

    const uniqueIPs = new Set(logs.map(l => l.ip));

    return res.status(200).json({
      total: logs.length,
      uniqueIPs: uniqueIPs.size,
      logs: logs
    });
  } catch (e) {
    return res.status(500).json({ error: e.message, logs: [] });
  }
}