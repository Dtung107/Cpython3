import React, { useState, useRef, useEffect } from 'react';
import {
  Sparkles,
  X,
  Send,
  Bot,
  User,
  Copy,
  Check,
  FileCode,
  RotateCcw,
  Lightbulb,
} from 'lucide-react';
import { requestAIChat, ChatMessage } from '../services/geminiService';

interface AIChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentCode: string;
  onInsertCodeToEditor: (codeSnippet: string) => void;
}

const QUICK_SUGGESTIONS = [
  'Giải thích logic đoạn mã này',
  'Tối ưu hóa và sửa lỗi',
  'Mẫu vẽ đồ thị Matplotlib đẹp',
  'Mẫu Kivy GUI cho Android APK',
  'Cách dùng input() không bị treo',
];

export const AIChatModal: React.FC<AIChatModalProps> = ({
  isOpen,
  onClose,
  currentCode,
  onInsertCodeToEditor,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    {
      id: 'welcome',
      role: 'assistant',
      content:
        'Xin chào! Tôi là Trợ Lý Lập Trình Python AI (Gemini 3.8 Flash) của bạn. Bạn muốn hỏi về thuật toán, sửa lỗi cú pháp hay cần tạo mã Python nào?',
      timestamp: Date.now(),
    },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 150);
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [isOpen, messages]);

  if (!isOpen) return null;

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputValue).trim();
    if (!text || isLoading) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };

    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInputValue('');
    setIsLoading(true);

    try {
      const reply = await requestAIChat(
        newMessages.map((m) => ({ role: m.role, content: m.content })),
        currentCode
      );

      const assistantMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: reply,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: any) {
      const errorMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `⚠️ Có lỗi khi kết nối với AI: ${err?.message || 'Vui lòng thử lại sau.'}`,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Helper to extract python code from markdown
  const extractCodeBlocks = (content: string) => {
    const regex = /```(?:python)?\s*([\s\S]*?)```/g;
    const blocks: string[] = [];
    let match;
    while ((match = regex.exec(content)) !== null) {
      blocks.push(match[1].trim());
    }
    return blocks;
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-200">
      <div
        className="w-full max-w-2xl h-[88vh] max-h-[750px] bg-[#161a24] border border-sky-500/40 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-slate-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-3 bg-[#1d2232] border-b border-slate-700/80 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-600 text-white shadow-md">
              <Sparkles className="w-5 h-5 text-yellow-300" />
            </div>
            <div>
              <h2 className="font-bold text-base text-slate-100 flex items-center space-x-2">
                <span>Trò Chuyện Cùng Trợ Lý AI</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] bg-sky-500/20 text-sky-300 font-semibold border border-sky-500/30">
                  Gemini 3.8 Flash
                </span>
              </h2>
              <p className="text-[11px] text-slate-400">
                Hỏi đáp mọi thắc mắc về Python, giải thuật, thư viện & tối ưu mã nguồn
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-1">
            <button
              onClick={() =>
                setMessages([
                  {
                    id: 'welcome',
                    role: 'assistant',
                    content: 'Cuộc trò chuyện đã được làm mới. Bạn cần hỗ trợ gì?',
                    timestamp: Date.now(),
                  },
                ])
              }
              title="Làm mới cuộc trò chuyện"
              className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Quick Suggestion Chips */}
        <div className="px-3 py-2 bg-[#12141c] border-b border-slate-800 flex items-center space-x-1.5 overflow-x-auto no-scrollbar shrink-0">
          <span className="text-[11px] text-slate-400 font-medium shrink-0 flex items-center space-x-1 pl-1">
            <Lightbulb className="w-3 h-3 text-amber-400" />
            <span>Gợi ý:</span>
          </span>
          {QUICK_SUGGESTIONS.map((sug, idx) => (
            <button
              key={idx}
              onClick={() => handleSendMessage(sug)}
              className="shrink-0 px-2.5 py-1 rounded-full bg-[#1e2330] hover:bg-sky-950/60 hover:text-sky-300 border border-slate-700 text-[11px] text-slate-300 transition active:scale-95"
            >
              {sug}
            </button>
          ))}
        </div>

        {/* Message Thread */}
        <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5">
          {messages.map((msg) => {
            const isUser = msg.role === 'user';
            const codeBlocks = !isUser ? extractCodeBlocks(msg.content) : [];

            return (
              <div
                key={msg.id}
                className={`flex items-start space-x-2.5 ${isUser ? 'flex-row-reverse space-x-reverse' : ''}`}
              >
                {/* Avatar */}
                <div
                  className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-xs shadow ${
                    isUser
                      ? 'bg-amber-500 text-slate-950 font-bold'
                      : 'bg-gradient-to-tr from-sky-500 to-indigo-600 text-white'
                  }`}
                >
                  {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                </div>

                {/* Bubble */}
                <div
                  className={`max-w-[85%] rounded-2xl p-3 text-xs sm:text-sm leading-relaxed ${
                    isUser
                      ? 'bg-amber-500/20 text-amber-100 border border-amber-500/40 rounded-tr-none'
                      : 'bg-[#1e2330] text-slate-200 border border-slate-700/80 rounded-tl-none select-text'
                  }`}
                >
                  <div className="whitespace-pre-wrap">{msg.content}</div>

                  {/* If assistant returned code block, provide 1-click Insert & Copy buttons */}
                  {codeBlocks.length > 0 && (
                    <div className="mt-2.5 pt-2 border-t border-slate-700/60 flex flex-wrap gap-2">
                      {codeBlocks.map((codeSnippet, bIdx) => (
                        <div key={bIdx} className="flex items-center space-x-1.5">
                          <button
                            onClick={() => {
                              onInsertCodeToEditor(codeSnippet);
                              onClose();
                            }}
                            className="px-2.5 py-1 rounded bg-emerald-600/30 hover:bg-emerald-600 text-emerald-300 hover:text-white border border-emerald-500/40 text-[11px] font-medium flex items-center space-x-1 transition active:scale-95"
                          >
                            <FileCode className="w-3 h-3" />
                            <span>Chèn mã vào Editor</span>
                          </button>

                          <button
                            onClick={() => copyToClipboard(codeSnippet, `${msg.id}_${bIdx}`)}
                            className="px-2.5 py-1 rounded bg-slate-700/60 hover:bg-slate-700 text-slate-300 text-[11px] flex items-center space-x-1 transition"
                          >
                            {copiedId === `${msg.id}_${bIdx}` ? (
                              <Check className="w-3 h-3 text-emerald-400" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                            <span>{copiedId === `${msg.id}_${bIdx}` ? 'Đã sao chép' : 'Sao chép'}</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {isLoading && (
            <div className="flex items-center space-x-2 text-slate-400 text-xs py-2 pl-9">
              <div className="w-4 h-4 rounded-full border-2 border-sky-400/30 border-t-sky-400 animate-spin" />
              <span>Gemini 3.8 Flash đang soạn câu trả lời...</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <div className="p-3 bg-[#1d2232] border-t border-slate-700/80 shrink-0">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="flex items-center space-x-2"
          >
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Nhập câu hỏi hoặc yêu cầu viết mã Python..."
              disabled={isLoading}
              className="flex-1 bg-[#11141c] border border-slate-700 focus:border-sky-400 rounded-xl px-3.5 py-2 text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={!inputValue.trim() || isLoading}
              className="px-4 py-2 bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 active:from-sky-600 active:to-indigo-600 disabled:opacity-40 text-white rounded-xl font-semibold flex items-center space-x-1.5 shadow-lg transition active:scale-95 text-xs sm:text-sm"
            >
              <span>Gửi</span>
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
