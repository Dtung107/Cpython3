import React, { useState } from 'react';
import {
  SlidersHorizontal,
  Save,
  X,
  Plus,
  Search,
  ArrowUp,
  ArrowDown,
  ChevronsUp,
  Eye,
  EyeOff,
  RotateCcw,
  Check,
  Trash2,
  Copy,
  Download,
  UserCheck,
  Sparkles,
} from 'lucide-react';
import {
  ShortcutKey,
  KeySize,
  DEFAULT_SHORTCUTS,
  PRESET_KEYBOARDS,
} from '../types/shortcuts';

interface ShortcutConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  shortcuts: ShortcutKey[];
  onSaveShortcuts: (updated: ShortcutKey[], keySize: KeySize) => void;
  currentKeySize: KeySize;
}

export const ShortcutConfigModal: React.FC<ShortcutConfigModalProps> = ({
  isOpen,
  onClose,
  shortcuts: initialShortcuts,
  onSaveShortcuts,
  currentKeySize,
}) => {
  const [shortcuts, setShortcuts] = useState<ShortcutKey[]>(initialShortcuts);
  const [keySize, setKeySize] = useState<KeySize>(currentKeySize);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'custom' | 'char' | 'keyword'>('all');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newInsertText, setNewInsertText] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  if (!isOpen) return null;

  // Move item up, down, or to top
  const moveItem = (fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= shortcuts.length) return;
    const updated = [...shortcuts];
    const [moved] = updated.splice(fromIndex, 1);
    updated.splice(toIndex, 0, moved);
    setShortcuts(updated);
  };

  const moveToTop = (index: number) => {
    moveItem(index, 0);
  };

  const toggleVisibility = (id: string) => {
    setShortcuts((prev) =>
      prev.map((k) => (k.id === id ? { ...k, visible: !k.visible } : k))
    );
  };

  const handleDeleteCustom = (id: string) => {
    setShortcuts((prev) => prev.filter((k) => k.id !== id));
  };

  const handleApplyPreset = (presetKey: string) => {
    const preset = PRESET_KEYBOARDS[presetKey];
    if (!preset) return;
    const keySet = new Set(preset.keys);
    const updated = shortcuts.map((k) => ({
      ...k,
      visible: keySet.has(k.id),
    }));
    // Reorder matching keys to front
    const front = updated.filter((k) => keySet.has(k.id));
    const rest = updated.filter((k) => !keySet.has(k.id));
    setShortcuts([...front, ...rest]);
  };

  const handleSaveProfile = () => {
    localStorage.setItem('pydroid_user_shortcuts', JSON.stringify({ shortcuts, keySize }));
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);
  };

  const handleLoadProfile = () => {
    const saved = localStorage.getItem('pydroid_user_shortcuts');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.shortcuts) setShortcuts(parsed.shortcuts);
        if (parsed.keySize) setKeySize(parsed.keySize);
        alert('Đã tải hồ sơ phím tắt cá nhân của bạn!');
      } catch (e) {}
    } else {
      alert('Chưa có hồ sơ phím tắt nào được lưu trước đó.');
    }
  };

  const handleAddCustomKey = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLabel.trim() || !newInsertText) return;

    const newKey: ShortcutKey = {
      id: `custom_${Date.now()}`,
      label: newLabel.trim(),
      insertText: newInsertText,
      category: 'custom',
      description: newDesc.trim() || `Chèn "${newInsertText}"`,
      visible: true,
    };

    setShortcuts([newKey, ...shortcuts]);
    setNewLabel('');
    setNewInsertText('');
    setNewDesc('');
    setShowAddForm(false);
  };

  const handleResetDefault = () => {
    if (confirm('Khôi phục danh sách và thứ tự phím tắt ban đầu của Pydroid?')) {
      setShortcuts(DEFAULT_SHORTCUTS);
      setKeySize('medium');
    }
  };

  const handleComplete = () => {
    onSaveShortcuts(shortcuts, keySize);
    onClose();
  };

  // Drag and drop handlers
  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;
    moveItem(draggedIndex, index);
    setDraggedIndex(index);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  // Filters
  const visibleCount = shortcuts.filter((k) => k.visible).length;
  const filteredShortcuts = shortcuts.filter((k) => {
    const matchesSearch =
      k.label.toLowerCase().includes(search.toLowerCase()) ||
      (k.description || '').toLowerCase().includes(search.toLowerCase()) ||
      k.insertText.toLowerCase().includes(search.toLowerCase());

    if (!matchesSearch) return false;

    if (categoryFilter === 'custom') return k.category === 'custom';
    if (categoryFilter === 'char') return k.category === 'char' || k.category === 'operator';
    if (categoryFilter === 'keyword') return k.category === 'keyword';
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-200">
      <div
        className="w-full max-w-xl max-h-[94vh] bg-[#1a1d29] border border-amber-500/30 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-slate-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header (Screenshot 4) */}
        <div className="px-4 py-3 bg-[#202534] border-b border-slate-700/80 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-amber-500 text-slate-950 font-bold shadow-md">
              <SlidersHorizontal className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-base text-amber-400">
                Cấu hình &amp; Lưu Phím tắt
              </h2>
              <p className="text-[11px] text-slate-400">
                Tùy biến vị trí, thêm phím mới &amp; lưu cấu hình của bạn
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-1.5">
            <button
              onClick={handleSaveProfile}
              title="Lưu cấu hình ngay"
              className="p-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white transition shadow"
            >
              <Save className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl hover:bg-slate-700 text-slate-400 hover:text-white transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Section: Kích thước phím (Screenshot 4) */}
          <div className="space-y-1.5">
            <div className="text-xs font-bold text-slate-300">
              Kích thước phím (Độ cao &amp; Vùng bấm):
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { size: 'small' as KeySize, label: 'Nhỏ (Tiết kiệm)' },
                { size: 'medium' as KeySize, label: 'Vừa (Chuẩn Pydroid)' },
                { size: 'large' as KeySize, label: 'Lớn (Dễ bấm)' },
              ].map((opt) => (
                <button
                  key={opt.size}
                  onClick={() => setKeySize(opt.size)}
                  className={`py-2 px-2 rounded-xl text-xs font-semibold border transition-all text-center ${
                    keySize === opt.size
                      ? 'bg-[#222838] border-amber-400 text-amber-300 shadow-md ring-1 ring-amber-400/50'
                      : 'bg-[#181c27] border-slate-700/80 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Section: Bộ phím mẫu & Hồ sơ (Screenshot 4) */}
          <div className="space-y-2">
            <div className="text-xs font-bold text-amber-400 flex items-center space-x-1">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>Bộ phím mẫu &amp; Hồ sơ người dùng:</span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                onClick={() => handleApplyPreset('default')}
                className="p-2 rounded-xl bg-[#1d2230] hover:bg-[#252b3d] border border-slate-700 text-slate-200 text-left font-medium transition active:scale-95"
              >
                ⭐ Mặc định Pydroid
              </button>
              <button
                onClick={() => handleApplyPreset('math')}
                className="p-2 rounded-xl bg-[#1d2230] hover:bg-[#252b3d] border border-slate-700 text-slate-200 text-left font-medium transition active:scale-95"
              >
                🔢 Toán học &amp; Lôgic
              </button>
              <button
                onClick={() => handleApplyPreset('structure')}
                className="p-2 rounded-xl bg-[#1d2230] hover:bg-[#252b3d] border border-slate-700 text-slate-200 text-left font-medium transition active:scale-95"
              >
                ⚡ Hàm &amp; Cấu trúc
              </button>
              <button
                onClick={() => handleApplyPreset('minimal')}
                className="p-2 rounded-xl bg-[#1d2230] hover:bg-[#252b3d] border border-slate-700 text-slate-200 text-left font-medium transition active:scale-95"
              >
                🎯 Tối giản (14 phím)
              </button>
            </div>

            {/* Profile buttons */}
            <div className="flex items-center space-x-2 pt-1 text-xs">
              <button
                onClick={handleSaveProfile}
                className="flex-1 py-1.5 px-3 rounded-xl bg-[#222736] hover:bg-slate-700 border border-slate-700 text-amber-300 font-medium flex items-center justify-center space-x-1.5 transition active:scale-95"
              >
                <UserCheck className="w-3.5 h-3.5" />
                <span>Lưu vào Hồ sơ của tôi</span>
              </button>
              <button
                onClick={handleLoadProfile}
                className="flex-1 py-1.5 px-3 rounded-xl bg-[#222736] hover:bg-slate-700 border border-slate-700 text-emerald-300 font-medium flex items-center justify-center space-x-1.5 transition active:scale-95"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Tải Hồ sơ của tôi</span>
              </button>
            </div>

            {savedSuccess && (
              <div className="text-center text-[11px] text-emerald-400 font-semibold bg-emerald-950/40 py-1 rounded-lg border border-emerald-800/60">
                ✓ Đã lưu cấu hình phím tắt cá nhân của bạn thành công!
              </div>
            )}
          </div>

          {/* Section: Thêm phím tắt tùy chỉnh (Screenshot 4) */}
          <div className="flex items-center justify-between pt-1">
            <span className="text-xs font-bold text-slate-300">Thêm phím tắt tùy chỉnh:</span>
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-bold flex items-center space-x-1 transition active:scale-95"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Thêm phím mới</span>
            </button>
          </div>

          {/* Inline Add Custom Key Form */}
          {showAddForm && (
            <form
              onSubmit={handleAddCustomKey}
              className="p-3 bg-[#161924] rounded-xl border border-amber-500/40 space-y-2.5 text-xs animate-in fade-in duration-150"
            >
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-400 mb-1">Ký tự hiển thị (Label):</label>
                  <input
                    type="text"
                    placeholder="ví dụ: lambda"
                    value={newLabel}
                    onChange={(e) => setNewLabel(e.target.value)}
                    required
                    className="w-full bg-[#11131a] border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-100 font-mono focus:outline-none focus:border-amber-400"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Văn bản chèn (Insert):</label>
                  <input
                    type="text"
                    placeholder="ví dụ: lambda :"
                    value={newInsertText}
                    onChange={(e) => setNewInsertText(e.target.value)}
                    required
                    className="w-full bg-[#11131a] border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-100 font-mono focus:outline-none focus:border-amber-400"
                  />
                </div>
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Mô tả phím:</label>
                <input
                  type="text"
                  placeholder="ví dụ: Hàm ẩn danh lambda"
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  className="w-full bg-[#11131a] border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-100 focus:outline-none focus:border-amber-400"
                />
              </div>
              <div className="flex justify-end space-x-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="px-3 py-1 rounded-lg bg-slate-800 text-slate-400 hover:text-white"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-3.5 py-1 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold"
                >
                  Thêm vào danh sách
                </button>
              </div>
            </form>
          )}

          {/* Search Bar & Filters (Screenshot 4) */}
          <div className="space-y-2 pt-1">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Tìm phím nhanh..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-[#12141c] border border-slate-700/80 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-amber-400"
              />
            </div>

            <div className="flex items-center space-x-1.5 overflow-x-auto no-scrollbar text-xs">
              <button
                onClick={() => setCategoryFilter('all')}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition ${
                  categoryFilter === 'all'
                    ? 'bg-amber-400 text-slate-950 shadow'
                    : 'bg-[#1e2330] text-slate-400 hover:text-slate-200'
                }`}
              >
                Tất cả ({shortcuts.length})
              </button>
              <button
                onClick={() => setCategoryFilter('custom')}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition ${
                  categoryFilter === 'custom'
                    ? 'bg-amber-400 text-slate-950 shadow'
                    : 'bg-[#1e2330] text-slate-400 hover:text-slate-200'
                }`}
              >
                Tùy chỉnh ({shortcuts.filter((k) => k.category === 'custom').length})
              </button>
              <button
                onClick={() => setCategoryFilter('char')}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition ${
                  categoryFilter === 'char'
                    ? 'bg-amber-400 text-slate-950 shadow'
                    : 'bg-[#1e2330] text-slate-400 hover:text-slate-200'
                }`}
              >
                Ký tự
              </button>
              <button
                onClick={() => setCategoryFilter('keyword')}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition ${
                  categoryFilter === 'keyword'
                    ? 'bg-amber-400 text-slate-950 shadow'
                    : 'bg-[#1e2330] text-slate-400 hover:text-slate-200'
                }`}
              >
                Từ khóa
              </button>
            </div>
          </div>

          {/* Section: Reorder List (Screenshot 4) */}
          <div>
            <div className="text-[11px] font-semibold text-slate-400 mb-2 flex items-center justify-between">
              <span>
                Kéo thả hoặc bấm ▲ ▼ để sắp xếp thứ tự:
              </span>
              <span className="text-amber-400 font-bold">
                {visibleCount}/{shortcuts.length} đang hiển thị trên thanh
              </span>
            </div>

            <div className="space-y-1.5 max-h-[38vh] overflow-y-auto pr-1">
              {filteredShortcuts.map((keyItem) => {
                const globalIndex = shortcuts.findIndex((k) => k.id === keyItem.id);

                return (
                  <div
                    key={keyItem.id}
                    draggable
                    onDragStart={() => handleDragStart(globalIndex)}
                    onDragOver={(e) => handleDragOver(e, globalIndex)}
                    onDragEnd={handleDragEnd}
                    className={`p-2 rounded-xl bg-[#1f2433] border transition-all flex items-center justify-between space-x-2 ${
                      keyItem.visible
                        ? 'border-slate-700/80 text-slate-200'
                        : 'border-slate-800/60 opacity-50 text-slate-500'
                    } ${draggedIndex === globalIndex ? 'border-amber-400 bg-amber-950/30' : ''}`}
                  >
                    {/* Drag Handle + Key badge + Label */}
                    <div className="flex items-center space-x-2.5 min-w-0 flex-1">
                      <div className="cursor-grab active:cursor-grabbing text-slate-500 hover:text-slate-300 font-mono text-sm px-1 select-none">
                        :::
                      </div>

                      <div className="w-10 h-8 rounded-lg bg-[#141722] border border-slate-700/80 flex items-center justify-center font-mono text-xs font-bold text-amber-300 shrink-0 shadow-inner">
                        {keyItem.label}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="font-mono text-xs font-semibold truncate text-slate-100">
                          {keyItem.label}
                        </div>
                        <div className="text-[10px] text-slate-400 truncate">
                          &quot;{keyItem.description || keyItem.insertText}&quot;
                        </div>
                      </div>
                    </div>

                    {/* Actions: Move Top, Up, Down, Eye Toggle */}
                    <div className="flex items-center space-x-1 shrink-0 text-slate-400">
                      <button
                        onClick={() => moveToTop(globalIndex)}
                        title="Đưa lên đầu danh sách"
                        className="p-1 hover:text-amber-300 rounded hover:bg-slate-700/60"
                      >
                        <ChevronsUp className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => moveItem(globalIndex, globalIndex - 1)}
                        disabled={globalIndex === 0}
                        title="Di chuyển lên trên"
                        className="p-1 hover:text-white rounded hover:bg-slate-700/60 disabled:opacity-30"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => moveItem(globalIndex, globalIndex + 1)}
                        disabled={globalIndex === shortcuts.length - 1}
                        title="Di chuyển xuống dưới"
                        className="p-1 hover:text-white rounded hover:bg-slate-700/60 disabled:opacity-30"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => toggleVisibility(keyItem.id)}
                        title={keyItem.visible ? 'Ẩn phím này' : 'Hiện phím này'}
                        className={`p-1.5 rounded transition ${
                          keyItem.visible
                            ? 'text-emerald-400 hover:bg-emerald-950/40'
                            : 'text-slate-600 hover:text-slate-400'
                        }`}
                      >
                        {keyItem.visible ? (
                          <Eye className="w-3.5 h-3.5" />
                        ) : (
                          <EyeOff className="w-3.5 h-3.5" />
                        )}
                      </button>

                      {keyItem.category === 'custom' && (
                        <button
                          onClick={() => handleDeleteCustom(keyItem.id)}
                          title="Xóa phím tùy chỉnh"
                          className="p-1 hover:text-rose-400 rounded"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer (Screenshot 4) */}
        <div className="px-4 py-3 bg-[#202534] border-t border-slate-700/80 flex items-center justify-between shrink-0">
          <button
            onClick={handleResetDefault}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Mặc định</span>
          </button>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleSaveProfile}
              className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center space-x-1.5 shadow transition active:scale-95"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Lưu cấu hình</span>
            </button>

            <button
              onClick={handleComplete}
              className="px-5 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 active:bg-amber-500 text-slate-950 font-bold text-xs sm:text-sm shadow-lg transition active:scale-95"
            >
              Hoàn tất
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
