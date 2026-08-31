PartsFlow Local Edition - Windows
================================

การใช้งาน
1. แตกไฟล์ PartsFlow-Local-Windows.zip ไปยังโฟลเดอร์ที่เขียนไฟล์ได้ เช่น C:\PartsFlowLocal
2. ดับเบิลคลิก PartsFlowLocal.exe
3. ครั้งแรกระบบจะสร้างฐานข้อมูลและเตรียมตารางให้อัตโนมัติ อาจใช้เวลาสักครู่
4. Browser จะเปิด http://127.0.0.1:8765 อัตโนมัติ
5. ระหว่างใช้งาน ห้ามปิดหน้าต่าง PartsFlowLocal.exe

ฐานข้อมูล
- อยู่ที่ data\partsflow_local.sqlite3
- เป็นฐานข้อมูล Local แยกจาก Supabase Production โดยสิ้นเชิง
- ไม่ต้องติดตั้ง PostgreSQL, SQLite Server, Python หรือ Node.js
- การลบไฟล์ฐานข้อมูลเท่ากับลบข้อมูล Local ดังนั้นควร Backup เป็นประจำ

สำรองข้อมูล
- ปิด PartsFlowLocal.exe ก่อน
- ดับเบิลคลิก Backup-PartsFlow.bat
- ไฟล์สำรองจะอยู่ในโฟลเดอร์ backups

กู้คืนข้อมูล
- ปิด PartsFlowLocal.exe ก่อน
- ดับเบิลคลิก Restore-PartsFlow.bat
- ระบบจะใช้ไฟล์ .sqlite3 ล่าสุดในโฟลเดอร์ backups
- ก่อน Restore ระบบจะสำรองฐานข้อมูลปัจจุบันให้อีกหนึ่งชุด

ข้อจำกัดของ Local Edition รุ่นแรก
- ใช้บนคอมเครื่องเดียวผ่าน 127.0.0.1
- ยังไม่ Sync กับ Supabase อัตโนมัติ
- ยังไม่เปิดให้เครื่องอื่นใน LAN เข้าใช้งาน
- Cloud Production (Vercel/Railway/Supabase) ไม่ได้รับผลกระทบจากข้อมูล Local

โฟลเดอร์สำคัญ
PartsFlowLocal.exe
README-LOCAL-TH.txt
data\partsflow_local.sqlite3
backups\
Backup-PartsFlow.bat
Restore-PartsFlow.bat
