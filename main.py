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
            # Đoạn mã thử nghiệm AI Debugger (Cố tình có lỗi cú pháp và logic)
            def tinh_trung_binh(danh_sach):
                # Lỗi 1: Cố tình quên dấu hai chấm và sai thụt lề
                tong = 0
                for so in danh_sach
                    tong += so
                
                # Lỗi 2: Lỗi chia cho 0 nếu danh sách rỗng
                ket_qua = tong / len(danh_sach)
                return ket_qua
            
            # Thử gọi hàm
            du_lieu = [10, 25, 30, 45, 50]
            tb = tinh_trung_binh(du_lieu)
            print(f"Giá trị trung bình là: " + tb) # Lỗi 3: TypeError cộng chuỗi với float!
            
            output = buffer.getvalue()
        except Exception as e:
            output = f"Lỗi: {e}"
        finally:
            sys.stdout = old_stdout
            
        self.output_box.text += "\n--- KẾT QUẢ ---\n" + output

if __name__ == '__main__':
    PydroidApp().run()
