import express from 'express';
import http from 'http';
import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';
import { spawn, spawnSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Enable CORS for Android APK, Capacitor, and remote web clients
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header(
    'Access-Control-Allow-Headers',
    'Origin, X-Requested-With, Content-Type, Accept, Authorization, x-gemini-api-key'
  );
  res.header('Access-Control-Expose-Headers', 'Content-Disposition');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.json({ limit: '10mb' }));

function getGeminiClient(customApiKey?: string, timeoutMs = 12000): GoogleGenAI {
  const apiKey = (customApiKey && customApiKey.trim()) || process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.trim() === '' || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error(
      'Chưa thiết lập Gemini API Key. Bạn vui lòng mở bảng Settings > Secrets trong giao diện AI Studio để chọn khóa miễn phí hoặc nhập khóa trong Cài đặt API Key.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
      timeout: timeoutMs,
    },
  });
}

// Track model quota/overload cooldowns in-memory to skip slow/unavailable models immediately
const modelQuotaCooldown: Record<string, number> = {};

function getOrderedModels(preferredModels: string[]): string[] {
  const now = Date.now();
  const uniqueModels = Array.from(new Set(preferredModels));
  return uniqueModels.sort((a, b) => {
    const aCooldown = (modelQuotaCooldown[a] || 0) > now ? 1 : 0;
    const bCooldown = (modelQuotaCooldown[b] || 0) > now ? 1 : 0;
    return aCooldown - bCooldown;
  });
}

function recordModelCooldown(model: string, err: any) {
  const msg = err?.message || String(err);
  const isQuotaExceeded =
    msg.includes('429') ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('quota') ||
    msg.includes('limit exceeded');

  if (isQuotaExceeded) {
    let cooldownMs = 15 * 60 * 1000;
    const match = msg.match(/retry in\s+([0-9.]+)s/i) || msg.match(/"retryDelay":\s*"([0-9]+)s"/);
    if (match && match[1]) {
      const secs = parseFloat(match[1]);
      if (!isNaN(secs) && secs > 0) {
        cooldownMs = Math.min(secs * 1000, 3600 * 1000);
      }
    }
    modelQuotaCooldown[model] = Date.now() + cooldownMs;
    console.log(`[Gemini] Model ${model} hit quota limit, trying alternative model.`);
    return;
  }

  // Cooldown 503/504/timeout models for 2 minutes so subsequent requests don't stall
  modelQuotaCooldown[model] = Date.now() + 2 * 60 * 1000;
  console.log(`[Gemini] Model ${model} is busy/slow, switching to fast backup model.`);
}

// Resilient Gemini Call with Smart Model Fallback (Handles transient 503/429/504 spikes smoothly)
async function callGeminiWithFallback(params: {
  contents: any;
  config: any;
  preferredModel?: string;
  customApiKey?: string;
  thinkingLevel?: ThinkingLevel;
  timeoutMs?: number;
}): Promise<string> {
  const ai = getGeminiClient(params.customApiKey, params.timeoutMs || 12000);

  // Order fast, high-availability models from gemini_api skill
  const models = getOrderedModels([
    params.preferredModel || 'gemini-3.1-flash-lite',
    'gemini-3.1-flash-lite',
    'gemini-4-hydrogen',
  ]);

  let lastErr: any = null;

  for (const model of models) {
    try {
      const configToUse = { ...params.config };
      if (model === 'gemini-4-hydrogen') {
        configToUse.thinkingConfig = configToUse.thinkingConfig || {
          thinkingLevel: params.thinkingLevel || ThinkingLevel.MINIMAL,
        };
      } else if (configToUse.thinkingConfig) {
        delete configToUse.thinkingConfig;
      }

      const response = await ai.models.generateContent({
        model,
        contents: params.contents,
        config: configToUse,
      });

      if (response && response.text) {
        return response.text;
      }
    } catch (err: any) {
      lastErr = err;
      const msg = err?.message || String(err);

      const isAuthError =
        msg.includes('PERMISSION_DENIED') ||
        msg.includes('ACCESS_TOKEN_SCOPE_INSUFFICIENT') ||
        msg.includes('API_KEY_INVALID') ||
        msg.includes('API key should be set') ||
        msg.includes('API key not valid');

      if (isAuthError) {
        throw new Error(
          'Chưa thiết lập Gemini API Key. Bạn vui lòng mở bảng Settings > Secrets trong giao diện Google AI Studio để chọn hoặc kích hoạt khóa API miễn phí.'
        );
      }

      recordModelCooldown(model, err);
      continue;
    }
  }

  throw lastErr || new Error('Không thể nhận phản hồi từ Gemini AI. Vui lòng thử lại sau.');
}

