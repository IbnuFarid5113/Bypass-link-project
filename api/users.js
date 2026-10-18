// api/users.js
// Log user terakhir yang masuk — Vercel + @vercel/kv

import { kv } from '@vercel/kv';

// Kunci diambil murni dari Environment Variables Vercel
const ADMIN_KEY_1 = process.env.ADMIN_KEY_1;
const ADMIN_KEY_2 = process.env.ADMIN_KEY_2;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const { action, device, key1, key2 } = req.query;

  // ==========================================
  // MODE LOG — user kirim data saat buka web
  // ==========================================
  if (action === 'log') {
    try {
      const ua = req.headers['user-agent'] || '';
      const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
              || req.headers['x-real-ip']
              || 'unknown';

      // Ambil semua log yang ada di database
      const rawLogs = await kv.lrange('user_logs', 0, -1) || [];
      let logs = [];
      for (const raw of rawLogs) {
        try {
          logs.push(typeof raw === 'string' ? JSON.parse(raw) : raw);
        } catch (e) {}
      }

      // ==========================================
      // CEK: Apakah IP ini sudah ada di daftar?
      // ==========================================
      const existingIdx = logs.findIndex(l => l.ip === ip);

      if (existingIdx !== -1) {
        // KALAU SUDAH ADA: Jangan buat baru, cukup update waktunya ke paling atas
        const existingUser = logs.splice(existingIdx, 1)[0]; // Ambil datanya, hapus dari posisi lama
        existingUser.time = new Date().toISOString();        // Update waktu jadi sekarang
        existingUser.device = device || 'unknown';           // Update device (kalau ganti HP)
        existingUser.ua = ua.substring(0, 200);              // Update User-Agent
        existingUser.visits = (existingUser.visits || 1) + 1;// Tambah hitungan kunjungan
        logs.unshift(existingUser);                          // Taruh paling atas
      } else {
        // KALAU BELUM ADA: Baru buat data baru
        logs.unshift({
          time: new Date().toISOString(),
          ip: ip,
          device: device || 'unknown',
          ua: ua.substring(0, 200),
          visits: 1
        });
      }

      // Batasi maksimal 50 user terakhir
      logs = logs.slice(0, 50);

      // Simpan kembali ke database (Timpa yang lama)
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
  // MODE GET — admin minta daftar user
  // ==========================================
  if (key1 !== ADMIN_KEY_1 || key2 !== ADMIN_KEY_2) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    const rawLogs = await kv.lrange('user_logs', 0, 49) || [];
    const logs = [];
    for (const raw of rawLogs) {
      try {
        logs.push(typeof raw === 'string' ? JSON.parse(raw) : raw);
      } catch (e) {}
    }

    const uniqueIPs = new Set(logs.map(l => l.ip));
    const uniqueDevices = new Set(logs.map(l => l.device));

    return res.status(200).json({
      total: logs.length,
      uniqueIPs: uniqueIPs.size,
      uniqueDevices: uniqueDevices.size,
      logs: logs
    });
  } catch (e) {
    return res.status(500).json({ error: e.message, logs: [] });
  }
}