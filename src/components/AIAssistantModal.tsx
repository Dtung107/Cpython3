import React, { useState, useRef, useEffect } from 'react';
import {
  Sparkles,
  X,
  Check,
  Copy,
  AlertCircle,
  Lightbulb,
  Code2,
  BookOpen,
  RotateCw,
  FileCheck,
  Send,
  Bot,
  User,
  MessageSquareCode,
  Bug,
  FileCode,
  ArrowRight,
} from 'lucide-react';
import { AIDebugResult } from '../types';
import { requestAIChat, ChatMessage } from '../services/geminiService';

interface AIAssistantModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'chat' | 'debug' | 'explain';
  currentCode: string;
  errorOutput?: string;
  debugResult: AIDebugResult | null;
  isLoadingDebug: boolean;
  onRetryDebug: () => void;
  onApplyFixedCode: (fixedCode: string) => void;
  explanationText: string;
  isLoadingExplain: boolean;
  onAskExplain: () => void;
  onInsertCodeToEditor: (snippet: string) => void;
}

const QUICK_SUGGESTIONS = [
  'Giải thích logic đoạn mã này',
  'Tối ưu hóa và sửa lỗi',
  'Mẫu vẽ đồ thị Matplotlib đẹp',
  'Mẫu Kivy GUI cho Android APK',
  'Cách dùng input() không bị treo',
];