// Endpoint: Validate Gemini API Key via lightweight ping request
app.post('/api/gemini/validate', async (req, res) => {
  try {
    const { apiKey } = req.body;
    const keyToTest = (apiKey && typeof apiKey === 'string' && apiKey.trim())
      ? apiKey.trim()
      : (req.headers['x-gemini-api-key'] as string) || process.env.GEMINI_API_KEY;

    if (!keyToTest || keyToTest === 'MY_GEMINI_API_KEY') {
      return res.status(400).json({
        valid: false,
        error: 'Khóa API không được để trống.',
      });
    }

    // Lightweight parallel race: 1 maxOutputToken to verify auth & permissions quickly without sequential 504 delays
    const testAi = new GoogleGenAI({
      apiKey: keyToTest,
      httpOptions: {
        headers: { 'User-Agent': 'aistudio-build' },
        timeout: 10000,
      },
    });

    const candidateModels = getOrderedModels([
      'gemini-4-hydrogen',
      'gemini-3.1-flash-lite',
    ]);

    try {
      const result = await Promise.any(
        candidateModels.map(async (model) => {
          const config: any = { maxOutputTokens: 1 };
          if (model === 'gemini-4-hydrogen') {
            config.thinkingConfig = { thinkingLevel: ThinkingLevel.MINIMAL };
          }
          const pingResponse = await testAi.models.generateContent({
            model,
            contents: 'ping',
            config,
          });
          if (!pingResponse) {
            throw new Error('Empty response');
          }
          return model;
        })
      );

      return res.json({
        valid: true,
        model: result,
        message: 'Khóa Gemini API hợp lệ và sẵn sàng sử dụng!',
      });
    } catch (aggErr: any) {
      const errors: any[] = Array.isArray(aggErr?.errors) ? aggErr.errors : [aggErr];
      const msgs = errors.map((e) => e?.message || String(e || ''));

      const authMsg = msgs.find(
        (m) =>
          m.includes('PERMISSION_DENIED') ||
          m.includes('ACCESS_TOKEN_SCOPE_INSUFFICIENT') ||
          m.includes('API_KEY_INVALID') ||
          m.includes('API key not valid')
      );

      let finalMsg = authMsg || msgs[0] || '';

      // If not an auth error (e.g. transient 504 DEADLINE_EXCEEDED on generateContent), verify key auth via lightweight models.list
      if (!authMsg) {
        try {
          const pager = await testAi.models.list({ config: { pageSize: 1 } });
          if (pager) {
            return res.json({
              valid: true,
              model: candidateModels[0],
              message: 'Khóa Gemini API hợp lệ và sẵn sàng sử dụng!',
            });
          }
        } catch (listErr: any) {
          finalMsg = listErr?.message || finalMsg;
        }
      }

      let friendlyError = 'Khóa API không hợp lệ hoặc thiếu quyền hạn cần thiết.';
      if (finalMsg.includes('PERMISSION_DENIED') || finalMsg.includes('ACCESS_TOKEN_SCOPE_INSUFFICIENT')) {
        friendlyError = 'Lỗi xác thực (PERMISSION_DENIED): Khóa API không có quyền truy cập Gemini API.';
      } else if (finalMsg.includes('API_KEY_INVALID') || finalMsg.includes('API key not valid')) {
        friendlyError = 'Khóa API không hợp lệ (API_KEY_INVALID): Vui lòng kiểm tra lại chuỗi ký tự khóa.';
      } else if (finalMsg.includes('RESOURCE_EXHAUSTED') || finalMsg.includes('429')) {
        friendlyError = 'Khóa API đã vượt quá hạn mức miễn phí (Rate Limit / Quota Exceeded).';
      } else if (finalMsg.includes('DEADLINE_EXCEEDED') || finalMsg.includes('504')) {
        friendlyError = 'Máy chủ Google AI phản hồi chậm (DEADLINE_EXCEEDED). Vui lòng thử lại sau giây lát.';
      } else if (finalMsg.includes('fetch failed') || finalMsg.includes('timeout')) {
        friendlyError = 'Hết thời gian kết nối (Timeout). Vui lòng kiểm tra kết nối mạng và thử lại.';
      }

      return res.status(400).json({
        valid: false,
        error: friendlyError,
      });
    }
  } catch (error: any) {
    const msg = error?.message || String(error);
    return res.status(500).json({
      valid: false,
      error: 'Lỗi hệ thống khi xác thực khóa API.',
      details: msg,
    });
  }
});

interface ParsedDebugPayload {
  summary: string;
  errorType: string;
  lineNumber: number;
  explanation: string;
  fixedCode: string;
  suggestions: string[];
}

