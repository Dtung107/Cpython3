# Auto-generated Kivy GUI wrapper for PydroidApp
import kivy
from kivy.app import App
from kivy.uix.boxlayout import BoxLayout
from kivy.uix.label import Label
from kivy.uix.button import Button
from kivy.uix.textinput import TextInput
from kivy.uix.scrollview import ScrollView
from kivy.core.window import Window
import io, sys

Window.clearcolor = (0.12, 0.13, 0.17, 1)

class PydroidApp(App):
    def build(self):
        self.title = "PydroidApp"
        root = BoxLayout(orientation='vertical', padding=15, spacing=10)
        
        # Header Title
        title_label = Label(
            text="[b]PydroidApp[/b]",
            markup=True,
            font_size='22sp',
            size_hint_y=None,
            height=50,
            color=(0.22, 0.74, 0.97, 1)
        )
        root.add_widget(title_label)
        
        # Output Terminal Display
        self.output_box = TextInput(
            text="Ứng dụng Python đã khởi chạy thành công trên Android!\nNhấn nút bên dưới để thực thi logic:\n",
            readonly=True,
            background_color=(0.07, 0.08, 0.1, 1),
            foreground_color=(0.9, 0.95, 1, 1),
            font_size='14sp',
            size_hint_y=0.7
        )
        root.add_widget(self.output_box)
        
        # Action Button
        btn = Button(
            text="▶ Chạy Logic Chương Trình",
            font_size='18sp',
            size_hint_y=None,
            height=55,
            background_normal='',
            background_color=(0.15, 0.68, 0.38, 1)
        )
        btn.bind(on_press=self.run_logic)
        root.add_widget(btn)
        
        return root

    def run_logic(self, instance):
        old_stdout = sys.stdout
        sys.stdout = buffer = io.StringIO()
        try:
            # --- USER CODE EXECUTION ---
            # -*- coding: utf-8 -*-
            # ==========================================
            # KẾT QUẢ HỌC TẬP PYTHON
            # Bài tập: Bài học Python ngày 27/9/2026
            # Ngày lưu: 22:03 27/09/2026
            # ==========================================
            
            #### hàm def máy tính ###
            def nhap_so(prompt='nhập số: '):
                while True:
                    try:
                        return float(input(prompt))
                    except ValueError:
                        print('không nhập chử cái và số')
            
            def nhap_phep_tinh():
                phep_tinh_hop_le = ['+','-','*','/']
                while True:
                    pt = input('chọn phép tính (+,-,*,/): ').strip()
                    if pt in phep_tinh_hop_le:
                        return pt
                    print('phép tính không hợp lệ')
            
            def tinh_toan(a,b,phep_tinh):
                if phep_tinh =='+':
                    return a + b
                elif phep_tinh =='-':
                    return a - b
                elif phep_tinh =='*':
                    return a * b
                elif phep_tinh =='/':
                    if b == 0:
                        return None
                    return a / b
            
            def may_tinh():
                so_1 = nhap_so()
                phep_tinh = nhap_phep_tinh()
                while True:
                    so_2 = nhap_so('nhập số tiếp theo: ')
                    ket_qua = tinh_toan(so_1,so_2,phep_tinh)
                    if ket_qua is None:
                        print('không chia cho số 0 vui lòng nhập lại')
                    else:
                        print(f'==> kết quả : {so_1} {phep_tinh} {so_2} = {ket_qua}')
                        break
                hoi = input('\n thoát chương trình nhập n tiếp tục với phím bất kì ')
                if hoi.lower()!='n':
                    may_tinh()
                else:
                    print('xin cảm ơn')
            
            may_tinh()
            output = buffer.getvalue()
        except Exception as e:
            output = f"Lỗi: {e}"
        finally:
            sys.stdout = old_stdout
            
        self.output_box.text += "\n--- KẾT QUẢ ---\n" + output

if __name__ == '__main__':
    PydroidApp().run()
