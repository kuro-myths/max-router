#!/usr/bin/env node
'use strict';

const readline = require('node:readline/promises');
const { stdin, stdout } = require('node:process');
const rl = readline.createInterface({ input: stdin, output: stdout });
let baseUrl = (process.env.MAXROUTER_URL || 'https://max-router-production.up.railway.app').replace(/\/+$/, '');
let apiKey = process.env.MAXROUTER_API_KEY || '';

function line(label, status, detail = '') {
  const tag = status === 'OK' ? '[OK]' : status === 'WARN' ? '[PERIKSA]' : '[GAGAL]';
  console.log(tag.padEnd(11) + ' ' + label + (detail ? ' — ' + detail : ''));
}
async function probe(label, path, options = {}) {
  const started = Date.now();
  try {
    const response = await fetch(baseUrl + path, {
      ...options,
      headers: { Accept: 'application/json', ...(apiKey ? { Authorization: 'Bearer ' + apiKey } : {}), ...(options.headers || {}) },
      signal: AbortSignal.timeout(12000)
    });
    const elapsed = Date.now() - started;
    const body = await response.text();
    let data;
    try { data = body ? JSON.parse(body) : {}; } catch { data = body; }
    return { label, path, status: response.status, elapsed, data, ok: response.ok };
  } catch (error) {
    return { label, path, status: 0, elapsed: Date.now() - started, error: error.message, ok: false };
  }
}
function countFrom(data) {
  if (Array.isArray(data?.data)) return data.data.length;
  if (Array.isArray(data?.models)) return data.models.length;
  if (Array.isArray(data)) return data.length;
  return null;
}
async function main() {
  console.log('\n==========================================');
  console.log('       MAX ROUTER — DIAGNOSTIK ONLINE');
  console.log('==========================================');
  console.log('URL: ' + baseUrl);
  console.log('Pemeriksaan hanya membaca status; tidak mengubah konfigurasi.\n');

  const root = await probe('Dashboard web', '/');
  line('Dashboard web', root.ok ? 'OK' : 'FAIL', root.status ? 'HTTP ' + root.status + ', ' + root.elapsed + ' ms' : root.error);

  const health = await probe('Health API', '/api/health');
  line('Health API', health.ok ? 'OK' : 'FAIL', health.status ? 'HTTP ' + health.status + ', ' + health.elapsed + ' ms' : health.error);

  const apiModels = await probe('Model API (/api/v1/models)', '/api/v1/models');
  const v1Models = await probe('Model API (/v1/models)', '/v1/models');
  const preferredModels = apiModels.ok ? apiModels : v1Models;
  const modelCount = countFrom(preferredModels.data);
  line('API model', preferredModels.ok ? 'OK' : 'WARN',
    preferredModels.ok ? 'HTTP ' + preferredModels.status + ', ' + preferredModels.elapsed + ' ms' + (modelCount === null ? '' : ', model: ' + modelCount) :
      'belum terverifikasi tanpa API key atau rute memerlukan autentikasi');

  if (!apiKey) {
    console.log('\nAPI key belum diberikan. Pemeriksaan koneksi publik selesai; model/provider privat belum dapat dipastikan.');
    const answer = (await rl.question('Masukkan API key untuk uji model terautentikasi? (y/N): ')).trim().toLowerCase();
    if (answer === 'y' || answer === 'ya') apiKey = (await rl.question('API key: ')).trim();
  }
  if (apiKey) {
    const models = await probe('Model API terautentikasi', '/v1/models');
    const count = countFrom(models.data);
    line('Model dengan API key', models.ok ? 'OK' : 'FAIL',
      models.ok ? 'HTTP ' + models.status + ', ' + models.elapsed + ' ms' + (count === null ? '' : ', model: ' + count) :
        'HTTP ' + (models.status || 'tidak terhubung') + (models.error ? ', ' + models.error : ''));
    if (!models.ok && (models.status === 401 || models.status === 403)) {
      console.log('            Solusi: buat/salin API key dari pengaturan API Keys Max Router; kata sandi dashboard bukan API key.');
    }
    if (models.ok && count === 0) console.log('            Solusi: periksa provider dan kredensial aktif di dashboard.');
  }

  console.log('\nRingkasan tindakan:');
  if (!root.ok && !health.ok) {
    console.log('- Layanan mungkin sedang tidur, gagal deploy, atau domain tidak dapat dijangkau. Periksa deployment dan log Railway.');
  } else if (!health.ok) {
    console.log('- Dashboard dapat dijangkau tetapi health API gagal. Periksa log runtime dan route /api/health.');
  } else {
    console.log('- Layanan online dapat dijangkau. Jika chat gagal, periksa API key, model, dan kredensial provider di dashboard.');
  }
  console.log('\nDashboard: ' + baseUrl);
  console.log('Selesai. Tidak ada API key yang disimpan ke file.');
}
main().catch(error => { console.error('Diagnostik gagal: ' + error.message); process.exitCode = 1; }).finally(() => rl.close());
