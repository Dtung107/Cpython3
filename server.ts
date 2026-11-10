import express from 'express';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '10mb' }));

// Initialize GoogleGenAI SDK with required headers
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || '',
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

// Track model quota cooldowns in-memory to prevent repeated 429 errors when a model hits free-tier daily limits
const modelQuotaCooldown: Record<string, number> = {};

// Resilient Gemini Call with Retry, Smart Cooldown & Model Fallback (Handles transient 503/429 spikes)
async function callGeminiWithFallback(params: {
  contents: any;
  config: any;
  preferredModel?: string;
}): Promise<string> {
  // Use gemini-3.1-flash-lite as the reliable primary model with high Free Tier quota limits
  const candidateModels = [
    params.preferredModel || 'gemini-3.1-flash-lite',
    'gemini-3.1-flash-lite',
    'gemini-flash-latest',
    'gemini-3.8-flash',
  ];

  const now = Date.now();
  const uniqueModels = Array.from(new Set(candidateModels));

  // Sort candidate models so active (non-cooldown) models are tried first
  const models = uniqueModels.sort((a, b) => {
    const aCooldown = (modelQuotaCooldown[a] || 0) > now ? 1 : 0;
    const bCooldown = (modelQuotaCooldown[b] || 0) > now ? 1 : 0;
    return aCooldown - bCooldown;
  });

  let lastErr: any = null;

  for (const model of models) {
    // If model is in active quota cooldown, skip to next model
    if ((modelQuotaCooldown[model] || 0) > now) {
      continue;
    }

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const configToUse = { ...params.config };
        // thinkingConfig is only supported for gemini-3.8-flash and gemini-4-argon
        if (model !== 'gemini-3.8-flash' && model !== 'gemini-4-argon' && configToUse.thinkingConfig) {
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
        const isQuotaExceeded =
          msg.includes('429') ||
          msg.includes('RESOURCE_EXHAUSTED') ||
          msg.includes('quota') ||
          msg.includes('limit exceeded');

        if (isQuotaExceeded) {
          // Parse retry cooldown or default to 30 minutes to skip this model
          let cooldownMs = 30 * 60 * 1000;
          const match = msg.match(/retry in\s+([0-9.]+)s/i) || msg.match(/"retryDelay":\s*"([0-9]+)s"/);
          if (match && match[1]) {
            const secs = parseFloat(match[1]);
            if (!isNaN(secs) && secs > 0) {
              cooldownMs = Math.min(secs * 1000, 24 * 3600 * 1000);
            }
          }
          modelQuotaCooldown[model] = Date.now() + cooldownMs;
          console.warn(`[Gemini Fallback] Model ${model} is at quota limit. Switching to alternative model.`);
          break; // Try next model immediately
        }

        const isTemporary = msg.includes('503') || msg.includes('high demand') || msg.includes('UNAVAILABLE');
        if (isTemporary && attempt === 1) {
          await new Promise((r) => setTimeout(r, 600));
          continue;
        }

        console.warn(`[Gemini Fallback] Model ${model} attempt ${attempt} failed, trying next candidate.`);
        break; // try next model in fallback list
      }
    }
  }

  throw lastErr;
}

