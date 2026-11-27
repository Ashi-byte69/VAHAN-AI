import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDirectory = path.join(here, '../data');
const dataFile = path.join(dataDirectory, 'workspace.json');
const envFile = path.join(here, '../.env');
const supportedLanguages = new Set(['English', 'Hindi', 'Kannada', 'Telugu', 'Tamil']);
const supportedPhotoKinds = new Set(['Dashboard warning', 'Service bill', 'Insurance document', 'Fuel receipt']);
const aiRequestCounts = new Map();
let model = 'gemini-2.0-flash-lite';
const port = Number(process.env.PORT || 4000);
let saveQueue = Promise.resolve();

async function loadLocalEnvironment() {
  try {
    const source = await readFile(envFile, 'utf8');
    for (const line of source.split(/\r?\n/)) {
      const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (!match || process.env[match[1]]) continue;
      let value = match[2];
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      } else {
        value = value.replace(/\s+#.*$/, '');
      }
      process.env[match[1]] = value;
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

await loadLocalEnvironment();
model = process.env.GEMINI_MODEL || model;

function sendJson(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

async function readWorkspace() {
  try {
    return JSON.parse(await readFile(dataFile, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function readRequestBody(req, maxBytes = 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw Object.assign(new Error('Request is too large.'), { status: 413 });
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw Object.assign(new Error('Send valid JSON.'), { status: 400 });
  }
}

function checkAiRateLimit(req) {
  const ip = req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const bucket = aiRequestCounts.get(ip);
  if (!bucket || now - bucket.startedAt >= 60_000) {
    aiRequestCounts.set(ip, { startedAt: now, count: 1 });
    return true;
  }
  bucket.count += 1;
  return bucket.count <= 12;
}

async function generateText(input, instructions) {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw Object.assign(new Error('Add GEMINI_API_KEY to server/.env to turn on live AI.'), { status: 503 });

  const firstUserMessage = input.findIndex(message => message.role === 'user');
  const conversation = firstUserMessage === -1 ? input : input.slice(firstUserMessage);
  const contents = conversation.map(message => ({
    role: message.role === 'assistant' ? 'model' : 'user',
    parts: typeof message.content === 'string'
      ? [{ text: message.content }]
      : message.content.map(part => {
          if (part.type === 'input_image') {
            const separator = part.image_url.indexOf(',');
            const mimeType = part.image_url.slice(5, part.image_url.indexOf(';'));
            return { inline_data: { mime_type: mimeType, data: part.image_url.slice(separator + 1) } };
          }
          return { text: part.text };
        }),
  }));

  let response;
  try {
    response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'x-goog-api-key': apiKey, 'content-type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: instructions }] },
        contents,
        generationConfig: { maxOutputTokens: 600 },
      }),
      signal: AbortSignal.timeout(45_000),
    });
  } catch {
    throw Object.assign(new Error('Vahan AI could not reach Google Gemini. Try again.'), { status: 502 });
  }

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error(`Gemini request returned HTTP ${response.status}.`);
    if (response.status === 429) throw Object.assign(new Error('Gemini’s free-tier limit was reached or the service is busy. Wait a little and try again.'), { status: 429 });
    throw Object.assign(new Error('Gemini could not complete that request. Check the server key and model.'), { status: 502 });
  }
  const text = (result.candidates?.[0]?.content?.parts || [])
    .filter(part => typeof part.text === 'string')
    .map(part => part.text)
    .join('\n')
    .trim();
  if (!text) throw Object.assign(new Error('The AI service returned an empty answer. Try again.'), { status: 502 });
  return text;
}

function saveWorkspace(workspace) {
  const save = saveQueue.then(async () => {
    await mkdir(dataDirectory, { recursive: true });
    await writeFile(dataFile, `${JSON.stringify(workspace, null, 2)}\n`, 'utf8');
  });
  saveQueue = save.catch(() => {});
  return save;
}

const server = createServer(async (req, res) => {
  const requestUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'GET' && requestUrl.pathname === '/api/health') {
    return sendJson(res, 200, { status: 'ok', storage: 'local shared demo file', aiConfigured: Boolean(process.env.GEMINI_API_KEY), model });
  }

  if (req.method === 'POST' && ['/api/assistant', '/api/photo-analysis'].includes(requestUrl.pathname)) {
    try {
      if (!checkAiRateLimit(req)) return sendJson(res, 429, { error: 'Too many AI requests. Please wait a minute and try again.' });
      const body = await readRequestBody(req, requestUrl.pathname === '/api/photo-analysis' ? 7 * 1024 * 1024 : 1024 * 1024);
      if (!body || typeof body !== 'object' || Array.isArray(body)) return sendJson(res, 400, { error: 'Send valid request details to Vahan AI.' });
      const language = supportedLanguages.has(body.language) ? body.language : 'English';
      const vehicle = typeof body.vehicle === 'string' ? body.vehicle.slice(0, 100) : 'vehicle';

      if (requestUrl.pathname === '/api/assistant') {
        const messages = Array.isArray(body.messages)
          ? body.messages.filter(item => item && ['user', 'assistant'].includes(item.role) && typeof item.content === 'string').slice(-12)
          : [];
        if (!messages.length || messages.at(-1).role !== 'user') {
          return sendJson(res, 400, { error: 'Send a vehicle question to Vahan AI.' });
        }
        if (messages.some(item => item.content.length > 2000)) {
          return sendJson(res, 400, { error: 'Each message must be under 2,000 characters.' });
        }
        const instructions = `You are Vahan AI, a helpful vehicle-care assistant for drivers in India. Reply in ${language}. Vehicle context: ${vehicle}. Give clear, practical, cautious information. Do not claim to diagnose a vehicle or replace a qualified mechanic. If a user describes a red safety warning, brake or steering failure, overheating, smoke, or loss of control, advise them to stop safely and seek professional help. Do not invent live challan records, insurance status, prices, or official results.`;
        const text = await generateText(messages.map(item => ({ role: item.role, content: item.content })), instructions);
        return sendJson(res, 200, { text });
      }

      const { kind, imageDataUrl } = body;
      const validImage = typeof imageDataUrl === 'string' && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(imageDataUrl);
      if (!supportedPhotoKinds.has(kind) || !validImage || imageDataUrl.length > 7_100_000) {
        return sendJson(res, 400, { error: 'Choose a JPEG, PNG, or WebP image under 5 MB and a supported photo type.' });
      }
      const instructions = `You are Vahan AI, a cautious vehicle-care assistant for drivers in India. Reply in ${language}. The image is labelled: ${kind}. Vehicle context: ${vehicle}. Describe only what is visible, distinguish uncertain readings from clear ones, and never claim to diagnose. For dashboard warnings, explain plausible meanings cautiously and advise a qualified mechanic for safety-critical issues. For bills, receipts, or documents, summarize only clearly legible details and mark uncertain text as unclear. Do not claim the document or policy is verified.`;
      const text = await generateText([{
        role: 'user',
        content: [
          { type: 'input_text', text: `Please review this ${kind.toLowerCase()} for my vehicle.` },
          { type: 'input_image', image_url: imageDataUrl, detail: 'high' },
        ],
      }], instructions);
      return sendJson(res, 200, { text });
    } catch (error) {
      const status = error.status || 502;
      if (!error.status || status >= 500) console.error('Vahan AI request failed:', error.message);
      return sendJson(res, status, { error: error.message || 'Vahan AI could not complete that request.' });
    }
  }

  if (req.method === 'GET' && requestUrl.pathname === '/api/state') {
    try {
      return sendJson(res, 200, { state: await readWorkspace() });
    } catch (error) {
      console.error('Could not read Vahan AI data:', error.message);
      return sendJson(res, 500, { error: 'Could not read the saved Vahan AI data.' });
    }
  }

  if (req.method === 'PUT' && requestUrl.pathname === '/api/state') {
    try {
      const workspace = await readRequestBody(req);
      if (
        !workspace ||
        !Array.isArray(workspace.vehicles) ||
        !Array.isArray(workspace.history) ||
        typeof workspace.activeId !== 'string' ||
        !workspace.profile || typeof workspace.profile !== 'object' || Array.isArray(workspace.profile)
      ) {
        return sendJson(res, 400, { error: 'Workspace data is missing required fields.' });
      }
      await saveWorkspace(workspace);
      return sendJson(res, 200, { saved: true });
    } catch (error) {
      const status = error.status || 500;
      if (status === 500) console.error('Could not save Vahan AI data:', error.message);
      return sendJson(res, status, { error: status === 500 ? 'Could not save Vahan AI data.' : error.message });
    }
  }

  return sendJson(res, 404, { error: 'Vahan AI API route not found.' });
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Vahan AI API ready at http://localhost:${port}`);
  console.log('Shared demo data will be saved in server/data/workspace.json');
});
