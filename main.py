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
            # chương trình  máy tính chạy liên tục đến khi người dùng muốn dừng
            while True:
                print('\n ___chương trình máy tính___')
                
                # 1.nhập số thứ nhất
                while True:
                    try:
                        so_1=float(input('nhập số thứ nhất  '))
                        break
                    except ValueError:
                        print('yêu cầu nhập là :số')
                        
                # 2.nhập phép tính
                while True:
                        phep_tinh=input('chọn ( +,-,*,/)  :')
                        if phep_tinh in['+','-','*','/']:
                            break
                        else:
                            print('nhập sai phép tính')              
                # 3. nhập số thứ hai vá xử lý chia cho 0
                while True:
                    try:
                        so_2=float(input('chọn số kế tiếp  :'))
                        if phep_tinh=='/'and so_2==0:
                            print('Lổi : không chia cho 0')
                            continue # quay lại nhap so_2
                        break
                    except ValueError:
                        print('chỉ được nhập số')
                        
                 # 4. Thực hiện tính toán và in kết quả
                if phep_tinh == '+':
                    ket_qua = so_1 + so_2
                elif phep_tinh == '-':
                    ket_qua = so_1 - so_2
                elif phep_tinh == '*':
                    ket_qua = so_1 * so_2
                elif phep_tinh == '/':
                    ket_qua = so_1 / so_2
            
                print(f'==> Kết quả: {so_1} {phep_tinh} {so_2} = {ket_qua}')
                # 5.hỏi người dùng có muốn tiếp tục chương trình không
                hoi=input('\nbạn có muốn tiếp tục tính toán ?(nhập n để thoát nhập phím bất kỳ để tiếp tục )  : ')
                if hoi.lower() =='n':
                        print('cám ơn bạn đả sử dụng chương trình ,hẹn gâp lại')
                        break # thoát khỏi vòng lặo chính và đóng chương trình    
                            
                             
                    
                
                                                       
                                                       
                                                       
                         
                      
                      
                         
                             
                             
                
                        
                                
                                
                      
                        
            output = buffer.getvalue()
        except Exception as e:
            output = f"Lỗi: {e}"
        finally:
            sys.stdout = old_stdout
            
        self.output_box.text += "\n--- KẾT QUẢ ---\n" + output

if __name__ == '__main__':
    PydroidApp().run()
