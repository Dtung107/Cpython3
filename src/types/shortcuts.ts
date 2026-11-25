export interface ShortcutKey {
  id: string;
  label: string;
  insertText: string;
  cursorOffset?: number; // offset from end of inserted text to place cursor
  category: 'char' | 'keyword' | 'operator' | 'custom';
  description?: string;
  visible: boolean;
  isHighlight?: boolean;
}

export type KeySize = 'small' | 'medium' | 'large';

export const DEFAULT_SHORTCUTS: ShortcutKey[] = [
  { id: 'tab', label: 'Tab', insertText: '    ', category: 'char', description: 'Thụt dòng 4 dấu cách', visible: true, isHighlight: true },
  { id: 'colon', label: ':', insertText: ':', category: 'char', description: 'Dấu hai chấm kết khối', visible: true },
  { id: 'paren_open', label: '(', insertText: '(', category: 'char', description: 'Mở ngoặc tròn', visible: true },
  { id: 'paren_close', label: ')', insertText: ')', category: 'char', description: 'Đóng ngoặc tròn', visible: true },
  { id: 'bracket_open', label: '[', insertText: '[', category: 'char', description: 'Mở ngoặc vuông', visible: true },
  { id: 'bracket_close', label: ']', insertText: ']', category: 'char', description: 'Đóng ngoặc vuông', visible: true },
  { id: 'brace_open', label: '{', insertText: '{', category: 'char', description: 'Mở ngoặc nhọn', visible: true },
  { id: 'brace_close', label: '}', insertText: '}', category: 'char', description: 'Đóng ngoặc nhọn', visible: true },
  { id: 'quote_double', label: '"', insertText: '"', category: 'char', description: 'Dấu nháy kép', visible: true },
  { id: 'quote_single', label: "'", insertText: "'", category: 'char', description: 'Dấu nháy đơn', visible: true },
  { id: 'equals', label: '=', insertText: ' = ', category: 'operator', description: 'Toán tử gán giá trị', visible: true },
  { id: 'comma', label: ',', insertText: ', ', category: 'char', description: 'Dấu phẩy phân tách', visible: true },
  { id: 'dot', label: '.', insertText: '.', category: 'char', description: 'Dấu chấm truy xuất thuộc tính', visible: true },
  { id: 'underscore', label: '_', insertText: '_', category: 'char', description: 'Dấu gạch dưới', visible: true },
  { id: 'plus', label: '+', insertText: ' + ', category: 'operator', description: 'Toán tử cộng', visible: true },
  { id: 'minus', label: '-', insertText: ' - ', category: 'operator', description: 'Toán tử trừ', visible: true },
  { id: 'mul', label: '*', insertText: '*', category: 'operator', description: 'Toán tử nhân', visible: true },
  { id: 'div', label: '/', insertText: '/', category: 'operator', description: 'Toán tử chia', visible: true },
  { id: 'percent', label: '%', insertText: ' % ', category: 'operator', description: 'Chia lấy dư / Format', visible: true },
  { id: 'eq_eq', label: '==', insertText: ' == ', category: 'operator', description: 'So sánh bằng', visible: true },
  { id: 'not_eq', label: '!=', insertText: ' != ', category: 'operator', description: 'So sánh khác', visible: true },
  { id: 'lt', label: '<', insertText: ' < ', category: 'operator', description: 'So sánh nhỏ hơn', visible: true },
  { id: 'gt', label: '>', insertText: ' > ', category: 'operator', description: 'So sánh lớn hơn', visible: true },
  { id: 'lte', label: '<=', insertText: ' <= ', category: 'operator', description: 'Nhỏ hơn hoặc bằng', visible: true },
  { id: 'gte', label: '>=', insertText: ' >= ', category: 'operator', description: 'Lớn hơn hoặc bằng', visible: true },
  { id: 'arrow', label: '->', insertText: ' -> ', category: 'operator', description: 'Khai báo kiểu trả về', visible: true },
  { id: 'backslash', label: '\\', insertText: '\\', category: 'char', description: 'Dấu gạch chéo ngược', visible: true },
  { id: 'hash', label: '#', insertText: '# ', category: 'char', description: 'Ghi chú bình luận', visible: true },
  { id: 'kw_def', label: 'def', insertText: 'def ', category: 'keyword', description: 'Định nghĩa hàm', visible: true },
  { id: 'kw_class', label: 'class', insertText: 'class ', category: 'keyword', description: 'Định nghĩa lớp đối tượng', visible: true },
  { id: 'kw_if', label: 'if', insertText: 'if ', category: 'keyword', description: 'Câu lệnh điều kiện if', visible: true },
  { id: 'kw_else', label: 'else', insertText: 'else:\n    ', category: 'keyword', description: 'Khối rẽ nhánh else', visible: true },
  { id: 'kw_elif', label: 'elif', insertText: 'elif ', category: 'keyword', description: 'Khối rẽ nhánh elif', visible: true },
  { id: 'kw_for', label: 'for', insertText: 'for ', category: 'keyword', description: 'Vòng lặp for', visible: true },
  { id: 'kw_while', label: 'while', insertText: 'while ', category: 'keyword', description: 'Vòng lặp while', visible: true },
  { id: 'kw_in', label: 'in', insertText: ' in ', category: 'keyword', description: 'Toán tử thành viên in', visible: true },
  { id: 'kw_import', label: 'import', insertText: 'import ', category: 'keyword', description: 'Nạp thư viện', visible: true },
  { id: 'kw_from', label: 'from', insertText: 'from ', category: 'keyword', description: 'Nạp từ gói', visible: true },
  { id: 'kw_return', label: 'return', insertText: 'return ', category: 'keyword', description: 'Trả về giá trị', visible: true },
  { id: 'kw_print', label: 'print', insertText: 'print', category: 'keyword', description: 'Hàm xuất dữ liệu', visible: true },
  { id: 'kw_input', label: 'input', insertText: 'input', category: 'keyword', description: 'Hàm nhập dữ liệu', visible: true },
  { id: 'kw_true', label: 'True', insertText: 'True', category: 'keyword', description: 'Giá trị đúng Boolean', visible: true },
  { id: 'kw_false', label: 'False', insertText: 'False', category: 'keyword', description: 'Giá trị sai Boolean', visible: true },
  { id: 'kw_none', label: 'None', insertText: 'None', category: 'keyword', description: 'Giá trị rỗng None', visible: true },
];

