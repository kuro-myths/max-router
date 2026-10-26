#!/usr/bin/env node
'use strict';

const readline = require('node:readline/promises');
const { stdin, stdout } = require('node:process');
const rl = readline.createInterface({ input: stdin, output: stdout });

// Ambil URL dari argument atau environment
let baseUrl = process.argv[2] || process.env.MAXROUTER_URL || '';
let apiKey = process.env.MAXROUTER_API_KEY || '';
let model = '';

async function ask(label) { 
  return (await rl.question(label)).trim(); 
}

function header() {
  console.clear();
  console.log('\n=== MAX ROUTER TERMINAL AGENT ===');
  console.log('Mode: Terminal Agent - Akses langsung ke Max Router');
  console.log('URL: ' + baseUrl + '\n');
}

async function ensureKey() {
  if (!apiKey) {
    apiKey = await ask('API Key (dari Dashboard > API Keys): ');
  }
  if (!apiKey) {
    throw new Error('API Key diperlukan. Dapatkan dari Dashboard Max Router.');
  }
}

async function request(path, options = {}) {
  const headers = { Accept: 'application/json', ...(options.headers || {}) };
  if (apiKey) {
    headers.Authorization = 'Bearer ' + apiKey;
  }
  if (options.body) {
    headers['Content-Type'] = 'application/json';
  }
  
  const response = await fetch(baseUrl + path, { 
    ...options, 
    headers, 
    signal: AbortSignal.timeout(60000) 
  });
  
  const raw = await response.text();
  let data;
  try { 
    data = raw ? JSON.parse(raw) : {}; 
  } catch { 
    data = raw; 
  }
  
  if (!response.ok) {
    const detail = typeof data === 'string' ? data.slice(0, 500) : 
      (data?.error?.message || data?.error || data?.message || JSON.stringify(data));
    throw new Error('HTTP ' + response.status + ': ' + detail);
  }
  return data;
}

async function getAgentConfig() {
  await ensureKey();
  try {
    const config = await request('/api/agent/config');
    return config;
  } catch (err) {
    // Jika endpoint tidak ada, coba endpoint alternatif
    console.log('Note: /api/agent/config tidak tersedia, mencoba endpoint standar...');
    return null;
  }
}

async function loadModels() {
  await ensureKey();
  try {
    const data = await request('/api/v1/models', { headers: { 'Cache-Control': 'no-cache' } });
    const models = [];
    
    if (Array.isArray(data?.data)) {
      data.data.forEach(m => {
        if (m && m.id) models.push(m);
      });
    } else if (Array.isArray(data?.models)) {
      data.models.forEach(m => {
        if (m && m.id) models.push(m);
      });
    }
    
    return models;
  } catch (err) {
    console.log('Warning: Gagal memuat model: ' + err.message);
    return [];
  }
}

async function getBestModel() {
  try {
    const config = await getAgentConfig();
    if (config?.best?.id) {
      return config.best.id;
    }
  } catch (err) {
    // Ignore error, try other methods
  }
  
  // Coba ambil dari model health
  try {
    const health = await request('/api/model-health');
    if (health?.best?.id) {
      return health.best.id;
    }
  } catch (err) {
    // Ignore
  }
  
  return null;
}

async function selectModel() {
  const models = await loadModels();
  
  if (!models.length) {
    console.log('Tidak ada model tersedia. Periksa Dashboard > Penyedia.');
    return null;
  }
  
  console.log('\n=== Model Tersedia ===');
  models.forEach((m, i) => {
    const provider = m.owned_by || m.provider || 'unknown';
    console.log('[' + (i + 1) + '] ' + m.id + ' (' + provider + ')');
  });
  
  const selected = await ask('\nPilih nomor model (Enter = gunakan yang terbaik): ');
  
  if (!selected) {
    const best = await getBestModel();
    if (best) {
      console.log('Menggunakan model terbaik: ' + best);
      return best;
    }
    return null;
  }
  
  const index = parseInt(selected) - 1;
  if (index >= 0 && index < models.length) {
    return models[index].id;
  }
  
  // Coba cari by ID
  const found = models.find(m => m.id === selected);
  if (found) {
    return found.id;
  }
  
  console.log('Model tidak ditemukan.');
  return null;
}

