#!/usr/bin/env node
'use strict';

const readline = require('node:readline/promises');
const { stdin, stdout } = require('node:process');
const rl = readline.createInterface({ input: stdin, output: stdout });
let baseUrl = (process.env.MAXROUTER_URL || 'https://max-router-production.up.railway.app').replace(/\/+$/, '');
let apiKey = process.env.MAXROUTER_API_KEY || '';
let model = '';
let modelsCache = [];

async function ask(label) { return (await rl.question(label)).trim(); }
function header() {
  console.clear();
  console.log('\n MAX ROUTER ONLINE CLI');
  console.log(' Layanan online; menggunakan API Max Router yang sama dengan dashboard');
  console.log(' URL: ' + baseUrl + '\n');
}
async function ensureKey() {
  if (!apiKey) apiKey = await ask('API key Max Router (gunakan key yang dibuat di menu API Keys): ');
  if (!apiKey) throw new Error('API key kosong. Gunakan key Max Router yang valid, bukan nomor menu.');
}
async function request(path, options = {}) {
  const headers = { Accept: 'application/json', ...(options.headers || {}) };
  if (apiKey) headers.Authorization = 'Bearer ' + apiKey;
  if (options.body) headers['Content-Type'] = 'application/json';
  const response = await fetch(baseUrl + path, { ...options, headers, signal: AbortSignal.timeout(45000) });
  const raw = await response.text();
  let data;
  try { data = raw ? JSON.parse(raw) : {}; } catch { data = raw; }
  if (!response.ok) {
    const detail = typeof data === 'string' ? data.slice(0, 500) : (data?.error?.message || data?.error || data?.message || JSON.stringify(data));
    throw new Error('HTTP ' + response.status + ': ' + detail);
  }
  return data;
}
function getModels(data) {
  return Array.isArray(data?.data) ? data.data.filter(m => m && m.id) : Array.isArray(data?.models) ? data.models.filter(m => m && m.id) : [];
}
function value(...values) {
  const found = values.find(v => v !== undefined && v !== null && v !== '');
  return found === undefined ? 'Tidak disediakan API' : Array.isArray(found) ? found.join(', ') : typeof found === 'object' ? JSON.stringify(found) : String(found);
}
function showModel(m, i) {
  const meta = m.metadata || m;
  console.log('\n' + (i + 1) + '. ' + m.id);
  console.log('   Provider/pemilik : ' + value(m.owned_by, m.provider));
  console.log('   Jendela konteks  : ' + value(meta.context_window, meta.contextWindow, meta.context_length, meta.max_context));
  console.log('   Keluaran maksimum: ' + value(meta.max_output, meta.maxOutput, meta.max_tokens));
  console.log('   Input             : ' + value(meta.input, meta.modalities?.input));
  console.log('   Kemampuan         : ' + value(meta.capabilities));
  console.log('   Parameter         : ' + value(meta.supported_parameters, meta.supportedParameters));
  console.log('   Harga             : ' + value(meta.pricing, meta.priceClass));
}
async function loadModels() {
  await ensureKey();
  // Same API prefix used by Max Router's own web interface.
  modelsCache = getModels(await request('/api/v1/models', { headers: { 'Cache-Control': 'no-cache' } }));
  return modelsCache;
}
async function chooseModel() {
  const models = await loadModels();
  console.log('\nModel tersedia: ' + models.length);
  if (!models.length) {
    console.log('Tidak ada model yang dikembalikan. Pastikan provider/kredensial aktif di dashboard.');
    return;
  }
  models.forEach((m, i) => console.log(' [' + (i + 1) + '] ' + m.id + '  | provider: ' + value(m.owned_by, m.provider)));
  const selected = await ask('\nNomor model atau ID model (Enter = batal): ');
  if (!selected) return;
  const index = Number(selected);
  const found = Number.isInteger(index) && index >= 1 && index <= models.length
    ? models[index - 1]
    : models.find(m => m.id === selected);
  if (!found) throw new Error('Model tidak ditemukan. Pilih nomor/ID yang tampil di daftar, bukan nomor menu utama.');
  model = found.id;
  console.log('Model aktif: ' + model);
}
async function main() {
  while (true) {
    header();
    console.log(' Model aktif: ' + (model || '(belum dipilih)'));
    console.log('\n [1] Cek layanan online');
    console.log(' [2] Daftar model/API');
    console.log(' [3] Chat AI dari terminal');
    console.log(' [4] Ubah URL layanan');
    console.log(' [5] Ganti API key');
    console.log(' [6] Buka dashboard web');
    console.log(' [7] Detail model dan kapasitas');
    console.log(' [8] Jalankan Combo (gabungan model)');
    console.log(' [9] Kelola Combo di dashboard');
    console.log(' [10] Buka Kiro Web');
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
        const models = await loadModels();
        console.log('\nJumlah model: ' + models.length);
        if (!models.length) console.log('Daftar kosong. Periksa provider dan kredensial aktif di dashboard.');
        models.forEach((m, i) => console.log(' [' + (i + 1) + '] ' + m.id + ' | provider: ' + value(m.owned_by, m.provider)));
        const selected = await ask('\nPilih nomor/ID untuk menjadikan model aktif (Enter = tidak mengubah): ');
        if (selected) {
          const index = Number(selected);
          const found = Number.isInteger(index) && index >= 1 && index <= models.length ? models[index - 1] : models.find(m => m.id === selected);
          if (!found) throw new Error('Pilihan tidak cocok dengan ID model dari API.');
          model = found.id;
          console.log('Model aktif: ' + model);
        }
      } else if (choice === '3') {
        await ensureKey();
        if (!model) await chooseModel();
        if (!model) throw new Error('Belum memilih model. Gunakan menu 2 dan pilih model yang benar-benar terdaftar.');
        const messages = [];
        console.log('Chat aktif dengan model ' + model + '. Ketik /keluar untuk kembali ke menu.');
        while (true) {
          const prompt = await ask('\nAnda: ');
          if (prompt === '/keluar') break;
          if (!prompt) continue;
          messages.push({ role: 'user', content: prompt });
          try {
            const data = await request('/api/v1/chat/completions', {
              method: 'POST',
              body: JSON.stringify({ model, messages, stream: false })
            });
            const answer = data?.choices?.[0]?.message?.content ?? data?.output_text;
            if (answer == null) throw new Error('Respons API tidak memuat teks jawaban.');
            const output = Array.isArray(answer) ? answer.map(x => x.text || '').join('') : String(answer);
            console.log('\nAI (' + model + '): ' + output);
            messages.push({ role: 'assistant', content: output });
          } catch (err) {
            messages.pop();
            console.log('\nGagal mengirim pesan: ' + err.message);
            if (/No active credentials|No credentials for provider/i.test(err.message)) {
              console.log('Perbaikan: buka dashboard > Penyedia/Koneksi, aktifkan kredensial untuk provider model ini, lalu perbarui daftar model.');
            } else if (/401|403|unauthorized|invalid api key/i.test(err.message)) {
              console.log('Periksa API key Max Router. Jangan masukkan angka nomor menu sebagai API key.');
            }
          }
        }
      } else if (choice === '4') {
        const value = await ask('URL dasar baru: ');
        if (!/^https?:\/\//i.test(value)) throw new Error('URL harus diawali http:// atau https://');
        baseUrl = value.replace(/\/+$/, '');
        model = '';
        modelsCache = [];
      } else if (choice === '5') {
        apiKey = '';
        modelsCache = [];
        model = '';
        await ensureKey();
        console.log('API key diganti untuk sesi ini.');
      } else if (choice === '6') {
        const { exec } = require('node:child_process');
        const { platform } = require('node:process');
        const command = platform === 'win32' ? 'start "" "' + baseUrl + '"' : platform === 'darwin' ? 'open "' + baseUrl + '"' : 'xdg-open "' + baseUrl + '"';
        exec(command);
      } else if (choice === '8') {
        await ensureKey();
        const allModels = await loadModels();
        const combos = allModels.filter(m => String(m.owned_by || '').toLowerCase() === 'combo' || String(m.kind || '').toLowerCase() === 'combo');
        console.log('\\nCombo yang tersedia: ' + combos.length);
        if (!combos.length) {
          console.log('Belum ada Combo aktif yang muncul di API. Buka menu 9 untuk membuat atau mengatur Combo dahulu.');
        } else {
          combos.forEach((m, i) => console.log(' [' + (i + 1) + '] ' + m.id));
          const selected = await ask('\\nPilih nomor Combo atau ID Combo (Enter = batal): ');
          if (selected) {
            const index = Number(selected);
            const chosen = Number.isInteger(index) && index >= 1 && index <= combos.length ? combos[index - 1] : combos.find(m => m.id === selected);
            if (!chosen) throw new Error('Combo tidak ditemukan pada daftar API.');
            model = chosen.id;
            const messages = [];
            console.log('Combo aktif: ' + model + '. Router akan menjalankan strategi Combo yang tersimpan di dashboard. Ketik /keluar untuk berhenti.');
            while (true) {
              const prompt = await ask('\\nAnda: ');
              if (prompt === '/keluar') break;
              if (!prompt) continue;
              messages.push({ role: 'user', content: prompt });
              try {
                const data = await request('/api/v1/chat/completions', { method: 'POST', body: JSON.stringify({ model, messages, stream: false }) });
                const answer = data?.choices?.[0]?.message?.content ?? data?.output_text;
                if (answer == null) throw new Error('Respons API tidak memuat teks jawaban.');
                const output = Array.isArray(answer) ? answer.map(x => x.text || '').join('') : String(answer);
                console.log('\\nAI (Combo ' + model + '): ' + output);
                messages.push({ role: 'assistant', content: output });
              } catch (err) {
                messages.pop();
                console.log('\\nGagal menjalankan Combo: ' + err.message);
                if (/No active credentials|No credentials for provider/i.test(err.message)) console.log('Aktifkan kredensial provider yang dipakai anggota Combo melalui dashboard, lalu coba lagi.');
              }
            }
          }
        }
      } else if (choice === '9') {
        const { exec } = require('node:child_process');
        const { platform } = require('node:process');
        const url = baseUrl + '/combos';
        const command = platform === 'win32' ? 'start "" "' + url + '"' : platform === 'darwin' ? 'open "' + url + '"' : 'xdg-open "' + url + '"';
        exec(command);
        console.log('Membuka pengelola Combo Max Router: ' + url);
      } else if (choice === '10') {
        const { exec } = require('node:child_process');
        const { platform } = require('node:process');
        const url = 'https://app.kiro.dev/';
        const command = platform === 'win32' ? 'start "" "' + url + '"' : platform === 'darwin' ? 'open "' + url + '"' : 'xdg-open "' + url + '"';
        exec(command);
        console.log('Membuka Kiro Web. Hubungkan repositori GitHub di pengaturan Kiro jika ingin meminta Kiro membantu mengubah kode Max Router.');
        console.log('Catatan: pengaturan Combo live tetap dilakukan di dashboard Max Router, bukan di Kiro Web.');
      } else if (choice === '7') {
        const models = await loadModels();
        if (!models.length) console.log('Tidak ada data model. Periksa provider aktif di dashboard.');
        models.forEach(showModel);
        if (models.length) {
          const selected = await ask('\nNomor model untuk melihat detail (Enter = batal): ');
          if (selected) {
            const index = Number(selected);
            const found = Number.isInteger(index) && index >= 1 && index <= models.length ? models[index - 1] : models.find(m => m.id === selected);
            if (!found) throw new Error('Model tidak ditemukan.');
            showModel(found, models.indexOf(found));
          }
        }
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