export function migrateLegacyPairedShortcuts(list: ShortcutKey[]): ShortcutKey[] {
  if (!Array.isArray(list) || list.length === 0) return DEFAULT_SHORTCUTS;

  const result: ShortcutKey[] = [];
  const seenIds = new Set<string>();

  const pushUnique = (item: ShortcutKey) => {
    if (!seenIds.has(item.id)) {
      seenIds.add(item.id);
      result.push(item);
    }
  };

  for (const item of list) {
    if (!item || typeof item.id !== 'string') continue;

    if (item.id === 'paren' || item.insertText === '()') {
      pushUnique({ id: 'paren_open', label: '(', insertText: '(', category: 'char', description: 'Mở ngoặc tròn', visible: item.visible });
      pushUnique({ id: 'paren_close', label: ')', insertText: ')', category: 'char', description: 'Đóng ngoặc tròn', visible: item.visible });
      continue;
    }
    if (item.id === 'bracket' || item.insertText === '[]') {
      pushUnique({ id: 'bracket_open', label: '[', insertText: '[', category: 'char', description: 'Mở ngoặc vuông', visible: item.visible });
      pushUnique({ id: 'bracket_close', label: ']', insertText: ']', category: 'char', description: 'Đóng ngoặc vuông', visible: item.visible });
      continue;
    }
    if (item.id === 'brace' || item.insertText === '{}') {
      pushUnique({ id: 'brace_open', label: '{', insertText: '{', category: 'char', description: 'Mở ngoặc nhọn', visible: item.visible });
      pushUnique({ id: 'brace_close', label: '}', insertText: '}', category: 'char', description: 'Đóng ngoặc nhọn', visible: item.visible });
      continue;
    }
    if (item.id === 'quote_double' || item.insertText === '""') {
      pushUnique({ id: 'quote_double', label: '"', insertText: '"', category: 'char', description: 'Dấu nháy kép', visible: item.visible });
      continue;
    }
    if (item.id === 'quote_single' || item.insertText === "''") {
      pushUnique({ id: 'quote_single', label: "'", insertText: "'", category: 'char', description: 'Dấu nháy đơn', visible: item.visible });
      continue;
    }
    if (item.id === 'kw_print' && item.insertText === 'print()') {
      pushUnique({ ...item, label: 'print', insertText: 'print', cursorOffset: undefined });
      continue;
    }
    if (item.id === 'kw_input' && item.insertText === 'input()') {
      pushUnique({ ...item, label: 'input', insertText: 'input', cursorOffset: undefined });
      continue;
    }
    if (item.id === 'kw_def' && item.insertText === 'def ():') {
      pushUnique({ ...item, label: 'def', insertText: 'def ', cursorOffset: undefined });
      continue;
    }

    pushUnique(item);
  }

  return result.length > 0 ? result : DEFAULT_SHORTCUTS;
}

export const PRESET_KEYBOARDS: Record<string, { name: string; keys: string[] }> = {
  default: {
    name: '⭐ Mặc định Pydroid',
    keys: DEFAULT_SHORTCUTS.map((k) => k.id),
  },
  math: {
    name: '🔢 Toán học & Lôgic',
    keys: ['tab', 'equals', 'eq_eq', 'not_eq', 'lt', 'gt', 'lte', 'gte', 'plus', 'minus', 'mul', 'div', 'percent', 'paren_open', 'paren_close', 'kw_true', 'kw_false'],
  },
  structure: {
    name: '⚡ Hàm & Cấu trúc',
    keys: ['tab', 'colon', 'paren_open', 'paren_close', 'kw_def', 'kw_class', 'kw_if', 'kw_elif', 'kw_else', 'kw_for', 'kw_while', 'kw_return', 'kw_import', 'kw_print'],
  },
  minimal: {
    name: '🎯 Tối giản (16 phím)',
    keys: ['tab', 'colon', 'paren_open', 'paren_close', 'bracket_open', 'bracket_close', 'quote_double', 'quote_single', 'equals', 'comma', 'dot', 'hash', 'kw_def', 'kw_if', 'kw_return', 'kw_print'],
  },
};