async function chatSession() {
  await ensureKey();
  
  if (!model) {
    model = await selectModel();
    if (!model) {
      console.log('Tidak ada model yang dipilih.');
      return;
    }
  }
  
  console.log('\n=== CHAT MODE ===');
  console.log('Model: ' + model);
  console.log('Ketik /keluar untuk kembali, /ganti untuk ganti model\n');
  
  const messages = [];
  
  while (true) {
    const prompt = await ask('Anda: ');
    
    if (prompt === '/keluar') break;
    if (prompt === '/ganti') {
      model = await selectModel();
      if (model) {
        console.log('Model diganti: ' + model);
      }
      continue;
    }
    if (!prompt) continue;
    
    messages.push({ role: 'user', content: prompt });
    
    try {
      console.log('\nAI: ');
      const data = await request('/api/v1/chat/completions', {
        method: 'POST',
        body: JSON.stringify({
          model: model,
          messages: messages,
          stream: false
        })
      });
      
      const answer = data?.choices?.[0]?.message?.content || 
                     data?.output_text || 
                     data?.completion ||
                     '';
      
      if (!answer) {
        throw new Error('Tidak ada respons dari AI.');
      }
      
      // Print answer
      if (typeof answer === 'string') {
        console.log(answer);
      } else if (Array.isArray(answer)) {
        console.log(answer.map(a => a.text || '').join(''));
      } else {
        console.log(String(answer));
      }
      
      messages.push({ role: 'assistant', content: answer });
      
    } catch (err) {
      messages.pop();
      console.log('\nError: ' + err.message);
      
      if (err.message.includes('401') || err.message.includes('403')) {
        console.log('Periksa API Key. Pastikan valid dan memiliki akses.');
      } else if (err.message.includes('No active credentials')) {
        console.log('Provider tidak memiliki kredensial aktif. Periksa Dashboard > Penyedia.');
      }
    }
    
    console.log('');
  }
}

async function checkHealth() {
  try {
    const health = await request('/api/health');
    console.log('Status: OK');
    console.log('Health check berhasil.');
    
    // Coba ambil info model health
    try {
      const modelHealth = await request('/api/model-health');
      if (modelHealth?.summary) {
        console.log('\n=== Ringkasan Model ===');
        for (const [provider, info] of Object.entries(modelHealth.summary)) {
          const status = info.status || 'unknown';
          const count = info.count || 0;
          console.log(`  ${provider}: ${status} (${count} model)`);
        }
      }
      
      if (modelHealth?.best) {
        console.log('\nModel Terbaik: ' + modelHealth.best.id);
        console.log('  Provider: ' + (modelHealth.best.provider || modelHealth.best.owned_by));
        console.log('  Score: ' + (modelHealth.best.score || 'N/A'));
      }
    } catch (e) {
      // Ignore model health error
    }
    
  } catch (err) {
    console.log('Health check gagal: ' + err.message);
    
    // Coba cek dashboard
    try {
      const res = await fetch(baseUrl, { signal: AbortSignal.timeout(10000) });
      console.log('Dashboard HTTP: ' + res.status);
    } catch (e) {
      console.log('Dashboard tidak dapat diakses: ' + e.message);
    }
  }
}

async function listModels() {
  await ensureKey();
  const models = await loadModels();
  
  console.log('\n=== Daftar Model (' + models.length + ') ===');
  
  if (!models.length) {
    console.log('Tidak ada model. Periksa Dashboard > Penyedia.');
    return;
  }
  
  models.forEach((m, i) => {
    const provider = m.owned_by || m.provider || 'unknown';
    const context = m.context_window || m.contextWindow || m.max_context || 'N/A';
    const price = m.pricing || m.priceClass || 'N/A';
    console.log((i + 1) + '. ' + m.id);
    console.log('   Provider: ' + provider);
    console.log('   Context: ' + context);
    console.log('   Price: ' + price);
    console.log('');
  });
}

async function showAgentConfig() {
  await ensureKey();
  try {
    const config = await getAgentConfig();
    if (config) {
      console.log('\n=== Agent Config ===');
      console.log('Service: ' + config.service);
      console.log('Generated: ' + config.generatedAt);
      console.log('\nBest Model:');
      if (config.best) {
        console.log('  ID: ' + config.best.id);
        console.log('  Provider: ' + (config.best.provider || config.best.owned_by));
        console.log('  Score: ' + config.best.score);
      } else {
        console.log('  (Tidak ada model terbaik)');
      }
      console.log('\nHint: ' + config.hint);
      console.log('\nEndpoints:');
      console.log('  Chat: ' + config.agent?.chatEndpoint);
      console.log('  Models: ' + config.agent?.modelsEndpoint);
    } else {
      console.log('Agent config tidak tersedia.');
    }
  } catch (err) {
    console.log('Gagal memuat config: ' + err.message);
  }
}

