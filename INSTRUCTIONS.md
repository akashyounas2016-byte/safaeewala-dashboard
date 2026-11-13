# Safaeewala CRM — Team ke liye Instructions

> Ye file Safaeewala team ke liye hai: CRM ka har feature kaise kaam karta hai aur kyun.
> Har naye feature ya change ke sath is mein naya hissa add hota hai. Last updated: 2026-11-13

---

## 1. Monthly aur Bi-Weekly clients

### Visits Daily Job Sheet par khud kaise aati hain
- Har client ki visit **ek saath poore mahine ki nahi banti**. Visit us din ke liye banti hai:
  1. **Aaj ki visits:** CRM khulte hi aaj ke saare Monthly / Bi-Weekly clients ki visits khud Daily Job Sheet par aa jati hain.
  2. **Koi aur date:** Daily Job Sheet ya Excel Job Sheet par koi date kholein to us din ki schedule wali visits usi waqt ban jati hain.
  3. **Sync button:** chahein to ek ya kai dates ki visits ek saath bana sakte hain.
- Ek hi visit do dafa nahi banti. Agar us din client ki row pehle se maujood hai to nayi nahi banegi.

### Monthly client
- Har hafte apne din par visit banti hai, jaise har Tuesday.
- Pehli visit **Contract Start date** se banti hai. Start date na ho to us din se jab client add hua. Purani dates par kabhi visit nahi banti.
- End date di ho to visits us din tak banti hain.

### Bi-Weekly client
- Ek hafta kaam, ek hafta chhutti, Start date se gin kar.
- Misaal: Monday + Thursday, 16 Nov se 2 mahine.

| Date | Visit? | Kyun |
|---|---|---|
| 9 Nov | Nahi | Start date se pehle |
| 16 Nov, 19 Nov | Haan | Pehla hafta |
| 23 Nov, 26 Nov | Nahi | Chhutti wala hafta |
| 30 Nov | Haan | Phir kaam wala hafta |
| 18 Jan | Nahi | Contract khatam |

### Contract Start / End date
- Client popup ke **Contract** hisse mein Start aur End (optional) date hoti hai. Upar badge batata hai: *Starts …* (abhi shuru nahi hua), *Running* (chal raha hai), ya *Ended* (khatam).
- End date, Start date se pehle nahi ho sakti.
- **Dates badal kar save karein** to aaj se aage ki jo unpaid visits nayi dates ke bahar hon, wo sheet se khud hat jati hain. Pichli visits, paid visits aur aam jobs kabhi nahi hatti. Hatai gayi visits Settings → restore se wapas aa sakti hain.

### Contract Off
- **Contract Status Off** karein to koi nayi visit nahi banegi, aur aaj se aage ki unpaid visits hat jayengi. Pichli visits history ke liye rehti hain.
- Wapas On karein to visits phir banna shuru ho jati hain.

### Daily Job Sheet par change sirf usi din ka hai
- Daily Job Sheet par kisi visit ka time, date, cleaner ya ghante badlein to **sirf usi din ki row** badlegi. Client ka asal (permanent) schedule nahi badlega.
- Permanent change sirf **Monthly Clients** screen ya client ke popup se karein.

### Cleaner na ho to
- Client ka cleaner abhi tay nahi to visit **khali cleaner** ke sath banti hai ("Unassigned" nahi likha jata). Sheet par cleaner baad mein chunein.

### Client delete karna
- Monthly / Bi-Weekly client delete karne par client, uski aaj se aage ki unpaid visits, aur uska contract — sab hat jata hai. Pichli visits work history ke liye rehti hain.
- Deleted client purani job rows se dobara wapas nahi aata.

---

## 2. Daily Job Sheet aur Excel Job Sheet

### "Checks" (peeli warning) kya hai
- Row par **"1 check"** ka matlab hai row mein kuch dekhne layak hai — misaal: *Ends before it starts* (khatam hone ka time shuru se pehle). Ye sirf warning hai, job save hoti hai.
- Time AM / PM ke sath parha jata hai: 9:00 AM – 8:00 PM bilkul theek hai. Warning sirf tab aati hai jab shift sach mein raat se agle din jaye (jaise 8 PM – 9 AM) — tab time dobara dekh lein.

### Do cleaners wali job
- Ek job par do cleaners hon to charges dono mein baant diye jate hain; row ek team job ki tarah save hoti hai.

