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
  { id: 'paren', label: '( )', insertText: '()', cursorOffset: 1, category: 'char', description: 'Cặp ngoặc tròn', visible: true },
  { id: 'quote_double', label: '" "', insertText: '""', cursorOffset: 1, category: 'char', description: 'Cặp nháy kép', visible: true },
  { id: 'quote_single', label: "' '", insertText: "''", cursorOffset: 1, category: 'char', description: 'Cặp nháy đơn', visible: true },
  { id: 'equals', label: '=', insertText: ' = ', category: 'operator', description: 'Toán tử gán giá trị', visible: true },
  { id: 'bracket', label: '[ ]', insertText: '[]', cursorOffset: 1, category: 'char', description: 'Cặp ngoặc vuông danh sách', visible: true },
  { id: 'brace', label: '{ }', insertText: '{}', cursorOffset: 1, category: 'char', description: 'Cặp ngoặc nhọn từ điển/tập hợp', visible: true },
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
  { id: 'kw_def', label: 'def', insertText: 'def ():', cursorOffset: 4, category: 'keyword', description: 'Định nghĩa hàm', visible: true },
  { id: 'kw_class', label: 'class', insertText: 'class :', cursorOffset: 1, category: 'keyword', description: 'Định nghĩa lớp đối tượng', visible: true },
  { id: 'kw_if', label: 'if', insertText: 'if : ', cursorOffset: 2, category: 'keyword', description: 'Câu lệnh điều kiện if', visible: true },
  { id: 'kw_else', label: 'else', insertText: 'else:\n    ', category: 'keyword', description: 'Khối rẽ nhánh else', visible: true },
  { id: 'kw_elif', label: 'elif', insertText: 'elif : ', cursorOffset: 2, category: 'keyword', description: 'Khối rẽ nhánh elif', visible: true },
  { id: 'kw_for', label: 'for', insertText: 'for  in :', cursorOffset: 6, category: 'keyword', description: 'Vòng lặp for', visible: true },
  { id: 'kw_while', label: 'while', insertText: 'while : ', cursorOffset: 2, category: 'keyword', description: 'Vòng lặp while', visible: true },
  { id: 'kw_in', label: 'in', insertText: ' in ', category: 'keyword', description: 'Toán tử thành viên in', visible: true },
  { id: 'kw_import', label: 'import', insertText: 'import ', category: 'keyword', description: 'Nạp thư viện', visible: true },
  { id: 'kw_from', label: 'from', insertText: 'from ', category: 'keyword', description: 'Nạp từ gói', visible: true },
  { id: 'kw_return', label: 'return', insertText: 'return ', category: 'keyword', description: 'Trả về giá trị', visible: true },
  { id: 'kw_print', label: 'print()', insertText: 'print()', cursorOffset: 1, category: 'keyword', description: 'Hàm xuất dữ liệu', visible: true },
  { id: 'kw_input', label: 'input()', insertText: 'input()', cursorOffset: 1, category: 'keyword', description: 'Hàm nhập dữ liệu', visible: true },
  { id: 'kw_true', label: 'True', insertText: 'True', category: 'keyword', description: 'Giá trị đúng Boolean', visible: true },
  { id: 'kw_false', label: 'False', insertText: 'False', category: 'keyword', description: 'Giá trị sai Boolean', visible: true },
  { id: 'kw_none', label: 'None', insertText: 'None', category: 'keyword', description: 'Giá trị rỗng None', visible: true },
];

export const PRESET_KEYBOARDS: Record<string, { name: string; keys: string[] }> = {
  default: {
    name: '⭐ Mặc định Pydroid',
    keys: DEFAULT_SHORTCUTS.map((k) => k.id),
  },
  math: {
    name: '🔢 Toán học & Lôgic',
    keys: ['tab', 'equals', 'eq_eq', 'not_eq', 'lt', 'gt', 'lte', 'gte', 'plus', 'minus', 'mul', 'div', 'percent', 'paren', 'kw_true', 'kw_false'],
  },
  structure: {
    name: '⚡ Hàm & Cấu trúc',
    keys: ['tab', 'colon', 'kw_def', 'kw_class', 'kw_if', 'kw_elif', 'kw_else', 'kw_for', 'kw_while', 'kw_return', 'kw_import', 'kw_print'],
  },
  minimal: {
    name: '🎯 Tối giản (14 phím)',
    keys: ['tab', 'colon', 'paren', 'quote_double', 'equals', 'bracket', 'comma', 'dot', 'hash', 'kw_def', 'kw_if', 'kw_return', 'kw_print'],
  },
};
