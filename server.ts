import express from 'express';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Enable CORS for Android APK, Capacitor, and remote web clients
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.json({ limit: '10mb' }));

function getGeminiClient(customApiKey?: string): GoogleGenAI {
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
      timeout: 15000,
    },
  });
}

// Track model quota cooldowns in-memory to prevent repeated 429 errors when a model hits free-tier daily limits
const modelQuotaCooldown: Record<string, number> = {};

// Resilient Gemini Call with Smart Model Fallback (Handles transient 503/429 spikes smoothly)
async function callGeminiWithFallback(params: {
  contents: any;
  config: any;
  preferredModel?: string;
  customApiKey?: string;
}): Promise<string> {
  const ai = getGeminiClient(params.customApiKey);

  // Use stable, high-availability models: gemini-flash-latest -> gemini-3.1-flash-lite -> gemini-3.8-flash
  const candidateModels = [
    params.preferredModel || 'gemini-flash-latest',
    'gemini-flash-latest',
    'gemini-3.1-flash-lite',
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

    try {
      const configToUse = { ...params.config };
      // Clean thinkingConfig if present to ensure maximum model compatibility
      if (configToUse.thinkingConfig && model !== 'gemini-3.8-flash' && model !== 'gemini-4-argon') {
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
        console.log(`[Gemini] Model ${model} hit quota limit, smoothly trying alternative model.`);
        continue;
      }

      // If temporary unavailable / 503, quietly try next model in candidate list
      console.log(`[Gemini] Model ${model} is temporarily busy, switching to backup model.`);
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

    // Lightweight ping request: 1 maxOutputToken to verify auth & permissions quickly
    const testAi = new GoogleGenAI({
      apiKey: keyToTest,
      httpOptions: {
        headers: { 'User-Agent': 'aistudio-build' },
        timeout: 10000,
      },
    });

    const pingResponse = await testAi.models.generateContent({
      model: 'gemini-flash-latest',
      contents: 'ping',
      config: {
        maxOutputTokens: 1,
      },
    });

    if (pingResponse) {
      return res.json({
        valid: true,
        model: 'gemini-flash-latest',
        message: 'Khóa Gemini API hợp lệ và sẵn sàng sử dụng!',
      });
    }

    return res.status(400).json({
      valid: false,
      error: 'Không nhận được phản hồi xác thực từ máy chủ Gemini.',
    });
  } catch (error: any) {
    const msg = error?.message || String(error);
    console.error('Validation error for Gemini key:', msg);

    let friendlyError = 'Khóa API không hợp lệ hoặc thiếu quyền hạn cần thiết.';
    if (msg.includes('PERMISSION_DENIED') || msg.includes('ACCESS_TOKEN_SCOPE_INSUFFICIENT')) {
      friendlyError = 'Lỗi xác thực (PERMISSION_DENIED): Khóa API không có quyền truy cập Gemini API.';
    } else if (msg.includes('API_KEY_INVALID') || msg.includes('API key not valid')) {
      friendlyError = 'Khóa API không hợp lệ (API_KEY_INVALID): Vui lòng kiểm tra lại chuỗi ký tự khóa.';
    } else if (msg.includes('RESOURCE_EXHAUSTED') || msg.includes('429')) {
      friendlyError = 'Khóa API đã vượt quá hạn mức miễn phí (Rate Limit / Quota Exceeded).';
    } else if (msg.includes('fetch failed') || msg.includes('timeout')) {
      friendlyError = 'Hết thời gian kết nối (Timeout). Vui lòng kiểm tra kết nối mạng và thử lại.';
    }

    return res.status(400).json({
      valid: false,
      error: friendlyError,
      details: msg,
    });
  }
});

// Endpoint: AI Debugger (Gemini Flash with Fallback)
app.post('/api/gemini/debug', async (req, res) => {
  try {
    const { code, errorOutput, context } = req.body;
    const customApiKey = (req.headers['x-gemini-api-key'] as string) || req.body?.apiKey;

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
      preferredModel: 'gemini-flash-latest',
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

// Endpoint: AI Code Explainer & Assistant
app.post('/api/gemini/explain', async (req, res) => {
  try {
    const { code, question } = req.body;
    const customApiKey = (req.headers['x-gemini-api-key'] as string) || req.body?.apiKey;

    if (!code) {
      return res.status(400).json({ error: 'Mã nguồn không được để trống.' });
    }

    const prompt = question
      ? `Người dùng có câu hỏi về đoạn mã sau:\nCâu hỏi: "${question}"\n\nMã nguồn:\n${code}`
      : `Hãy giải thích chi tiết cấu trúc, logic hoạt động, thư viện sử dụng và luồng thực thi của đoạn mã Python sau bằng tiếng Việt rõ ràng, dễ hiểu cho người dùng di động:\n\n${code}`;

    const explanation = await callGeminiWithFallback({
      preferredModel: 'gemini-flash-latest',
      contents: prompt,
      customApiKey,
      config: {
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

    const reply = await callGeminiWithFallback({
      preferredModel: 'gemini-flash-latest',
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

      // For genuine syntax/runtime errors: clean up runner wrapper frames and tmp paths from stderr
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
  const hasKey = !!process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim() !== '' && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY';
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
      model: 'gemini-3.8-flash',
      instructions: !hasKey
        ? 'Vui lòng vào menu Settings > Secrets trong giao diện AI Studio để chọn hoặc kích hoạt khóa API.'
        : 'Sẵn sàng',
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