async function autoMode() {
  // Mode otomatis: langsung ambil model terbaik dan mulai chat
  await ensureKey();
  
  console.log('\n=== MODE OTOMATIS ===');
  console.log('Mencari model terbaik...\n');
  
  try {
    const bestModel = await getBestModel();
    if (bestModel) {
      model = bestModel;
      console.log('Model terbaik ditemukan: ' + model);
    } else {
      console.log('Tidak ada model terbaik. Memuat daftar model...');
      const models = await loadModels();
      if (models.length > 0) {
        model = models[0].id;
        console.log('Menggunakan model pertama: ' + model);
      } else {
        throw new Error('Tidak ada model yang tersedia.');
      }
    }
    
    console.log('Memulai chat otomatis...\n');
    await chatSession();
    
  } catch (err) {
    console.log('Gagal mode otomatis: ' + err.message);
    await ask('\nTekan Enter untuk kembali ke menu...');
  }
}

async function quickChat() {
  // Chat cepat: langsung chat tanpa menu
  await ensureKey();
  
  if (!model) {
    const bestModel = await getBestModel();
    if (bestModel) {
      model = bestModel;
      console.log('Model: ' + model);
    } else {
      const models = await loadModels();
      if (models.length > 0) {
        model = models[0].id;
        console.log('Model: ' + model);
      } else {
        console.log('Tidak ada model.');
        return;
      }
    }
  }
  
  const prompt = await ask('Pesan: ');
  if (!prompt) return;
  
  try {
    const data = await request('/api/v1/chat/completions', {
      method: 'POST',
      body: JSON.stringify({
        model: model,
        messages: [{ role: 'user', content: prompt }],
        stream: false
      })
    });
    
    const answer = data?.choices?.[0]?.message?.content || data?.output_text || '';
    if (answer) {
      console.log('\nAI: ' + answer);
    } else {
      console.log('Tidak ada respons.');
    }
  } catch (err) {
    console.log('Error: ' + err.message);
  }
}

async function main() {
  // Jika URL tidak disediakan, tanya
  if (!baseUrl) {
    baseUrl = await ask('URL Max Router (contoh: https://max-router-production.up.railway.app): ');
    if (!baseUrl) {
      console.log('URL diperlukan.');
      process.exit(1);
    }
  }
  
  // Bersihkan trailing slash
  baseUrl = baseUrl.replace(/\/+$/, '');
  
  while (true) {
    header();
    console.log('Model aktif: ' + (model || '(belum dipilih)'));
    console.log('\nMenu:');
    console.log('  [1] Cek Koneksi & Status');
    console.log('  [2] Daftar Semua Model');
    console.log('  [3] Lihat Agent Config');
    console.log('  [4] Mulai Chat');
    console.log('  [5] Mode Otomatis (auto-pilih model terbaik)');
    console.log('  [6] Quick Chat (langsung chat)');
    console.log('  [7] Ganti URL Server');
    console.log('  [8] Ganti API Key');
    console.log('  [0] Keluar\n');
    
    const choice = await ask('Pilih menu: ');
    
    try {
      if (choice === '0') break;
      
      switch (choice) {
        case '1':
          await checkHealth();
          break;
        case '2':
          await listModels();
          break;
        case '3':
          await showAgentConfig();
          break;
        case '4':
          await chatSession();
          break;
        case '5':
          await autoMode();
          break;
        case '6':
          await quickChat();
          break;
        case '7':
          baseUrl = await ask('URL baru: ');
          baseUrl = baseUrl.replace(/\/+$/, '');
          model = '';
          break;
        case '8':
          apiKey = '';
          model = '';
          await ensureKey();
          console.log('API Key diganti.');
          break;
        default:
          console.log('Menu tidak dikenal.');
      }
    } catch (err) {
      console.log('\nError: ' + err.message);
    }
    
    if (choice !== '0') {
      await ask('\nTekan Enter untuk kembali ke menu...');
    }
  }
  
  rl.close();
  console.log('\nTerima kasih menggunakan Max Router Terminal Agent.');
}

main().catch(err => {
  console.error('Fatal Error: ' + err.message);
  rl.close();
  process.exit(1);
});