function parseTaggedDebugOutput(raw: string, fallbackCode: string): ParsedDebugPayload {
  const tags = [
    'ERRORTYPE',
    'LINENUMBER',
    'SUMMARY',
    'EXPLANATION',
    'FIXEDCODE',
    'SUGGESTIONS',
  ] as const;

  const extractSection = (tag: string): string => {
    const marker = `<<<${tag}>>>`;
    const startIdx = raw.indexOf(marker);
    if (startIdx === -1) return '';
    const contentStart = startIdx + marker.length;
    let nextIdx = raw.length;
    for (const candidate of tags) {
      if (candidate === tag) continue;
      const idx = raw.indexOf(`<<<${candidate}>>>`, contentStart);
      if (idx !== -1 && idx < nextIdx) {
        nextIdx = idx;
      }
    }
    return raw.slice(contentStart, nextIdx).trim();
  };

  const errorType = extractSection('ERRORTYPE');
  const lineStr = extractSection('LINENUMBER');
  const lineMatch = lineStr.match(/\d+/);
  const lineNumber = lineMatch ? parseInt(lineMatch[0], 10) : 0;
  const summary = extractSection('SUMMARY');
  const explanation = extractSection('EXPLANATION');

  let fixedCode = extractSection('FIXEDCODE');
  if (fixedCode.startsWith('```')) {
    fixedCode = fixedCode.replace(/^```(?:python)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  }

  const rawSuggestions = extractSection('SUGGESTIONS');
  const suggestions = rawSuggestions
    ? rawSuggestions
        .split('\n')
        .map((line) => line.replace(/^[-*•\d.)\s]+/, '').trim())
        .filter(Boolean)
    : [];

  return {
    summary,
    errorType,
    lineNumber,
    explanation,
    fixedCode: fixedCode || fallbackCode,
    suggestions,
  };
}

// Endpoint: AI Debugger (Supports both Streaming SSE & JSON Fallback)
app.post('/api/gemini/debug', async (req, res) => {
  try {
    const { code, errorOutput, context, stream = false } = req.body;
    const customApiKey = (req.headers['x-gemini-api-key'] as string) || req.body?.apiKey;

    if (!code) {
      return res.status(400).json({ error: 'Mã nguồn không được để trống.' });
    }

    const isStreaming = req.headers.accept?.includes('text/event-stream') || stream === true;

    if (isStreaming) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders?.();

      const streamPrompt = `Phân tích đoạn mã Python sau và trả lời ĐÚNG theo cấu trúc các thẻ sau (không thêm chữ thừa ngoài thẻ, viết hoàn toàn bằng tiếng Việt):

<<<ERRORTYPE>>>
(Tên loại lỗi ngắn gọn, ví dụ: SyntaxError, NameError, LogicError hoặc Không có lỗi)
<<<LINENUMBER>>>
(Chỉ ghi 1 số nguyên dòng bị lỗi, hoặc 0 nếu không xác định)
<<<SUMMARY>>>
(1 câu tóm tắt ngắn gọn vấn đề)
<<<EXPLANATION>>>
(Giải thích nguyên nhân và cách sửa chi tiết, dễ hiểu bằng tiếng Việt)
<<<FIXEDCODE>>>
(Toàn bộ mã Python hoàn chỉnh đã sửa, viết trực tiếp không bọc markdown \`\`\`)
<<<SUGGESTIONS>>>
- (Mẹo tối ưu 1)
- (Mẹo tối ưu 2)

--- MÃ NGUỒN PYTHON ---
${code}

--- THÔNG BÁO LỖI / TERMINAL OUTPUT ---
${errorOutput || '(Người dùng yêu cầu kiểm tra cú pháp và tối ưu trước khi chạy)'}
${context ? `\n--- NGỮ CẢNH BỔ SUNG: ${context} ---` : ''}`;

      const ai = getGeminiClient(customApiKey);
      const streamModels = getOrderedModels([
        'gemini-3.1-flash-lite',
        'gemini-4-hydrogen',
      ]);

      let streamSucceeded = false;
      let lastStreamErr: any = null;

      for (const model of streamModels) {
        let rawAccumulated = '';
        let sentAnyChunk = false;
        try {
          const config: any = {
            systemInstruction:
              'Bạn là chuyên gia gỡ lỗi Python trong Pydroid 3 IDE. Luôn xuất đúng thứ tự 6 thẻ <<<ERRORTYPE>>>, <<<LINENUMBER>>>, <<<SUMMARY>>>, <<<EXPLANATION>>>, <<<FIXEDCODE>>>, <<<SUGGESTIONS>>> bằng tiếng Việt.',
          };
          if (model === 'gemini-4-hydrogen') {
            config.thinkingConfig = { thinkingLevel: ThinkingLevel.MINIMAL };
          }

          const responseStream = await ai.models.generateContentStream({
            model,
            contents: streamPrompt,
            config,
          });

          let lastEmittedHash = '';
          for await (const chunk of responseStream) {
            const text = chunk.text;
            if (!text) continue;
            rawAccumulated += text;
            const parsed = parseTaggedDebugOutput(rawAccumulated, '');
            const hasContent = !!(
              parsed.errorType ||
              parsed.summary ||
              parsed.explanation ||
              parsed.fixedCode ||
              parsed.suggestions.length > 0
            );
            if (hasContent) {
              const snapshot = JSON.stringify(parsed);
              if (snapshot !== lastEmittedHash) {
                lastEmittedHash = snapshot;
                sentAnyChunk = true;
                res.write(`data: ${JSON.stringify({ partial: parsed })}\n\n`);
              }
            }
          }

          const finalParsed = parseTaggedDebugOutput(rawAccumulated, code);
          const finalResult: ParsedDebugPayload = {
            summary: finalParsed.summary || 'Đã hoàn tất phân tích mã nguồn.',
            errorType: finalParsed.errorType || 'Code Analysis',
            lineNumber: finalParsed.lineNumber || 0,
            explanation: finalParsed.explanation || rawAccumulated.trim() || 'Không có giải thích chi tiết.',
            fixedCode: finalParsed.fixedCode || code,
            suggestions: finalParsed.suggestions,
          };

          res.write(`data: ${JSON.stringify({ done: true, result: finalResult })}\n\n`);
          streamSucceeded = true;
          return res.end();
        } catch (err: any) {
          lastStreamErr = err;
          const msg = err?.message || String(err);
          const isAuthError =
            msg.includes('PERMISSION_DENIED') ||
            msg.includes('ACCESS_TOKEN_SCOPE_INSUFFICIENT') ||
            msg.includes('API_KEY_INVALID') ||
            msg.includes('API key should be set') ||
            msg.includes('API key not valid');

          if (isAuthError) {
            res.write(
              `data: ${JSON.stringify({
                error: 'Chưa thiết lập hoặc khóa Gemini API không hợp lệ. Vui lòng kiểm tra Settings API Key.',
              })}\n\n`
            );
            return res.end();
          }

          if (sentAnyChunk) {
            const finalParsed = parseTaggedDebugOutput(rawAccumulated, code);
            res.write(`data: ${JSON.stringify({ done: true, result: finalParsed })}\n\n`);
            return res.end();
          }

          recordModelCooldown(model, err);
          continue;
        }
      }

      if (!streamSucceeded) {
        const errMsg = lastStreamErr?.message || '';
        const friendly =
          errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED')
            ? 'Hệ thống AI đang tạm thời đạt giới hạn lưu lượng (429). Vui lòng thử lại sau ít phút.'
            : 'Không thể kết nối đến Gemini AI lúc này. Vui lòng thử lại sau giây lát.';
        res.write(`data: ${JSON.stringify({ error: friendly })}\n\n`);
        return res.end();
      }
      return;
    }

    const prompt = `Bạn là Trợ lý gỡ lỗi AI chuyên nghiệp của Pydroid 3 Web, giao diện tiếng Việt.
Hãy phân tích đoạn mã Python và lỗi sau đây:

--- MÃ NGUỒN PYTHON ---
${code}

--- THÔNG BÁO LỖI / TERMINAL OUTPUT ---
${errorOutput || '(Người dùng yêu cầu kiểm tra cú pháp và tối ưu trước khi chạy)'}

${context ? `--- NGỮ CẢNH BỔ SUNG: ${context} ---` : ''}

Nhiệm vụ của bạn:
1. Xác định chính xác loại lỗi (SyntaxError, NameError, TypeError, IndexError, IndentationError, LogicError, v.v.).
2. Dòng bị ảnh hưởng (line number nếu có).
3. Tóm tắt lỗi ngắn gọn (1 câu).
4. Giải thích nguyên nhân chi tiết, dễ hiểu cho người dùng học lập trình trên di động bằng tiếng Việt.
5. Cung cấp toàn bộ mã nguồn sau khi đã được sửa hoàn chỉnh (fixedCode) sẵn sàng chạy được.
6. Đưa ra 2-3 lời khuyên hoặc mẹo viết mã tối ưu.`;

    const rawText = await callGeminiWithFallback({
      preferredModel: 'gemini-3.1-flash-lite',
      thinkingLevel: ThinkingLevel.LOW,
      contents: prompt,
      customApiKey,
      config: {
        systemInstruction:
          'Bạn là chuyên gia gỡ lỗi Python (Python Debugging Assistant) trong Pydroid 3 IDE dành cho Android. Phản hồi hoàn toàn bằng tiếng Việt theo định dạng JSON chuẩn.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: {
              type: Type.STRING,
              description: 'Tóm tắt ngắn gọn lỗi bằng 1 câu tiếng Việt.',
            },
            errorType: {
              type: Type.STRING,
              description: 'Loại lỗi kỹ thuật (vd: SyntaxError, TypeError, ZeroDivisionError).',
            },
            lineNumber: {
              type: Type.INTEGER,
              description: 'Số dòng bị lỗi trong mã nguồn (nếu xác định được, hoặc 0 nếu tổng thể).',
            },
            explanation: {
              type: Type.STRING,
              description: 'Giải thích chi tiết nguyên nhân gây lỗi và cách khắc phục bằng tiếng Việt.',
            },
            fixedCode: {
              type: Type.STRING,
              description: 'Toàn bộ đoạn mã hoàn chỉnh sau khi đã sửa lỗi.',
            },
            suggestions: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'Các lời khuyên tối ưu hóa hoặc mẹo ghi nhớ cho lập trình viên.',
            },
          },
          required: ['summary', 'errorType', 'explanation', 'fixedCode', 'suggestions'],
        },
      },
    });

    const result = JSON.parse(rawText || '{}');
    return res.json({ success: true, ...result });
  } catch (error: any) {
    console.error('Error calling Gemini debug:', error);
    return res.status(500).json({
      error: error?.message || 'Không thể kết nối đến Gemini AI. Vui lòng thử lại.',
    });
  }
});