// Endpoint: AI Debugger (Gemini 3.8 Flash with Fallback)
app.post('/api/gemini/debug', async (req, res) => {
  try {
    const { code, errorOutput, context } = req.body;

    if (!code) {
      return res.status(400).json({ error: 'Mã nguồn không được để trống.' });
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
      preferredModel: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        systemInstruction:
          'Bạn là chuyên gia gỡ lỗi Python (Python Debugging Assistant) trong Pydroid 3 IDE dành cho Android. Phản hồi hoàn toàn bằng tiếng Việt theo định dạng JSON chuẩn.',
        thinkingConfig: {
          thinkingLevel: ThinkingLevel.LOW,
        },
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

// Endpoint: AI Code Explainer & Assistant
app.post('/api/gemini/explain', async (req, res) => {
  try {
    const { code, question } = req.body;
    if (!code) {
      return res.status(400).json({ error: 'Mã nguồn không được để trống.' });
    }

    const prompt = question
      ? `Người dùng có câu hỏi về đoạn mã sau:\nCâu hỏi: "${question}"\n\nMã nguồn:\n${code}`
      : `Hãy giải thích chi tiết cấu trúc, logic hoạt động, thư viện sử dụng và luồng thực thi của đoạn mã Python sau bằng tiếng Việt rõ ràng, dễ hiểu cho người dùng di động:\n\n${code}`;

    const explanation = await callGeminiWithFallback({
      preferredModel: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        thinkingConfig: {
          thinkingLevel: ThinkingLevel.LOW,
        },
        systemInstruction:
          'Bạn là gia sư lập trình Python cao cấp trên Pydroid 3. Giải thích mạch lạc, sử dụng markdown định dạng đẹp mắt bằng tiếng Việt.',
      },
    });

    return res.json({ success: true, explanation: explanation || '' });
  } catch (error: any) {
    console.error('Error calling Gemini explain:', error);
    return res.status(500).json({
      error: error?.message || 'Không thể phân tích đoạn mã. Vui lòng kiểm tra lại.',
    });
  }
});

// Endpoint: AI Chat Assistant (Trò chuyện & Hỏi trợ lý AI)
app.post('/api/gemini/chat', async (req, res) => {
  try {
    const { messages = [], currentCode = '' } = req.body;

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

    const reply = await callGeminiWithFallback({
      preferredModel: 'gemini-3.8-flash',
      contents: formattedContents,
      config: {
        thinkingConfig: {
          thinkingLevel: ThinkingLevel.LOW,
        },
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

    // Smart Python runner script:
    // 1. Hooks builtins.input() to echo typed inputs into stdout (matching interactive terminal behavior)
    // 2. Preserves exact line numbers in user code traceback
    // 3. Flushes output immediately on EOF so prompt text is captured
    const runnerScript = `
import sys, builtins
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

target = sys.argv[1]
sys.argv = [target]
with open(target, "r", encoding="utf-8") as f:
    source = f.read()
code_obj = compile(source, target, "exec")
exec(code_obj, {"__name__": "__main__", "__file__": target})
`;

    const pyProcess = spawn('python3', ['-u', '-c', runnerScript, filePath], {
      timeout: 15000, // 15 second safety timeout
    });

    // Provide standard input if passed (for input() prompts)
    if (Array.isArray(inputs) && inputs.length > 0) {
      pyProcess.stdin.write(inputs.join('\n') + '\n');
      pyProcess.stdin.end();
    } else {
      pyProcess.stdin.end();
    }

    pyProcess.stdout.on('data', (data) => {
      stdoutData += data.toString();
      if (stdoutData.length > 500000) {
        pyProcess.kill();
      }
    });

    pyProcess.stderr.on('data', (data) => {
      stderrData += data.toString();
      if (stderrData.length > 500000) {
        pyProcess.kill();
      }
    });

    pyProcess.on('close', async (exitCode) => {
      const duration = Date.now() - startTime;
      try {
        await fs.promises.unlink(filePath);
      } catch (e) {
        // ignore cleanup error
      }

      // Detect if Python process ended due to waiting for user input()
      const isWaitingInput = stderrData.includes('EOFError: EOF when reading a line');

      if (isWaitingInput) {
        // The program is simply waiting for the user to provide next input()
        // Extract prompt line from stdout if available
        const stdoutLines = stdoutData.split('\n');
        const lastLine = stdoutLines[stdoutLines.length - 1] || 'input():';

        return res.json({
          success: true,
          isWaitingInput: true,
          exitCode: 0,
          stdout: stdoutData,
          stderr: '', // Do NOT return EOFError traceback to avoid triggering false alarms
          prompt: lastLine.trim() || 'input():',
          duration,
          engine: 'CPython 3.10 (Native Linux)',
        });
      }

      // For genuine syntax/runtime errors: clean up runner wrapper frames from stderr
      let cleanedStderr = stderrData;
      if (cleanedStderr.includes('File "<string>"')) {
        cleanedStderr = cleanedStderr
          .split('\n')
          .filter((line) => !line.includes('File "<string>"') && !line.includes('_pydroid_input'))
          .join('\n');
      }

      return res.json({
        success: exitCode === 0,
        isWaitingInput: false,
        exitCode,
        stdout: stdoutData,
        stderr: cleanedStderr.trim(),
        duration,
        engine: 'CPython 3.10 (Native Linux)',
      });
    });

    pyProcess.on('error', async (err) => {
      try {
        await fs.promises.unlink(filePath);
      } catch (e) {}
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
    } catch (e) {}
    return res.status(500).json({ error: err.message || 'Lỗi thực thi mã Python' });
  }
});

// Endpoint: Health check & Engine info
app.get('/api/engine/status', (req, res) => {
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
      available: !!process.env.GEMINI_API_KEY,
      model: 'gemini-3.8-flash',
    },
  });
});

// Start server with Vite middleware in dev or static files in production
async function startServer() {
  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Pydroid 3 Web Server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