### Overtime (OT) — khud lagta hai
- **Shaam 8:00 PM ke baad** ki har duty OT hai, chahe din mein kitne bhi ghante hue hon.
- 8 PM se pehle agar cleaner apne **basic ghanton** (Add Employee mein *Total Duty Hours*, khali ho to 8) se zyada kaam kare to wo extra ghante bhi OT hain.
- Ek din ki kai shifts mil kar gini jati hain. OT haath se nahi likha ja sakta — system khud hisaab lagata hai.

### Excel Job Sheet
- Right-click menu: Copy / Paste / Duplicate / Clear upar, delete wale (Delete Row, phir Delete Block) sab se neeche.
- Row height: 24, 26, 32, 38, 46 px.
- **Attendance** button sheet par hi popup kholta hai (neeche Attendance dekhein). Ctrl + Click se poori Attendance screen naye tab mein khulti hai.

---

## 3. Attendance

- **Present:** us din cleaner ki kam se kam ek job hai.
- **Available:** us din koi job nahi — ye **absent nahi** gina jata.
- **Absent:** sirf tab jab specifically Absent ya Leave mark kiya ho.
- Excel sheet ke Attendance popup mein har cleaner ke liye Present / Available / Absent / Leave ek click mein lagta hai; sab users ko foran nazar aata hai.
- Leave (Sick, Emergency, Annual, Weekly Off, Short): admin / manager ke ilawa koi lagaye to approval ke liye jati hai. Faisla ho jane ke baad sirf admin / manager badal sakte hain.

---

## 4. Leads (Website)

### "Possible duplicate" kab aata hai
- Jab nayi lead ka **phone number ya email** kisi pichli lead jaisa ho, aur dono **7 din ke andar** aayi hon. Badge par mouse le jayein to pichli lead ka naam aur date nazar aati hai.
- Form ka misaal wala number **+971 50 000 0000** (bahut log isay badle baghair bhej dete hain) duplicate nahi gina jata.
- Ye sirf ishara hai — lead delete nahi hoti. Dekh kar faisla karein ke ye wahi customer dobara aaya hai ya nahi.

---

## 5. Complaints aur Health Score

- Har complaint ka **track record** rehta hai: kab aayi, kisne likhi, har change (status, severity, cleaner…) kisne aur kab kiya, kab hal hui.
- Cleaner ki profile par uski complaints dikhti hain (total / open / resolved).
- **Health Score** (0–100): Attendance 50 + Activity 30 + Documents 20, aur pichle 90 din ki complaints se katauti: **High −15, Medium −8, Low −3**, zyada se zyada −40. Hal ho chuki complaint bhi ginti hai — complaint hui thi.
- Absent sirf woh gina jata hai jo specifically mark ho (Attendance ka rule).

---

## 6. Settings

### Roles & Access
- Permissions categories mein hain (Daily Job Sheet, Bookings & Clients, Staff, Finance, waghera). Har category ka **n/n** button poori category ek saath deta / leta hai.
- Daily Job Sheet ke andar alag options: **Excel Job Sheet**, aur **Import & delete a whole day**. Jis role ke paas option nahi, usay wo button nazar hi nahi aata.
- Admin ke paas hamesha sab kuch hai.

### Activity Log
- Har important change likha jata hai: kisne, kab, kis screen se, aur pehle → baad kya badla. Filter aur CSV export maujood hai.

### Data health
- Data mein masle dikhata hai (misaal: job par aisa staff jo Employees mein nahi). Item click karein to seedha wahi job khulti hai.

### Backup
- Upar ek status batata hai ke backup ho raha hai ya nahi. Teen jagah: **Server** (har raat), **Google Drive**, aur **This computer** (office computer par ek dafa folder chunein, phir rozana khud copy hoti hai, 30 din rakhi jati hain).

---

## 7. Employees

- Employees list mein kisi cleaner par click karein to **Employee Profile** popup khulta hai. Upar header mein buttons hain:
  - **Full Profile:** poora service record aur job history.
  - **Job Sheet:** Daily Job Sheet par sirf is cleaner ki jobs.
  - **Edit:** profile badlein (Total Duty Hours yahin hain — OT inhi se lagta hai).
  - **Laal 🗑 icon:** delete — pehle popup ke upar poochha jata hai.
- Jis employee ki photo upload hai, list (grid aur table) mein uske initials (jaise MA) ki jagah **photo** dikhti hai. Photo par click karein to bari ho kar khulti hai; band karne ke liye kahin bhi click, ✕ ya Esc. Photo Full Profile par upload / change hoti hai.

---

## 8. Aam baatein

- Har save sab users ko foran nazar aata hai (live).
- Delete ki gayi cheezon ka restore point banta hai (Settings).
- Website par test karna ho to naam ke shuru mein **TEST** likhein, taake asli data se alag rahe aur baad mein asani se hata sakein.