// Endpoint: AI Code Explainer & Assistant (Supports Streaming SSE & JSON Fallback)
app.post('/api/gemini/explain', async (req, res) => {
  try {
    const { code, question, stream = false } = req.body;
    const customApiKey = (req.headers['x-gemini-api-key'] as string) || req.body?.apiKey;

    if (!code) {
      return res.status(400).json({ error: 'Mã nguồn không được để trống.' });
    }

    const prompt = question
      ? `Người dùng có câu hỏi về đoạn mã sau:\nCâu hỏi: "${question}"\n\nMã nguồn:\n${code}`
      : `Hãy giải thích chi tiết cấu trúc, logic hoạt động, thư viện sử dụng và luồng thực thi của đoạn mã Python sau bằng tiếng Việt rõ ràng, dễ hiểu cho người dùng di động:\n\n${code}`;

    const systemInstruction =
      'Bạn là gia sư lập trình Python cao cấp trên Pydroid 3. Giải thích mạch lạc, sử dụng markdown định dạng đẹp mắt bằng tiếng Việt.';

    const isStreaming = req.headers.accept?.includes('text/event-stream') || stream === true;

    if (isStreaming) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders?.();

      const ai = getGeminiClient(customApiKey);
      const streamModels = getOrderedModels([
        'gemini-3.1-flash-lite',
        'gemini-4-hydrogen',
      ]);

      let streamSucceeded = false;
      let lastStreamErr: any = null;

      for (const model of streamModels) {
        let sentAnyChunk = false;
        try {
          const config: any = { systemInstruction };
          if (model === 'gemini-4-hydrogen') {
            config.thinkingConfig = { thinkingLevel: ThinkingLevel.MINIMAL };
          }

          const responseStream = await ai.models.generateContentStream({
            model,
            contents: prompt,
            config,
          });

          for await (const chunk of responseStream) {
            const text = chunk.text;
            if (text) {
              sentAnyChunk = true;
              res.write(`data: ${JSON.stringify({ chunk: text })}\n\n`);
            }
          }
          res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
          streamSucceeded = true;
          return res.end();
        } catch (err: any) {
          lastStreamErr = err;
          const msg = err?.message || String(err);
          const isAuthError =
            msg.includes('PERMISSION_DENIED') ||
            msg.includes('ACCESS_TOKEN_SCOPE_INSUFFICIENT') ||
            msg.includes('API_KEY_INVALID') ||
            msg.includes('API key should be set') ||
            msg.includes('API key not valid');

          if (isAuthError) {
            res.write(
              `data: ${JSON.stringify({
                error: 'Khóa Gemini API chưa hợp lệ hoặc chưa được cấu hình. Vui lòng kiểm tra Settings API Key.',
              })}\n\n`
            );
            return res.end();
          }

          if (sentAnyChunk) {
            res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
            return res.end();
          }

          recordModelCooldown(model, err);
          continue;
        }
      }

      if (!streamSucceeded) {
        const errMsg = lastStreamErr?.message || '';
        const friendly =
          errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED')
            ? 'Hệ thống AI đang tạm thời đạt giới hạn lưu lượng (429). Vui lòng thử lại sau ít phút.'
            : 'Không thể phân tích đoạn mã lúc này. Vui lòng thử lại sau giây lát.';
        res.write(`data: ${JSON.stringify({ error: friendly })}\n\n`);
        return res.end();
      }
      return;
    }

    const explanation = await callGeminiWithFallback({
      preferredModel: 'gemini-3.1-flash-lite',
      thinkingLevel: ThinkingLevel.LOW,
      contents: prompt,
      customApiKey,
      config: { systemInstruction },
    });

    return res.json({ success: true, explanation: explanation || '' });
  } catch (error: any) {
    console.error('Error calling Gemini explain:', error);
    return res.status(500).json({
      error: error?.message || 'Không thể phân tích đoạn mã. Vui lòng kiểm tra lại.',
    });
  }
});

// Endpoint: Batched Code Analysis (Combines multiple debug/explain requests into a single Gemini call)
app.post('/api/gemini/analyze-batch', async (req, res) => {
  try {
    const { items } = req.body;
    const customApiKey = (req.headers['x-gemini-api-key'] as string) || req.body?.apiKey;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Danh sách phân tích không được để trống.' });
    }

    const safeItems = items.slice(0, 6);
    const taskListText = safeItems
      .map((item: any, idx: number) => {
        if (item.type === 'debug') {
          return `[TASK #${idx + 1} | id="${item.id}" | type="debug"]
CODE:
${item.code || ''}
ERROR_OUTPUT:
${item.errorOutput || '(Kiểm tra cú pháp và logic)'}
${item.context ? `CONTEXT: ${item.context}` : ''}`;
        }
        return `[TASK #${idx + 1} | id="${item.id}" | type="explain"]
QUESTION: ${item.question || 'Giải thích chi tiết cấu trúc, logic hoạt động và thư viện.'}
CODE:
${item.code || ''}`;
      })
      .join('\n\n====================\n\n');

    const prompt = `Thực hiện đồng thời ${safeItems.length} tác vụ phân tích mã Python sau đây và trả về kết quả JSON theo đúng danh sách id:

${taskListText}`;

    const rawText = await callGeminiWithFallback({
      preferredModel: 'gemini-3.1-flash-lite',
      thinkingLevel: ThinkingLevel.MINIMAL,
      timeoutMs: 25000,
      contents: prompt,
      customApiKey,
      config: {
        systemInstruction:
          'Bạn là chuyên gia phân tích và gỡ lỗi Python của Pydroid 3 IDE. Trả lời bằng tiếng Việt dưới dạng JSON chứa mảng results khớp chính xác id của từng task.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            results: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  type: { type: Type.STRING },
                  summary: { type: Type.STRING },
                  errorType: { type: Type.STRING },
                  lineNumber: { type: Type.INTEGER },
                  explanation: { type: Type.STRING },
                  fixedCode: { type: Type.STRING },
                  suggestions: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                },
                required: ['id', 'type', 'explanation'],
              },
            },
          },
          required: ['results'],
        },
      },
    });

    const parsed = JSON.parse(rawText || '{}');
    return res.json({
      success: true,
      results: Array.isArray(parsed.results) ? parsed.results : [],
    });
  } catch (error: any) {
    console.error('Error in Gemini batch analysis:', error);
    return res.status(500).json({
      error: error?.message || 'Không thể xử lý hàng loạt yêu cầu phân tích.',
    });
  }
});

