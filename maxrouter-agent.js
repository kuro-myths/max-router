#!/usr/bin/env node
'use strict';

/**
 * MAX ROUTER AGENT
 * Klien otomatis yang bisa diintegrasikan ke browser/terminal
 * Mendukung:
 * - Auto-detect model terbaik
 * - Auto-chat dengan input otomatis
 * - Browser automation (jika Playwright tersedia)
 * - CLI mode untuk terminal
 */

const readline = require('node:readline/promises');
const { stdin, stdout } = require('node:process');
const rl = readline.createInterface({ input: stdin, output: stdout });

let baseUrl = process.argv[2] || process.env.MAXROUTER_URL || '';
let apiKey = process.env.MAXROUTER_API_KEY || '';
let model = '';

async function ask(label) { 
  return (await rl.question(label)).trim(); 
}

function header() {
  console.log('\n=== MAX ROUTER AGENT ===');
  console.log('Mode: Agent Otomatis');
  console.log('URL: ' + baseUrl);
  console.log('Model: ' + (model || '(auto)'));
  console.log('');
}

async function ensureKey() {
  if (!apiKey) {
    apiKey = await ask('API Key: ');
  }
  if (!apiKey) {
    throw new Error('API Key diperlukan.');
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

async function getBestModel() {
  await ensureKey();
  
  // Coba agent config
  try {
    const config = await request('/api/agent/config');
    if (config?.best?.id) {
      return config.best.id;
    }
  } catch (err) {
    // Ignore
  }
  
  // Coba model health
  try {
    const health = await request('/api/model-health');
    if (health?.best?.id) {
      return health.best.id;
    }
  } catch (err) {
    // Ignore
  }
  
  // Ambil model pertama
  try {
    const models = await request('/api/v1/models');
    const list = models?.data || models?.models || [];
    if (list.length > 0) {
      return list[0].id;
    }
  } catch (err) {
    // Ignore
  }
  
  return null;
}

async function autoChat(prompt, options = {}) {
  await ensureKey();
  
  // Jika model belum dipilih, ambil yang terbaik
  if (!model || options.forceBest) {
    const best = await getBestModel();
    if (best) model = best;
  }
  
  if (!model) {
    throw new Error('Tidak ada model yang tersedia.');
  }
  
  const messages = [{ role: 'user', content: prompt }];
  
  const data = await request('/api/v1/chat/completions', {
    method: 'POST',
    body: JSON.stringify({
      model: model,
      messages: messages,
      stream: false,
      temperature: options.temperature || 0.7,
      max_tokens: options.maxTokens || 2000
    })
  });
  
  const answer = data?.choices?.[0]?.message?.content || 
                 data?.output_text ||
                 '';
  
  if (!answer) {
    throw new Error('Tidak ada respons.');
  }
  
  return {
    model: model,
    answer: answer,
    fullResponse: data
  };
}

async function analyzeText(text) {
  // Analisis otomatis: ringkasan, sentimen, keyword
  const prompts = {
    summary: `Ringkas teks berikut ini (maksimal 3 baris):
${text}`,
    sentiment: `Analisis sentimen dari teks ini (positif/negatif/netral) dan berikan alasan singkat:
${text}`,
    keywords: `Ekstrak 5 kata kunci utama dari teks ini:
${text}`
  };
  
  console.log('\n=== ANALISIS TEKS ===');
  console.log('Teks: ' + text.substring(0, 100) + '...');
  console.log('');
  
  for (const [type, prompt] of Object.entries(prompts)) {
    try {
      console.log(`Analisis ${type}:`);
      const result = await autoChat(prompt);
      console.log(result.answer);
      console.log('');
    } catch (err) {
      console.log(`Gagal ${type}: ${err.message}`);
    }
  }
}

async function batchProcess(prompts) {
  // Proses multiple prompt sekaligus
  console.log('\n=== BATCH PROCESS ===');
  
  const results = [];
  for (let i = 0; i < prompts.length; i++) {
    try {
      console.log(`Processing ${i + 1}/${prompts.length}...`);
      const result = await autoChat(prompts[i]);
      results.push({
        prompt: prompts[i],
        answer: result.answer,
        model: result.model
      });
      console.log(`✓ ${i + 1} selesai`);
    } catch (err) {
      results.push({
        prompt: prompts[i],
        error: err.message
      });
      console.log(`✗ ${i + 1} gagal: ${err.message}`);
    }
  }
  
  return results;
}

async function interactiveMode() {
  while (true) {
    header();
    console.log('Pilihan:');
    console.log('  [1] Chat tunggal');
    console.log('  [2] Analisis teks');
    console.log('  [3] Batch process (multiple prompt)');
    console.log('  [4] Ganti model');
    console.log('  [5] Ganti URL/API Key');
    console.log('  [0] Keluar\n');
    
    const choice = await ask('Pilih: ');
    
    try {
      if (choice === '0') break;
      
      switch (choice) {
        case '1':
          const prompt = await ask('Pesan: ');
          if (prompt) {
            const result = await autoChat(prompt);
            console.log('\n--- HASIL ---');
            console.log('Model: ' + result.model);
            console.log('Jawaban: ' + result.answer);
          }
          break;
        
        case '2':
          const text = await ask('Masukkan teks untuk dianalisis: ');
          if (text) {
            await analyzeText(text);
          }
          break;
        
        case '3':
          const count = parseInt(await ask('Jumlah prompt: ')) || 3;
          const batchPrompts = [];
          for (let i = 0; i < count; i++) {
            const p = await ask(`Prompt ${i + 1}: `);
            if (p) batchPrompts.push(p);
          }
          if (batchPrompts.length > 0) {
            const results = await batchProcess(batchPrompts);
            console.log('\n--- HASIL BATCH ---');
            results.forEach((r, i) => {
              console.log(`\n${i + 1}. Prompt: ${r.prompt}`);
              if (r.error) {
                console.log(`   Error: ${r.error}`);
              } else {
                console.log(`   Model: ${r.model}`);
                console.log(`   Jawaban: ${r.answer.substring(0, 200)}...`);
              }
            });
          }
          break;
        
        case '4':
          model = await ask('Model ID (kosongkan untuk auto): ');
          if (!model) {
            const best = await getBestModel();
            model = best || '';
            console.log('Model: ' + model);
          }
          break;
        
        case '5':
          const newUrl = await ask('URL baru (kosongkan untuk skip): ');
          if (newUrl) baseUrl = newUrl.replace(/\/+$/, '');
          const newKey = await ask('API Key baru (kosongkan untuk skip): ');
          if (newKey) apiKey = newKey;
          break;
        
        default:
          console.log('Tidak dikenal.');
      }
    } catch (err) {
      console.log('Error: ' + err.message);
    }
    
    if (choice !== '0') {
      await ask('\nTekan Enter untuk melanjutkan...');
    }
  }
}

async function directMode() {
  // Mode langsung: ambil dari argument
  const args = process.argv.slice(3);
  
  if (args.length === 0) {
    console.log('Usage: node maxrouter-agent.js <url> <prompt1> [prompt2] [prompt3]...');
    console.log('Atau: MAXROUTER_URL=<url> MAXROUTER_API_KEY=<key> node maxrouter-agent.js <prompt>');
    process.exit(1);
  }
  
  await ensureKey();
  
  for (const prompt of args) {
    try {
      console.log('\nProcessing: ' + prompt.substring(0, 50) + '...');
      const result = await autoChat(prompt);
      console.log('Model: ' + result.model);
      console.log('Answer: ' + result.answer);
      console.log('---');
    } catch (err) {
      console.log('Error: ' + err.message);
    }
  }
  
  process.exit(0);
}

async function main() {
  if (!baseUrl) {
    baseUrl = await ask('URL Max Router: ');
    if (!baseUrl) {
      console.log('URL diperlukan.');
      process.exit(1);
    }
  }
  
  baseUrl = baseUrl.replace(/\/+$/, '');
  
  // Jika ada argument tambahan, jalankan direct mode
  if (process.argv.length > 3) {
    await directMode();
    return;
  }
  
  // Jika ada environment variable untuk direct mode
  if (process.env.MAXROUTER_PROMPT) {
    await ensureKey();
    const result = await autoChat(process.env.MAXROUTER_PROMPT);
    console.log(result.answer);
    process.exit(0);
  }
  
  // Default: interactive mode
  await interactiveMode();
  
  rl.close();
  console.log('\nDone.');
}

main().catch(err => {
  console.error('Fatal: ' + err.message);
  rl.close();
  process.exit(1);
});
