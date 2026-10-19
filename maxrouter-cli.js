#!/usr/bin/env node
'use strict';

const readline = require('node:readline/promises');
const { stdin, stdout } = require('node:process');

const rl = readline.createInterface({ input: stdin, output: stdout });
let baseUrl = (process.env.MAXROUTER_URL || 'https://max-router-production.up.railway.app').replace(/\/+$/, '');
let apiKey = process.env.MAXROUTER_API_KEY || '';
let model = '';

async function ask(label) {
  return (await rl.question(label)).trim();
}
function header() {
  console.clear();
  console.log('\n MAX ROUTER ONLINE CLI');
  console.log(' Layanan online; tidak menjalankan backend lokal');
  console.log(' URL: ' + baseUrl + '\n');
}
async function ensureKey() {
  if (!apiKey) apiKey = await ask('API key Max Router (input terlihat): ');
  if (!apiKey) throw new Error('API key kosong.');
}
async function request(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (apiKey) headers.Authorization = 'Bearer ' + apiKey;
  if (options.body) headers['Content-Type'] = 'application/json';
  const response = await fetch(baseUrl + path, { ...options, headers, signal: AbortSignal.timeout(45000) });
  const raw = await response.text();
  let data;
  try { data = raw ? JSON.parse(raw) : {}; } catch { data = raw; }
  if (!response.ok) {
    const detail = typeof data === 'string' ? data.slice(0, 500) : (data.error?.message || data.message || JSON.stringify(data));
    throw new Error('HTTP ' + response.status + ': ' + detail);
  }
  return data;
}
function getModels(data) {
  return Array.isArray(data?.data) ? data.data : Array.isArray(data?.models) ? data.models : [];
}
async function main() {
  while (true) {
    header();
    console.log(' [1] Cek layanan online');
    console.log(' [2] Daftar model/API');
    console.log(' [3] Chat AI dari terminal');
    console.log(' [4] Ubah URL layanan');
    console.log(' [5] Ganti API key');
    console.log(' [6] Buka dashboard web');
    console.log(' [0] Keluar\n');
    const choice = await ask('Pilih menu: ');
    try {
      if (choice === '0') break;
      if (choice === '1') {
        const r = await fetch(baseUrl + '/api/health', { signal: AbortSignal.timeout(15000) });
        console.log('Health HTTP: ' + r.status);
        if (!r.ok) {
          const home = await fetch(baseUrl, { signal: AbortSignal.timeout(15000) });
          console.log('Dashboard HTTP: ' + home.status);
        }
      } else if (choice === '2') {
        await ensureKey();
        const models = getModels(await request('/v1/models'));
        console.log('\nJumlah model: ' + models.length);
        models.forEach((m, i) => console.log((i + 1) + '. ' + (m.id || m.name || JSON.stringify(m))));
        if (models.length) {
          const selected = await ask('\nMasukkan ID model untuk chat (Enter = tidak mengubah): ');
          if (selected) model = selected;
        }
      } else if (choice === '3') {
        await ensureKey();
        if (!model) model = await ask('ID model (lihat menu 2): ');
        if (!model) throw new Error('ID model wajib diisi.');
        const messages = [];
        console.log('Chat aktif. Ketik /keluar untuk kembali ke menu.');
        while (true) {
          const prompt = await ask('\nAnda: ');
          if (prompt === '/keluar') break;
          if (!prompt) continue;
          messages.push({ role: 'user', content: prompt });
          try {
            const data = await request('/v1/chat/completions', {
              method: 'POST',
              body: JSON.stringify({ model, messages, stream: false })
            });
            const answer = data?.choices?.[0]?.message?.content;
            if (answer == null) throw new Error('Respons tidak berisi choices[0].message.content.');
            const text = Array.isArray(answer) ? answer.map(x => x.text || '').join('') : String(answer);
            console.log('\nAI: ' + text);
            messages.push({ role: 'assistant', content: text });
          } catch (err) {
            messages.pop();
            console.log('\nGagal mengirim pesan: ' + err.message);
          }
        }
      } else if (choice === '4') {
        const value = await ask('URL dasar baru: ');
        if (!/^https?:\/\//i.test(value)) throw new Error('URL harus diawali http:// atau https://');
        baseUrl = value.replace(/\/+$/, '');
        model = '';
      } else if (choice === '5') {
        apiKey = '';
        await ensureKey();
        console.log('API key diganti untuk sesi ini.');
      } else if (choice === '6') {
        const { exec } = require('node:child_process');
        const { platform } = require('node:process');
        const command = platform === 'win32' ? 'start "" "' + baseUrl + '"' : platform === 'darwin' ? 'open "' + baseUrl + '"' : 'xdg-open "' + baseUrl + '"';
        exec(command);
      } else {
        console.log('Menu tidak dikenal.');
      }
    } catch (err) {
      console.log('\nGAGAL: ' + err.message);
    }
    if (choice !== '0') await ask('\nTekan Enter untuk kembali ke menu...');
  }
  rl.close();
}
main().catch(err => { console.error('CLI gagal: ' + err.message); rl.close(); process.exitCode = 1; });