// Endpoint: AI Chat Assistant with Streaming & Fallback
app.post('/api/gemini/chat', async (req, res) => {
  try {
    const { messages = [], currentCode = '', stream = false } = req.body;
    const customApiKey = (req.headers['x-gemini-api-key'] as string) || req.body?.apiKey;

    const formattedContents = messages.map((m: any) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content || '' }],
    }));

    const systemInstruction = `Bạn là Trợ lý Lập Trình Python AI của Pydroid 3 Web (môi trường lập trình tối ưu cho Android).
Nhiệm vụ của bạn là hỗ trợ lập trình viên di động:
- Trả lời ngắn gọn, chuẩn xác, dễ đọc trên màn hình điện thoại.
- Cung cấp mã nguồn Python mẫu chuẩn PEP 8 kèm giải thích rõ ràng.
- Hỗ trợ các thư viện: NumPy, Matplotlib, Kivy (cho Android APK), Pyodide, Requests, v.v.
- Khi người dùng gửi mã hoặc hỏi cách làm, luôn đưa ra đoạn mã rõ ràng có khối \`\`\`python ... \`\`\`.
- Luôn giao tiếp bằng tiếng Việt lịch sự, thân thiện và khuyến khích.
${currentCode ? `\n\n[MÃ NGUỒN HIỆN TẠI TRONG EDITOR]:\n\`\`\`python\n${currentCode}\n\`\`\`` : ''}`;

    const isStreaming = req.headers.accept?.includes('text/event-stream') || stream === true;

    if (isStreaming) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders?.();

      const ai = getGeminiClient(customApiKey);
      const streamCandidateModels = getOrderedModels([
        'gemini-3.1-flash-lite',
        'gemini-4-hydrogen',
      ]);

      let streamSucceeded = false;
      let lastStreamErr: any = null;

      for (const model of streamCandidateModels) {
        let sentAnyChunk = false;
        try {
          const config: any = { systemInstruction };
          if (model === 'gemini-4-hydrogen') {
            config.thinkingConfig = { thinkingLevel: ThinkingLevel.MINIMAL };
          }

          const responseStream = await ai.models.generateContentStream({
            model,
            contents: formattedContents,
            config,
          });

          for await (const chunk of responseStream) {
            const text = chunk.text;
            if (text) {
              sentAnyChunk = true;
              res.write(`data: ${JSON.stringify({ chunk: text })}\n\n`);
            }
          }
          res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
          streamSucceeded = true;
          return res.end();
        } catch (e: any) {
          lastStreamErr = e;
          const msg = e?.message || String(e);
          const isAuthError =
            msg.includes('PERMISSION_DENIED') ||
            msg.includes('ACCESS_TOKEN_SCOPE_INSUFFICIENT') ||
            msg.includes('API_KEY_INVALID') ||
            msg.includes('API key should be set') ||
            msg.includes('API key not valid');

          if (isAuthError) {
            res.write(
              `data: ${JSON.stringify({
                error: 'Khóa Gemini API chưa hợp lệ hoặc chưa được cấu hình. Vui lòng kiểm tra Settings API Key.',
              })}\n\n`
            );
            return res.end();
          }

          if (sentAnyChunk) {
            res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
            return res.end();
          }

          recordModelCooldown(model, e);
          continue;
        }
      }

      if (!streamSucceeded) {
        const errMsg = lastStreamErr?.message || '';
        const friendly =
          errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED')
            ? 'Hệ thống AI đang tạm thời đạt giới hạn lưu lượng (429). Vui lòng thử lại sau ít phút.'
            : 'Không thể kết nối đến Trợ lý AI lúc này. Vui lòng thử lại sau giây lát.';
        res.write(`data: ${JSON.stringify({ error: friendly })}\n\n`);
        return res.end();
      }
      return;
    }

    const reply = await callGeminiWithFallback({
      preferredModel: 'gemini-3.1-flash-lite',
      thinkingLevel: ThinkingLevel.MINIMAL,
      contents: formattedContents,
      customApiKey,
      config: {
        systemInstruction,
      },
    });

    return res.json({
      success: true,
      reply: reply || 'Xin chào! Tôi có thể giúp gì cho bạn về lập trình Python?',
    });
  } catch (error: any) {
    console.error('Error in Gemini chat:', error);
    return res.status(500).json({
      error: error?.message || 'Không thể kết nối với Trợ lý AI. Vui lòng thử lại.',
    });
  }
});

let cachedPythonBin: string | null = null;
function getPythonBinary(): string {
  if (cachedPythonBin) return cachedPythonBin;
  for (const candidate of ['python3', 'python']) {
    try {
      const check = spawnSync(candidate, ['--version'], { stdio: 'ignore', timeout: 2000 });
      if (check.status === 0) {
        cachedPythonBin = candidate;
        return candidate;
      }
    } catch {
      // try next
    }
  }
  cachedPythonBin = 'python3';
  return cachedPythonBin;
}

const SAFE_PIP_SPEC_REGEX = /^[a-zA-Z0-9._\-\[\]<>=!~,]+$/;
let cachedPipList: { packages: string[]; fetchedAt: number } | null = null;

// Endpoint: List installed Python packages on CPython server
app.get('/api/python/pip/list', (_req, res) => {
  const now = Date.now();
  if (cachedPipList && now - cachedPipList.fetchedAt < 30_000) {
    return res.json({ success: true, packages: cachedPipList.packages });
  }

  const pyBin = getPythonBinary();
  const listScript = `