export const AIAssistantModal: React.FC<AIAssistantModalProps> = ({
  isOpen,
  onClose,
  initialTab = 'chat',
  currentCode,
  errorOutput,
  debugResult,
  isLoadingDebug,
  onRetryDebug,
  onApplyFixedCode,
  explanationText,
  isLoadingExplain,
  onAskExplain,
  onInsertCodeToEditor,
}) => {
  const [activeTab, setActiveTab] = useState<'chat' | 'debug' | 'explain'>(initialTab);

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    {
      id: 'welcome',
      role: 'assistant',
      content:
        'Xin chào! Tôi là Trợ Lý Lập Trình Python AI (Gemini Flash) của bạn. Bạn muốn hỏi về thuật toán, sửa lỗi cú pháp hay cần tạo mã Python nào?',
      timestamp: Date.now(),
    },
  ]);
  const [chatInput, setChatInput] = useState('');
  const [isLoadingChat, setIsLoadingChat] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [appliedDebug, setAppliedDebug] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);

  // Sync initial tab when opening
  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      if (initialTab === 'chat') {
        setTimeout(() => chatInputRef.current?.focus(), 150);
      }
    }
  }, [isOpen, initialTab]);

  useEffect(() => {
    if (isOpen && activeTab === 'chat') {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen, activeTab]);

  if (!isOpen) return null;

  const handleSendChatMessage = async (textToSend?: string) => {
    const text = (textToSend || chatInput).trim();
    if (!text || isLoadingChat) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };

    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setChatInput('');
    setIsLoadingChat(true);

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
      let friendlyError = 'Không thể kết nối đến Trợ lý AI lúc này. Vui lòng thử lại sau giây lát.';
      const raw = err?.message || '';
      if (raw.includes('503') || raw.includes('high demand') || raw.includes('UNAVAILABLE')) {
        friendlyError = 'Hệ thống AI đang xử lý lượng yêu cầu cao. Chúng tôi đã tự động kết nối lại, bạn vui lòng nhấn gửi lại nhé!';
      } else if (raw.includes('429') || raw.includes('RESOURCE_EXHAUSTED')) {
        friendlyError = 'Hệ thống AI đang tạm thời đạt giới hạn lưu lượng miễn phí. Vui lòng thử lại sau 1-2 phút nhé!';
      } else if (raw.includes('Failed to fetch') || raw.includes('NetworkError')) {
        friendlyError = 'Không thể kết nối đến Máy chủ AI Cloud. Vui lòng kiểm tra kết nối mạng của thiết bị hoặc nhấn Menu > Cấu hình Máy Chủ.';
      }

      const errorMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `⚠️ ${friendlyError}`,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoadingChat(false);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleApplyFixed = () => {
    if (debugResult?.fixedCode) {
      onApplyFixedCode(debugResult.fixedCode);
      setAppliedDebug(true);
      setTimeout(() => {
        setAppliedDebug(false);
        onClose();
      }, 700);
    }
  };

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
        className="w-full max-w-2xl h-[92vh] max-h-[760px] bg-[#161a25] border border-slate-700/80 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-slate-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with Title and Model Badge */}
        <div className="px-4 py-3 bg-[#1e2333] border-b border-slate-700/80 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-gradient-to-tr from-sky-500 via-indigo-500 to-amber-500 text-white shadow-md">
              <Sparkles className="w-5 h-5 text-yellow-300" />
            </div>
            <div>
              <h2 className="font-bold text-base text-slate-100 flex items-center space-x-2">
                <span>Trợ Lý Lập Trình AI</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] bg-sky-500/20 text-sky-300 font-semibold border border-sky-500/30">
                  Gemini Flash AI
                </span>
              </h2>
              <p className="text-[11px] text-slate-400">
                Gỡ lỗi thông minh, giải thích mã nguồn & trò chuyện trực tiếp 24/7
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-1">
            <button
              onClick={() => {
                if (activeTab === 'chat') {
                  setMessages([
                    {
                      id: 'welcome',
                      role: 'assistant',
                      content: 'Cuộc trò chuyện đã được làm mới. Bạn cần hỗ trợ gì?',
                      timestamp: Date.now(),
                    },
                  ]);
                } else if (activeTab === 'debug') {
                  onRetryDebug();
                } else {
                  onAskExplain();
                }
              }}
              title="Làm mới"
              className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition"
            >
              <RotateCw className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 3 Unified Tabs: Trò Chuyện (Chat), Gỡ Lỗi (Debug), Giải Thích (Explain) */}
        <div className="flex items-center bg-[#12151e] px-3 pt-2 border-b border-slate-800 text-xs shrink-0 overflow-x-auto">
          <button
            onClick={() => setActiveTab('chat')}
            className={`pb-2 px-3 font-semibold border-b-2 flex items-center space-x-1.5 transition ${
              activeTab === 'chat'
                ? 'border-sky-500 text-sky-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <MessageSquareCode className="w-3.5 h-3.5" />
            <span>Trò Chuyện AI</span>
          </button>

          <button
            onClick={() => setActiveTab('debug')}
            className={`pb-2 px-3 font-semibold border-b-2 flex items-center space-x-1.5 transition ${
              activeTab === 'debug'
                ? 'border-rose-500 text-rose-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Bug className="w-3.5 h-3.5" />
            <span>Gỡ Lỗi & Tự Sửa Mã</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('explain');
              if (!explanationText && !isLoadingExplain) {
                onAskExplain();
              }
            }}
            className={`pb-2 px-3 font-semibold border-b-2 flex items-center space-x-1.5 transition ${
              activeTab === 'explain'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Giải Thích Mã</span>
          </button>
        </div>

        {/* TAB 1: TRÒ CHUYỆN AI (CHAT ASSISTANT) */}
        {activeTab === 'chat' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Quick Suggestions Chips */}
            <div className="px-3 py-1.5 bg-[#141722] border-b border-slate-800 flex items-center space-x-1.5 overflow-x-auto no-scrollbar shrink-0">
              <span className="text-[10px] text-amber-400 font-bold shrink-0 flex items-center space-x-1 pl-1">
                <Lightbulb className="w-3 h-3 text-amber-400" />
                <span>Gợi ý:</span>
              </span>
              {QUICK_SUGGESTIONS.map((sug, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSendChatMessage(sug)}
                  className="shrink-0 px-2.5 py-1 rounded-full bg-[#1e2332] hover:bg-sky-950/60 hover:text-sky-300 border border-slate-700/80 text-[11px] text-slate-300 transition active:scale-95"
                >
                  {sug}
                </button>
              ))}
            </div>

            {/* Chat Thread */}
            <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5">
              {messages.map((msg) => {
                const isUser = msg.role === 'user';
                const codeBlocks = !isUser ? extractCodeBlocks(msg.content) : [];

                return (
                  <div
                    key={msg.id}
                    className={`flex items-start space-x-2.5 ${isUser ? 'flex-row-reverse space-x-reverse' : ''}`}
                  >
                    <div
                      className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-xs shadow ${
                        isUser
                          ? 'bg-amber-500 text-slate-950 font-bold'
                          : 'bg-gradient-to-tr from-sky-500 to-indigo-600 text-white'
                      }`}
                    >
                      {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                    </div>

                    <div
                      className={`max-w-[85%] rounded-2xl p-3 text-xs sm:text-sm leading-relaxed ${
                        isUser
                          ? 'bg-amber-500/20 text-amber-100 border border-amber-500/40 rounded-tr-none'
                          : 'bg-[#1e2332] text-slate-200 border border-slate-700/80 rounded-tl-none select-text'
                      }`}
                    >
                      <div className="whitespace-pre-wrap">{msg.content}</div>

                      {codeBlocks.length > 0 && (
                        <div className="mt-2.5 pt-2 border-t border-slate-700/60 flex flex-wrap gap-2">
                          {codeBlocks.map((snippet, bIdx) => (
                            <div key={bIdx} className="flex items-center space-x-1.5">
                              <button
                                onClick={() => {
                                  onInsertCodeToEditor(snippet);
                                  onClose();
                                }}
                                className="px-2.5 py-1 rounded bg-emerald-600/30 hover:bg-emerald-600 text-emerald-300 hover:text-white border border-emerald-500/40 text-[11px] font-medium flex items-center space-x-1 transition active:scale-95"
                              >
                                <FileCode className="w-3 h-3" />
                                <span>Chèn mã vào Editor</span>
                              </button>

                              <button
                                onClick={() => copyToClipboard(snippet, `${msg.id}_${bIdx}`)}
                                className="px-2.5 py-1 rounded bg-slate-700/60 hover:bg-slate-700 text-slate-300 text-[11px] flex items-center space-x-1 transition"
                              >
                                {copiedId === `${msg.id}_${bIdx}` ? (
                                  <Check className="w-3 h-3 text-emerald-400" />
                                ) : (
                                  <Copy className="w-3 h-3" />
                                )}
                                <span>{copiedId === `${msg.id}_${bIdx}` ? 'Đã chép' : 'Sao chép'}</span>
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {isLoadingChat && (
                <div className="flex items-center space-x-2 text-slate-400 text-xs py-2 pl-9">
                  <div className="w-4 h-4 rounded-full border-2 border-sky-400/30 border-t-sky-400 animate-spin" />
                  <span>Trợ lý AI đang suy nghĩ câu trả lời...</span>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Chat Input Bar */}
            <div className="p-3 bg-[#1e2333] border-t border-slate-700/80 shrink-0">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendChatMessage();
                }}
                className="flex items-center space-x-2"
              >
                <input
                  ref={chatInputRef}
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Nhập câu hỏi hoặc yêu cầu viết mã Python..."
                  disabled={isLoadingChat}
                  className="flex-1 bg-[#12141d] border border-slate-700 focus:border-sky-400 rounded-xl px-3.5 py-2 text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={!chatInput.trim() || isLoadingChat}
                  className="px-4 py-2 bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 active:from-sky-600 active:to-indigo-600 disabled:opacity-40 text-white rounded-xl font-semibold flex items-center space-x-1.5 shadow-lg transition active:scale-95 text-xs sm:text-sm"
                >
                  <span>Gửi</span>
                  <Send className="w-3.5 h-3.5" />
                </button>
              </form>
            </div>
          </div>
        )}

        {/* TAB 2: GỠ LỖI & TỰ SỬA MÃ (AI DEBUGGER) */}
        {activeTab === 'debug' && (
          <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
            {isLoadingDebug ? (
              <div className="py-16 flex flex-col items-center justify-center space-y-3 text-slate-400">
                <div className="w-12 h-12 rounded-full border-2 border-rose-500/20 border-t-rose-400 animate-spin" />
                <p className="text-sm font-medium text-slate-300">
                  AI đang quét Traceback và phân tích cú pháp...
                </p>
                <p className="text-xs text-slate-500">
                  Đang sửa toàn bộ mã nguồn sẵn sàng chạy lại
                </p>
              </div>
            ) : debugResult ? (
              <>
                {/* Error Summary Banner */}
                <div className="p-3.5 rounded-xl bg-rose-950/30 border border-rose-800/50 flex items-start space-x-3">
                  <div className="p-2 rounded-lg bg-rose-900/50 text-rose-400 shrink-0">
                    <AlertCircle className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2 flex-wrap gap-1">
                      <span className="px-2 py-0.5 rounded text-xs font-bold bg-rose-900/60 text-rose-200 border border-rose-700/60 font-mono">
                        {debugResult.errorType || 'Lỗi Thực Thi'}
                      </span>
                      {debugResult.lineNumber ? (
                        <span className="px-2 py-0.5 rounded text-xs bg-amber-950/60 text-amber-300 border border-amber-800/50 font-mono">
                          Dòng {debugResult.lineNumber}
                        </span>
                      ) : null}
                    </div>
                    <p className="text-sm font-semibold text-slate-100 mt-1.5">
                      {debugResult.summary}
                    </p>
                  </div>
                </div>

                {/* Explanation */}
                <div className="p-3.5 rounded-xl bg-[#191d2a] border border-slate-800">
                  <h3 className="text-xs font-bold text-sky-400 uppercase tracking-wider mb-2 flex items-center space-x-1.5">
                    <Lightbulb className="w-3.5 h-3.5" />
                    <span>Nguyên Nhân &amp; Cách Khắc Phục</span>
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-300 leading-relaxed whitespace-pre-line">
                    {debugResult.explanation}
                  </p>
                </div>

                {/* Fixed Code Box */}
                {debugResult.fixedCode && (
                  <div className="rounded-xl bg-[#11131a] border border-slate-700/80 overflow-hidden shadow-inner">
                    <div className="px-3 py-2 bg-[#1b202e] border-b border-slate-700/70 flex items-center justify-between text-xs">
                      <span className="font-semibold text-emerald-400 flex items-center space-x-1.5">
                        <Code2 className="w-4 h-4" />
                        <span>Mã Nguồn Đã Được AI Sửa Hoàn Chỉnh</span>
                      </span>
                      <button
                        onClick={() => copyToClipboard(debugResult.fixedCode, 'fixed')}
                        className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center space-x-1 text-[11px]"
                      >
                        {copiedId === 'fixed' ? (
                          <Check className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                        <span>{copiedId === 'fixed' ? 'Đã sao chép' : 'Sao chép'}</span>
                      </button>
                    </div>
                    <pre className="p-3 text-xs font-mono text-emerald-200 bg-[#0c0e14] overflow-x-auto max-h-56 leading-relaxed select-text">
                      {debugResult.fixedCode}
                    </pre>
                  </div>
                )}

                {/* Switch to Chat to discuss further */}
                <div className="flex items-center justify-between p-2.5 bg-[#171b28] rounded-xl border border-slate-800 text-xs">
                  <span className="text-slate-400">Bạn muốn hỏi thêm chi tiết về lỗi này?</span>
                  <button
                    onClick={() => {
                      setActiveTab('chat');
                      handleSendChatMessage(`Tôi đang gặp lỗi ${debugResult.errorType}: "${debugResult.summary}". Bạn có thể giải thích chi tiết hơn cho tôi không?`);
                    }}
                    className="px-3 py-1 bg-sky-600/30 hover:bg-sky-600 text-sky-200 hover:text-white rounded-lg font-medium flex items-center space-x-1 transition"
                  >
                    <span>Hỏi AI trong Chat</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              </>
            ) : (
              <div className="py-12 text-center text-slate-400 text-xs space-y-3">
                <p>Không phát hiện lỗi runtime nào gần đây.</p>
                <button
                  onClick={onRetryDebug}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold inline-flex items-center space-x-1.5 shadow"
                >
                  <Bug className="w-4 h-4" />
                  <span>Quét &amp; Kiểm tra mã nguồn hiện tại</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: GIẢI THÍCH MÃ NGUỒN (EXPLAIN) */}
        {activeTab === 'explain' && (
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {isLoadingExplain ? (
              <div className="py-14 flex flex-col items-center justify-center space-y-2 text-slate-400">
                <div className="w-8 h-8 rounded-full border-2 border-indigo-500/20 border-t-indigo-400 animate-spin" />
                <p className="text-xs">AI đang giải thích cấu trúc mã...</p>
              </div>
            ) : explanationText ? (
              <div className="p-4 rounded-xl bg-[#191d2a] border border-slate-800 text-xs sm:text-sm text-slate-200 leading-relaxed whitespace-pre-wrap select-text">
                {explanationText}
              </div>
            ) : (
              <div className="py-10 text-center">
                <button
                  onClick={onAskExplain}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold inline-flex items-center space-x-2 shadow"
                >
                  <BookOpen className="w-4 h-4" />
                  <span>Yêu cầu AI giải thích toàn bộ mã nguồn</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* Footer (Apply button when on debug tab) */}
        {activeTab === 'debug' && debugResult?.fixedCode && (
          <div className="px-4 py-2.5 bg-[#1e2333] border-t border-slate-700/80 flex items-center justify-between shrink-0">
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition"
            >
              Đóng
            </button>

            <button
              onClick={handleApplyFixed}
              disabled={appliedDebug}
              className="px-4 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs flex items-center space-x-1.5 shadow-lg active:scale-95 transition"
            >
              {appliedDebug ? (
                <>
                  <Check className="w-4 h-4" />
                  <span>Đã áp dụng vào Editor!</span>
                </>
              ) : (
                <>
                  <FileCheck className="w-4 h-4" />
                  <span>Áp Dụng Mã Đã Sửa Vào Editor</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
