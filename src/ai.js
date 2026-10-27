'use strict';
// AI 연결: Gemini(기본) / Claude / OpenAI 중 config.json의 aiProvider로 골라요.
// 어느 쪽이든 {"ko": "...", "ja": "..."} 형태의 답을 받아요.

// 앞 모델이 혼잡(503)하거나 한도 초과(429)면 다음 모델로 넘어가요.
const DEFAULT_MODELS = {
  gemini: ['gemini-3.6-flash', 'gemini-3.5-flash-lite', 'gemini-3.8-flash'],
  claude: ['claude-haiku-5-5'],
  openai: ['gpt-5-mini'],
};
const RETRY_STATUS = [429, 500, 503];
const TIMEOUT_MS = 10000; // 10초 안에 답이 없으면 다음 모델로

// Gemini 3 계열은 답하기 전에 '생각'을 해서 느려요. 짧은 대화엔 최소로만.
function geminiThinking(model) {
  if (!model.startsWith('gemini-3')) return undefined;
  return { thinkingLevel: model.startsWith('gemini-3.8') ? 'low' : 'minimal' };
}

// messages: [{ role: 'user' | 'assistant', text }]
const PROVIDERS = {
  async gemini({ key, model, system, messages }) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.text }] })),
        generationConfig: { responseMimeType: 'application/json', thinkingConfig: geminiThinking(model) },
      }),
    });
    const data = await readJson(res);
    return (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
  },

  async claude({ key, model, system, messages }) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        system,
        messages: messages.map((m) => ({ role: m.role, content: m.text })),
      }),
    });
    const data = await readJson(res);
    return (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  },

  async openai({ key, model, system, messages }) {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        response_format: { type: 'json_object' },
        messages: [{ role: 'system', content: system }, ...messages.map((m) => ({ role: m.role, content: m.text }))],
      }),
    });
    const data = await readJson(res);
    return data.choices?.[0]?.message?.content || '';
  },
};

async function readJson(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data.error?.message || JSON.stringify(data).slice(0, 200);
    const err = new Error(`${res.status} ${msg}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

// 모델이 코드블록(```json)으로 감싸거나 형식을 어겨도 최대한 ko/ja를 꺼내요.
function parseReply(text) {
  const cleaned = text.replace(/```(?:json)?/g, '').trim();
  try {
    const obj = JSON.parse(cleaned.slice(cleaned.indexOf('{'), cleaned.lastIndexOf('}') + 1));
    if (obj.ko) return { ko: String(obj.ko), ja: String(obj.ja || '') };
  } catch { /* 아래로 */ }
  return { ko: cleaned, ja: '' };
}

async function ask(cfg, { system, messages }) {
  const provider = cfg.aiProvider in PROVIDERS ? cfg.aiProvider : 'gemini';
  const key = cfg.apiKeys[provider];
  if (!key) throw new Error(`config.json의 apiKeys.${provider}에 API 키를 넣어 주세요.`);
  let models = cfg.models[provider] ? [cfg.models[provider]] : DEFAULT_MODELS[provider];
  // 직전에 성공한 모델부터 시도 (혼잡한 모델에서 매번 기다리지 않게)
  const last = lastGood[provider];
  if (models.includes(last)) models = [last, ...models.filter((m) => m !== last)];
  let lastErr;
  for (const model of models) {
    try {
      const raw = await PROVIDERS[provider]({ key, model, system, messages });
      lastGood[provider] = model;
      return { ...parseReply(raw), model };
    } catch (err) {
      lastErr = err.name === 'TimeoutError' ? new Error(`${model} 응답 시간 초과`) : err;
      if (err.name !== 'TimeoutError' && !RETRY_STATUS.includes(err.status)) break;
      console.warn(`[ai] ${model} 실패(${err.status || '시간 초과'}), 다음 모델로 시도`);
    }
  }
  throw lastErr;
}
const lastGood = {};

function hasKey(cfg) {
  return Boolean(cfg.apiKeys[cfg.aiProvider in PROVIDERS ? cfg.aiProvider : 'gemini']);
}

module.exports = { ask, hasKey, DEFAULT_MODELS };