import json, importlib.metadata
names = sorted({
    str(d.metadata.get("Name") or "").strip().lower()
    for d in importlib.metadata.distributions()
    if d.metadata and d.metadata.get("Name")
})
print(json.dumps(names))
`;
  const proc = spawn(pyBin, ['-c', listScript], {
    timeout: 6000,
    env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
  });

  let out = '';
  proc.stdout.on('data', (d) => {
    out += d.toString();
  });

  proc.on('close', (code) => {
    if (code !== 0) {
      return res.json({ success: false, packages: cachedPipList?.packages || [] });
    }
    try {
      const parsed = JSON.parse(out);
      const packages = Array.isArray(parsed)
        ? parsed.map((name: any) => String(name || '').trim().toLowerCase()).filter(Boolean)
        : [];
      cachedPipList = { packages, fetchedAt: Date.now() };
      return res.json({ success: true, packages });
    } catch {
      return res.json({ success: false, packages: cachedPipList?.packages || [] });
    }
  });

  proc.on('error', () => {
    return res.json({ success: false, packages: [] });
  });
});

// Endpoint: Install a Python package via pip on CPython server
app.post('/api/python/pip/install', (req, res) => {
  const rawPkg = typeof req.body?.packageName === 'string' ? req.body.packageName.trim() : '';
  if (!rawPkg || rawPkg.length > 100 || !SAFE_PIP_SPEC_REGEX.test(rawPkg)) {
    return res.status(400).json({
      success: false,
      error: 'Tên thư viện pip không hợp lệ.',
    });
  }

  const pyBin = getPythonBinary();
  const proc = spawn(
    pyBin,
    ['-m', 'pip', 'install', '--no-input', '--disable-pip-version-check', rawPkg],
    {
      timeout: 55000,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8', PIP_DISABLE_PIP_VERSION_CHECK: '1' },
    }
  );

  let stdout = '';
  let stderr = '';
  proc.stdout.on('data', (d) => {
    stdout += d.toString();
  });
  proc.stderr.on('data', (d) => {
    stderr += d.toString();
  });

  proc.on('close', (code) => {
    cachedPipList = null;
    const baseName = rawPkg.split(/[=<>!~\[]/)[0].trim().toLowerCase();
    if (code === 0) {
      return res.json({
        success: true,
        packageName: baseName,
        output: stdout.trim(),
      });
    }
    return res.status(400).json({
      success: false,
      error: stderr.trim() || stdout.trim() || `Cài đặt ${rawPkg} thất bại (mã ${code}).`,
    });
  });

  proc.on('error', (err) => {
    return res.status(500).json({
      success: false,
      error: `Không thể chạy pip trên máy chủ: ${err.message}`,
    });
  });
});

let cachedCPythonWarmInfo: { available: boolean; pythonVersion: string; warmedAt: number } | null = null;
let inflightCPythonWarm: Promise<{ available: boolean; pythonVersion: string }> | null = null;

async function ensureCPythonWarmed(): Promise<{ available: boolean; pythonVersion: string }> {
  if (cachedCPythonWarmInfo && cachedCPythonWarmInfo.available) {
    return { available: true, pythonVersion: cachedCPythonWarmInfo.pythonVersion };
  }
  if (inflightCPythonWarm) return inflightCPythonWarm;

  inflightCPythonWarm = new Promise<{ available: boolean; pythonVersion: string }>((resolve) => {
    const proc = spawn(
      'python3',
      ['-c', 'import sys, math, json, os, random, datetime, platform, re; print(sys.version.split()[0])'],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    );
    let out = '';
    const timer = setTimeout(() => {
      try {
        proc.kill('SIGKILL');
      } catch {}
      resolve({ available: false, pythonVersion: '' });
    }, 6000);

    proc.stdout.on('data', (d) => {
      out += d.toString();
    });
    proc.on('close', (code) => {
      clearTimeout(timer);
      const version = out.trim();
      const available = code === 0 && version.length > 0;
      if (available) {
        cachedCPythonWarmInfo = { available: true, pythonVersion: version, warmedAt: Date.now() };
      }
      resolve({ available, pythonVersion: version });
    });
    proc.on('error', () => {
      clearTimeout(timer);
      resolve({ available: false, pythonVersion: '' });
    });
  }).finally(() => {
    inflightCPythonWarm = null;
  });

  return inflightCPythonWarm;
}

// Endpoint: Pre-warm CPython binary & common stdlib modules for low-latency first run / engine switch
app.all('/api/python/warmup', async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const startedAt = Date.now();
  const info = await ensureCPythonWarmed();
  return res.json({
    ok: info.available,
    available: info.available,
    pythonVersion: info.pythonVersion || null,
    warmed: info.available,
    durationMs: Date.now() - startedAt,
  });
});

// Endpoint: CPython Native Execution on Linux Server
app.post('/api/python/run', async (req, res) => {
  const { code, inputs = [] } = req.body;

  if (typeof code !== 'string') {
    return res.status(400).json({ error: 'Mã nguồn không hợp lệ.' });
  }

  const tmpDir = os.tmpdir();
  const filePath = path.join(tmpDir, `pydroid_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.py`);

  try {
    await fs.promises.writeFile(filePath, code, 'utf-8');

    const startTime = Date.now();
    let stdoutData = '';
    let stderrData = '';
    let stderrLineBuffer = '';
    let isWaitingInputSentinel = false;
    let capturedPlots: string[] = [];
    let clientDisconnected = false;

    // Smart Python runner script:
    // 1. Hooks builtins.input() to echo typed inputs into stdout (matching interactive terminal behavior)
    // 2. Intercepts uncaught EOFError cleanly without printing raw traceback red error to terminal
    // 3. Captures matplotlib figures (if imported) as base64 PNGs
    const runnerScript = `
import sys, builtins, json
_orig_input = builtins.input
def _pydroid_input(prompt=""):
    try:
        val = _orig_input(prompt)
        sys.stdout.write(str(val) + "\\n")
        sys.stdout.flush()
        return val
    except EOFError:
        sys.stdout.flush()
        raise
builtins.input = _pydroid_input

if "matplotlib" in sys.modules or "matplotlib" in open(sys.argv[1], "r", encoding="utf-8").read():
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
        plt.show = lambda *a, **kw: None
    except Exception:
        pass

target = sys.argv[1]
sys.argv = [target]
with open(target, "r", encoding="utf-8") as f:
    source = f.read()

try:
    code_obj = compile(source, target, "exec")
    exec(code_obj, {"__name__": "__main__", "__file__": target})
except EOFError:
    sys.stdout.flush()
    sys.stderr.write("\\n__PYDROID_EOF_INPUT__\\n")
    sys.stderr.flush()
finally:
    if "matplotlib.pyplot" in sys.modules:
        try:
            import io, base64
            import matplotlib.pyplot as plt
            plots = []
            for fig_num in plt.get_fignums():
                fig = plt.figure(fig_num)
                buf = io.BytesIO()
                fig.savefig(buf, format="png", bbox_inches="tight", dpi=120)
                buf.seek(0)
                plots.append(base64.b64encode(buf.read()).decode("utf-8"))
                plt.close(fig)
            if plots:
                sys.stderr.write("\\n__PYDROID_PLOTS_B64__:" + json.dumps(plots) + "\\n")
                sys.stderr.flush()
        except Exception:
            pass
`;

    const isStreaming = req.headers.accept?.includes('text/event-stream') || req.query.stream === 'true';

    if (isStreaming) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders?.();
    }

    const pyBin = getPythonBinary();
    const pyProcess = spawn(pyBin, ['-u', '-c', runnerScript, filePath], {
      timeout: 20000,
      env: {
        ...process.env,
        PYTHONIOENCODING: 'utf-8',
        PYTHONUNBUFFERED: '1',
        MPLBACKEND: 'Agg',
      },
    });

    req.on('close', () => {
      clientDisconnected = true;
      if (!pyProcess.killed) {
        pyProcess.kill('SIGTERM');
      }
    });

    // Provide standard input if passed (for input() prompts)
    if (Array.isArray(inputs) && inputs.length > 0) {
      pyProcess.stdin.write(inputs.join('\n') + '\n');
      pyProcess.stdin.end();
    } else {
      pyProcess.stdin.end();
    }

    const processStderrLine = (line: string) => {
      const trimmed = line.trim();
      if (trimmed === '__PYDROID_EOF_INPUT__') {
        isWaitingInputSentinel = true;
        return;
      }
      if (trimmed.startsWith('__PYDROID_PLOTS_B64__:')) {
        try {
          const parsed = JSON.parse(trimmed.slice('__PYDROID_PLOTS_B64__:'.length));
          if (Array.isArray(parsed)) {
            capturedPlots = parsed;
          }
        } catch {
          // ignore malformed plots payload
        }
        return;
      }
      const chunkWithNewline = line + '\n';
      stderrData += chunkWithNewline;
      if (isStreaming && !clientDisconnected && trimmed) {
        res.write(`data: ${JSON.stringify({ type: 'stderr', chunk: chunkWithNewline })}\n\n`);
      }
    };

    pyProcess.stdout.on('data', (data) => {
      const chunkStr = data.toString('utf-8');
      stdoutData += chunkStr;
      if (isStreaming && !clientDisconnected) {
        res.write(`data: ${JSON.stringify({ type: 'stdout', chunk: chunkStr })}\n\n`);
      }
      if (stdoutData.length > 500000) {
        pyProcess.kill();
      }
    });

    pyProcess.stderr.on('data', (data) => {
      stderrLineBuffer += data.toString('utf-8');
      const lines = stderrLineBuffer.split('\n');
      stderrLineBuffer = lines.pop() || '';
      for (const line of lines) {
        processStderrLine(line);
      }
      if (stderrData.length > 500000) {
        pyProcess.kill();
      }
    });

    pyProcess.on('close', async (exitCode) => {
      if (stderrLineBuffer) {
        processStderrLine(stderrLineBuffer);
        stderrLineBuffer = '';
      }

      const duration = Date.now() - startTime;
      try {
        await fs.promises.unlink(filePath);
      } catch {
        // ignore cleanup error
      }

      if (clientDisconnected) {
        return;
      }

      const isWaitingInput =
        isWaitingInputSentinel || stderrData.includes('EOFError: EOF when reading a line');

      if (isWaitingInput) {
        const stdoutLines = stdoutData.replace(/\r/g, '').split('\n');
        const lastLine = stdoutLines[stdoutLines.length - 1] || 'input():';

        const payload = {
          success: true,
          isWaitingInput: true,
          exitCode: 0,
          stdout: stdoutData,
          stderr: '',
          prompt: lastLine.trim() || 'input():',
          plotImages: capturedPlots,
          duration,
          engine: 'CPython 3.10 (Native Linux)',
        };

        if (isStreaming) {
          res.write(`data: ${JSON.stringify({ type: 'done', ...payload })}\n\n`);
          return res.end();
        }
        return res.json(payload);
      }

      // Clean up runner wrapper frames and tmp paths from genuine errors
      let cleanedStderr = stderrData;
      if (filePath) {
        cleanedStderr = cleanedStderr.split(filePath).join('main.py');
      }
      if (cleanedStderr.includes('File "<string>"')) {
        cleanedStderr = cleanedStderr
          .split('\n')
          .filter((line) => !line.includes('File "<string>"') && !line.includes('_pydroid_input'))
          .join('\n');
      }

      const payload = {
        success: exitCode === 0,
        isWaitingInput: false,
        exitCode,
        stdout: stdoutData,
        stderr: cleanedStderr.trim(),
        plotImages: capturedPlots,
        duration,
        engine: 'CPython 3.10 (Native Linux)',
      };

      if (isStreaming) {
        res.write(`data: ${JSON.stringify({ type: 'done', ...payload })}\n\n`);
        return res.end();
      }
      return res.json(payload);
    });

    pyProcess.on('error', async (err) => {
      try {
        await fs.promises.unlink(filePath);
      } catch {}
      if (clientDisconnected) return;
      if (isStreaming) {
        res.write(`data: ${JSON.stringify({ type: 'error', error: `Lỗi khởi động CPython: ${err.message}` })}\n\n`);
        return res.end();
      }
      return res.status(500).json({
        success: false,
        error: `Lỗi khởi động CPython: ${err.message}`,
      });
    });
  } catch (err: any) {
    try {
      if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath);
      }
    } catch {}
    return res.status(500).json({ error: err.message || 'Lỗi thực thi mã Python' });
  }
});

// Endpoint: Health check & Engine info
app.get('/api/engine/status', (req, res) => {
  const headerKey = req.headers['x-gemini-api-key'] as string | undefined;
  const effectiveKey = (headerKey && headerKey.trim()) || process.env.GEMINI_API_KEY;
  const hasKey = !!effectiveKey && effectiveKey.trim() !== '' && effectiveKey !== 'MY_GEMINI_API_KEY';
  res.json({
    status: 'online',
    cpython: {
      available: true,
      version: '3.10.12 (Linux Native)',
    },
    pyodide: {
      version: '0.26.4 (WASM Client-side Offline)',
    },
    gemini: {
      available: hasKey,
      model: 'gemini-3.1-flash-lite',
      instructions: !hasKey
        ? 'Vui lòng vào menu Settings > Secrets trong giao diện AI Studio hoặc nhập Khóa API trong Cài đặt.'
        : 'Sẵn sàng',
    },
  });
});

// In-memory single-use APK OAuth handoff store (TTL 3 minutes, never persisted to disk)
interface ApkAuthSession {
  code: string;
  state: string;
  idToken?: string;
  accessToken: string;
  email?: string;
  displayName?: string;
  photoURL?: string;
  expiresAt: number;
}

const apkAuthHandoffs = new Map<string, ApkAuthSession>();
const APK_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function purgeExpiredApkAuthSessions() {
  const now = Date.now();
  for (const [key, session] of apkAuthHandoffs.entries()) {
    if (session.expiresAt <= now) {
      apkAuthHandoffs.delete(key);
    }
  }
}

function generateApkHandoffCode(): string {
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += APK_CODE_ALPHABET[crypto.randomInt(0, APK_CODE_ALPHABET.length)];
  }
  return code;
}

app.post('/api/apk-auth/handoff', (req, res) => {
  purgeExpiredApkAuthSessions();
  const { state, idToken, accessToken, email, displayName, photoURL } = req.body || {};

  if (typeof state !== 'string' || state.trim().length < 12) {
    return res.status(400).json({ error: 'Tham số state không hợp lệ.' });
  }
  if (typeof accessToken !== 'string' || accessToken.trim().length < 20) {
    return res.status(400).json({ error: 'Thiếu accessToken hợp lệ từ Google.' });
  }

  // Remove any previous session sharing this state
  for (const [k, existing] of apkAuthHandoffs.entries()) {
    if (existing.state === state.trim()) {
      apkAuthHandoffs.delete(k);
    }
  }

  if (apkAuthHandoffs.size >= 100) {
    const oldest = apkAuthHandoffs.keys().next().value;
    if (oldest) apkAuthHandoffs.delete(oldest);
  }

  let code = generateApkHandoffCode();
  while (apkAuthHandoffs.has(code)) {
    code = generateApkHandoffCode();
  }

  const session: ApkAuthSession = {
    code,
    state: state.trim(),
    idToken: typeof idToken === 'string' && idToken.trim() ? idToken.trim() : undefined,
    accessToken: accessToken.trim(),
    email: typeof email === 'string' ? email : undefined,
    displayName: typeof displayName === 'string' ? displayName : undefined,
    photoURL: typeof photoURL === 'string' ? photoURL : undefined,
    expiresAt: Date.now() + 180 * 1000,
  };

  apkAuthHandoffs.set(code, session);
  return res.json({ code, expiresInSeconds: 180 });
});

app.get('/api/apk-auth/handoff', (req, res) => {
  purgeExpiredApkAuthSessions();
  const rawCode = typeof req.query.code === 'string' ? req.query.code.replace(/[^A-Za-z0-9]/g, '').toUpperCase() : '';
  const rawState = typeof req.query.state === 'string' ? req.query.state.trim() : '';

  let matched: ApkAuthSession | undefined;

  if (rawCode) {
    const candidate = apkAuthHandoffs.get(rawCode);
    if (candidate && (!rawState || candidate.state === rawState)) {
      matched = candidate;
    }
  } else if (rawState.length >= 12) {
    for (const session of apkAuthHandoffs.values()) {
      if (session.state === rawState) {
        matched = session;
        break;
      }
    }
  }

  if (!matched) {
    return res.status(404).json({
      ready: false,
      error: 'Phiên đăng nhập chưa hoàn tất hoặc mã đã hết hạn (3 phút).',
    });
  }

  // Single-use: remove immediately once claimed
  apkAuthHandoffs.delete(matched.code);

  return res.json({
    ready: true,
    idToken: matched.idToken,
    accessToken: matched.accessToken,
    email: matched.email,
    displayName: matched.displayName,
    photoURL: matched.photoURL,
  });
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, status: 'online' });
});

function walkDirRecursive(dirPath: string, rootDir: string, outFiles: string[]) {
  if (!fs.existsSync(dirPath)) return;
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git' || entry.name === '.DS_Store') {
      continue;
    }
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      walkDirRecursive(full, rootDir, outFiles);
    } else if (entry.isFile()) {
      outFiles.push(path.relative(rootDir, full).replace(/\\/g, '/'));
    }
  }
}

// Endpoint: Download essential updated source files as ZIP for updating existing GitHub repository
app.get('/api/project/update-bundle', async (_req, res) => {
  try {
    const { default: JSZip } = await import('jszip');
    const zip = new JSZip();
    const rootDir = __dirname;

    const candidateRootFiles = [
      '.github/workflows/build-apk.yml',
      'index.html',
      'package.json',
      'server.ts',
      'capacitor.config.json',
      'tsconfig.json',
      'vite.config.ts',
      'metadata.json',
      'firebase-applet-config.json',
      'Dockerfile',
      'public/app-icon.jpg',
    ];

    const filesToPack = new Set<string>();
    for (const rel of candidateRootFiles) {
      const abs = path.join(rootDir, rel);
      if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
        filesToPack.add(rel);
      }
    }

    // Collect all source files inside src/
    const srcFiles: string[] = [];
    walkDirRecursive(path.join(rootDir, 'src'), rootDir, srcFiles);
    for (const rel of srcFiles) {
      filesToPack.add(rel);
    }

    for (const rel of filesToPack) {
      const abs = path.join(rootDir, rel);
      const buf = await fs.promises.readFile(abs);
      zip.file(rel, buf);
    }

    const zipBuffer = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="Pydroid3-Web-Update-Files.zip"');
    res.setHeader('Cache-Control', 'no-store');
    return res.send(zipBuffer);
  } catch (err: any) {
    console.error('Failed to generate project update bundle:', err);
    return res.status(500).json({ error: err?.message || 'Không thể đóng gói file cập nhật mã nguồn.' });
  }
});

// Start server with Vite middleware in dev or static files in production
async function startServer() {
  const isProduction = process.env.NODE_ENV === 'production';
  const httpServer = http.createServer(app);

  if (!isProduction) {
    const vitePromise = (async () => {
      const { createServer: createViteServer } = await import('vite');
      return await createViteServer({
        server: {
          middlewareMode: true,
          hmr: process.env.DISABLE_HMR === 'true' ? false : { server: httpServer },
        },
        appType: 'spa',
      });
    })();

    vitePromise.catch((err) => {
      console.error('Failed to initialize Vite dev middleware:', err);
    });

    app.use(async (req, res, next) => {
      try {
        const vite = await vitePromise;
        vite.middlewares(req, res, next);
      } catch (err) {
        next(err);
      }
    });
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Pydroid 3 Web Server running at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
