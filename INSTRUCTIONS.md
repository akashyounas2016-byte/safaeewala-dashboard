# Safaeewala CRM — Team ke liye Instructions

> Ye file Safaeewala team ke liye hai: CRM ka har feature kaise kaam karta hai aur kyun.
> Har naye feature ya change ke sath is mein naya hissa add hota hai. Last updated: 2026-11-15

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
- Client popup ke **Contract** hisse mein Start aur End (optional) date hoti hai. **Start date fixed rehti hai** — ek dafa save ho to roz nahi badalti. Contract save na hua ho to Start wo din dikhata hai jab client add hua tha. Upar badge batata hai: *Starts …* (abhi shuru nahi hua), *Running* (chal raha hai), ya *Ended* (khatam).
- End date, Start date se pehle nahi ho sakti.
- **Dates badal kar save karein** to aaj se aage ki jo unpaid visits nayi dates ke bahar hon, wo sheet se khud hat jati hain. Pichli visits, paid visits aur aam jobs kabhi nahi hatti. Hatai gayi visits Settings → restore se wapas aa sakti hain.

### Contract Off
- **Contract Status Off** karein to koi nayi visit nahi banegi, aur aaj se aage ki unpaid visits hat jayengi. Pichli visits history ke liye rehti hain.
- Wapas On karein to visits phir banna shuru ho jati hain.

### Daily Job Sheet par change sirf usi din ka hai
- Daily Job Sheet par kisi visit ka time, date, cleaner ya ghante badlein to **sirf usi din ki row** badlegi. Client ka asal (permanent) schedule nahi badlega.
- Permanent change sirf **Monthly Clients** screen ya client ke popup se karein.

### Schedule badalna (client popup se)
- Client popup ke **Weekly Schedule** mein din, time, ghante ya cleaner badal kar save karein to Daily Job Sheet par **aaj se aage** ki visits naye schedule par aa jati hain.
- **Aaj se pehle** ki rows bilkul nahi badalti (salary aur history theek rehti hai). Paid visits bhi nahi badalti.
- Sheet par kisi din haath se kiya hua change (misaal: us din doosra cleaner) waisa hi rehta hai.
- Koi din hata dein to aaj se aage us din ki unpaid visits hat jati hain (Settings → Backup se wapas aa sakti hain). Naya din jor dein to us ki visit sheet par wo din kholne par khud ban jati hai.
- Naya cleaner us waqt kahin aur busy ho to visit bina cleaner ke rehti hai, Remarks mein warning ke saath.

### Cleaner pehle se busy ho to
- Agar client ke din par uska cleaner usi waqt kisi aur job par hai, to visit **bina cleaner** ke banti hai (Excel sheet par jamni "—" block) aur Remarks mein likha hota hai: *"⚠ Ambika … is already booked … assign a cleaner"*. Sheet par koi aur cleaner chun lein. Agle hafte cleaner free ho to visit khud uske naam par banti hai.
- Har client ki ek din mein **sirf ek** visit banti hai. Naam mein "Monthly" ho (jaise *Monthly A*) tab bhi.

### Visit ki date ya address badalna
- Sheet par kisi visit ki date badlein (misaal: Tuesday se Wednesday) to wo **nayi date par hi rehti hai** — purani date par dobara nahi banti.

### Client ek hi dafa dikhta hai
- **Client profile:** upar header ke neeche ek row mein Charges, Received, Pending, Advance, Adjustment aur Overtime ke cards — har tab par wahi. Neeche **Upcoming Bookings** (hara, har visit ka din, tareekh, waqt aur cleaner) aur **Financial Summary** saath saath.
- **Clients screen ke tabs (ek hi line):** **Clients** mein saare clients; **Monthly Clients** mein poori Monthly screen — monthly clients, Payments, Contracts aur Coverage, upar New Contract aur Record Payment; **Bi-Weekly Clients** mein sirf bi-weekly. Upar wali "Clients | Monthly Clients" patti hata di gayi hai. Add Client har tab par ek jaisa hai aur usi tab ka mode chun kar khulta hai.
- **Clients screen:** teen views — Grid Card (2 cards, widgets right par), Table, aur Wide Grid (3–4 cards, widgets neeche). Search, area, date aur sort ek hi row mein.
- Client card par visits aur revenue sirf Job Sheet ki asal rows se gine jate hain. Rows na hon to 0.
- Client ki profile par **Upcoming** mein agle 4 hafte ki schedule wali visits bhi dikhti hain (**Scheduled** badge). Ye sheet par us din khud aati hain jab wo din khula ho.
- Har job apne client se jurri rehti hai. Client ka naam ya building badlein to bhi uski purani aur nayi visits usi client ki rehti hain.
- Monthly Clients list mein har client ek dafa aata hai. Uski visits (jaise *Villa# 06 - Zayan*) se alag nakli client nahi banta — edit hamesha asal client par hota hai.

### Client edit karna (ek hi form)
- **Ek hi popup har mode ke liye:** General, Monthly ya Bi-Weekly — form wahi hai. Mode badlein to neeche sirf us mode ke cards aate hain (Monthly: Contract + hafte ka schedule; Bi-Weekly: Contract + Bi-Weekly din).
- Upar contact wali line mein **Naam, Mobile, WhatsApp, Email aur Mode**. Address wale hisse mein pehle **Address, Area, City**, phir doosre addresses, phir **Preferred Cleaner**. Save hue doosre addresses ek list mein dikhte hain — badalne ke liye ✏️ dabayein.
- **Client delete karna:** popup mein client ka **poora naam** likhna zaroori hai. Popup saaf batata hai:
  - **Mit jata hai:** client ka record, aaj se aage ki **unpaid** visits, aur contract.
  - **Rehta hai:** pichli aur paid jobs (kaam aur paise ki history), bookings, invoices, payments aur advance.
  - Ghalti se delete ho jaye to Settings → Backup → *Before-delete copies* se **Restore** — client, visits aur contract wapas aa jate hain.
- **Naam / address badalna:** client ka naam ya address badlein to Job Sheet par **aaj se aage** ki us ki rows mein naya naam aa jata hai. Pichli rows mein purana naam history ke liye rehta hai.
- **Address** ab ek hi field hai (misaal: "Al Khair Building Apt 302"). **Mobile number zaroori** hai.
- **Add another address** se ek hi client ke aur addresses (doosra villa, office) daal sakte hain. New Booking, Daily Job Sheet ke **Add Job** aur Excel sheet ki Client / Address list mein client ke neeche har address alag nazar aata hai (apne Area ke saath) — wahi chunein. Us address wali job usi client ki ginti hoti hai.
- **Contract** mein sirf Start / End date bhi bharein to save hoti hai. Client ki visits sirf in dates ke andar banti hain.
- Client ka popup ab **ek hi form** hai — Contract, naam / address, balances aur hafte ka schedule sab ek jagah. Upar **Save Changes**.
- **Mode** (General / Bi-Weekly / Monthly) baad mein bhi badal sakte hain. Popup ka naam mode ke mutabiq: *Edit Monthly Client*, *Edit Bi-Weekly Client* ya *Edit Client Profile*.
- Monthly se General ya Bi-Weekly karne par hafte ka monthly schedule hat jata hai, us ki nayi visits nahi banti.
- **Weekly Schedule & Staff Assignment** ke saath **Hide / Show** button hai — zaroorat na ho to chhupa dein.

### Bina din ke client
- Naye Monthly client ke liye kam se kam ek din tick karna zaroori hai. Pehle se maujood client ko bina din ke bhi save kar sakte hain (misaal: sirf address badalna) — tab ek warning aati hai ke din tick hone tak us ki visits Job Sheet par nahi banengi.

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

### Upcoming Bookings (client profile)
- **On sheet** = us din ki row Job Sheet par ban chuki hai (time / cleaner wahan badlein). **Scheduled** = sirf schedule mein hai, row us din sheet kholne par banegi. Dono par mouse rakhne se yahi likha aata hai.

### Client Profile popup
- Upar ✕ ke saath: 🗑️ Delete, **Edit Profile**, **New Booking**. Monthly Client Details mein upar **Edit** client ka form kholta hai; payment ke liye Clients screen par **Add Payment**.

### Monthly tab
- Payment ke liye upar **Add Payment** dabayein — Monthly tab khula ho to ye monthly payment form kholta hai. Naya contract: **Recurring Contracts → New Recurring Contract**.
- Search, Area, Sort aur **More Filters** ek hi line mein. Tareekh (Last 28 Days, mahina, saal, custom) **More Filters** mein hai.

### Attendance popup (Excel)
- Popup mein sirf cleaners hain. Office staff (CSR) ki chhutti / ghair-haazri neeche ek line mein likhi hoti hai.

### Excel sheet: cleaners ki tarteeb
- Cleaners ke blocks hamesha **naam ke hisaab se A→Z** rehte hain. Nayi job, team job ya payment se koi block upar neeche nahi hota.
- Team member ki Mode mein **Team** likha hota hai (paisa leader ki row par hai — REF chip leader ka naam batata hai).

### Team mein har cleaner ka apna time
- Excel par team ke kisi ek cleaner ka time badlein to sirf usi ka badlega. Save par wo cleaner usi jagah aur team mein apni alag job ban jata hai; paisa leader ki row par rehta hai.

### Ek address, do alag jobs (Excel)
- Ek hi building mein ek waqt do alag jobs hon (misaal: ek solo job aur ek team), to har job ki apni charges apni row par dikhti hain. Pehle sheet doosri job ko team ka member samajh kar uski charges chhupa deti thi.
- Save ka message ab sirf asal jobs ginta hai — khaali rows "deleted" nahi likhi jatin.

### Double visit (duplicate)
- Daily aur Excel sheet ek saath khuli hon tab bhi ek visit ab ek hi dafa banti hai. Pehle double ban jati thi aur "time clash" aata tha jis se us din ka save ruk jata tha.

### Charges Per Hour
- Add Job mein **Charges Per Hour** likhein (Advance Received se pehle). Total khud banta hai: rate × duty hours.
- Excel mein ye **Charges / Hr** column mein dikhta hai. Rate ya time badlein to Charges khud badal jate hain; Charges seedha likhein to rate us ke hisaab se badal jata hai.

### Excel sheet par Monthly visits
- Excel sheet par koi bhi aik din kholein to us din ki Monthly / Bi-Weekly visits khud aa jati hain — sirf contract ki Start aur End date ke andar.
- Visits sirf **aaj se 90 din aage tak** khud banti hain. Ghalti se koi door ki date (jaise 2041) khul jaye to wahan visits nahi banengi.
- Client delete karein to wo ab hamesha ke liye hat jata hai — dobara wapas nahi aata.

### Row ka rang (Row Color)
- Add Job (Daily aur Excel sheet) aur New Booking mein **Row Color** ek jaisa hai: 40 **halke** rang ke dabbe (naam nahi). Jo rang aaj kisi aur cleaner ki row ko mil chuka hai wo dhaariyon wala dikhta hai aur chuna nahi ja sakta — warning batati hai kis ke paas hai. Ek hi team (same address) ki rows ka ek rang rehta hai.
- **Default (no colour)** dabayein to row ka rang hat jata hai. Pehle se rangi hui rows apne qareebi naye rang mein dikhti hain.

### Excel Job Sheet
- Sab se upar **jamni "—" block** sirf tab aata hai jab kisi job par cleaner na laga ho (misaal: monthly visit jiska cleaner us waqt busy tha). Us row mein cleaner chun lein. Khali din par ye block nahi aata.
- Right-click menu: Copy / Paste / Duplicate / Clear upar, delete wale (Delete Row, phir Delete Block) sab se neeche.
- Row height: 24, 26, 32, 38, 46 px.
- **Rang (colour):** cell par rang lagate hi save ho jata hai — Save dabane ki zaroorat nahi. Refresh ke baad bhi rehta hai.
- **Three dots (⋮) → Delete:** sirf us role ko nazar aata hai jis ke paas *Import & delete a whole day* ki ijazat ho.
  - **Delete Today** — jo din khula hai us ki saari jobs aur expenses delete. Pehle warning popup aata hai. Band (closed) din delete nahi hota. Booking se bani jobs nahi hatti.
  - **Delete All Data** — saari Job Sheet ka data delete. Popup mein **DELETE** likhna zaroori hai, warna button nahi chalta. Delete se pehle poori copy computer par download hoti hai aur Settings → Backup → *Before-delete copies* mein bhi rehti hai, wahan se wapas laa sakte hain.
- **Attendance** button sheet par hi popup kholta hai (neeche Attendance dekhein). Ctrl + Click se poori Attendance screen naye tab mein khulti hai.

---

## 3. Attendance

- **Present:** us din cleaner ki kam se kam ek job hai.
- **Available:** us din koi job nahi — ye **absent nahi** gina jata.
- **Absent:** sirf tab jab specifically Absent ya Leave mark kiya ho.
- **Excel sheet ka Attendance popup:**
  - Har cleaner ki photo ke saath list. Upar cards: kitne cleaners, kitne Present / Available / Absent / Leave (aur %).
  - **Present / Available khud lagta hai:** sheet par cleaner ki job hai to Present, nahi to Available. Ye abhi save na ki gayi rows ko bhi dekhta hai.
  - **Absent ya Leave** aap lagate hain. Wapas Present / Available karne ke liye wahi button dabayein jo sheet ke mutabiq ho.
  - Click karne se foran save **nahi** hota — row par "not saved yet" likha aata hai. Neeche **Save** dabayein to save hota hai. Bina save kiye Close karein to poochha jata hai.
- Leave (Sick, Emergency, Annual, Weekly Off, Short): admin / manager ke ilawa koi lagaye to approval ke liye jati hai. Faisla ho jane ke baad sirf admin / manager badal sakte hain.

---

## 4. Leads (Website)

### "Possible duplicate" kab aata hai
- Jab nayi lead ka **phone number ya email** kisi pichli lead jaisa ho, aur dono **7 din ke andar** aayi hon. Badge par mouse le jayein to pichli lead ka naam aur date nazar aati hai.
- Form ka misaal wala number **+971 50 000 0000** (bahut log isay badle baghair bhej dete hain) duplicate nahi gina jata.
- Ye sirf ishara hai — lead delete nahi hoti. Dekh kar faisla karein ke ye wahi customer dobara aaya hai ya nahi.

---

### WhatsApp Clicks (website)
- Upar **Website connection** batata hai website se aakhri click kab aaya, ya wo kyun ruka (misaal: secret ghalat). Screen har minute khud refresh hoti hai.
- Website par jab koi WhatsApp button dabata hai, wo click CRM ki **WhatsApp Clicks** screen par aata hai: kis page se, kaun sa button, kis campaign / Google / Facebook se, mobile ya computer.
- Ye **lead nahi** hai — click mein customer ka number nahi hota. Ye batata hai ke kaun se pages aur campaigns WhatsApp chats la rahe hain. Asal chat Conversations mein aati hai.
- Har row ke aakhir mein ✏️ (**Edit**) aur 🗑️ (**Delete**) hai. Edit se page, button, source, device ya message theek karein; Delete se test ya double click hata dein (pehle poochhta hai). Ye sirf admin / manager kar sakte hain.

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
- Har raat 2 baje (Dubai) poora data — aur passport, EID, visa jaise **uploaded documents** bhi — server par copy hota hai, aur us ki ek copy **Google Drive** ke "Safaeewala-Backups" folder mein jati hai. Upar ka status batata hai ke backup chal raha hai ya nahi.
- Upar ek status batata hai ke backup ho raha hai ya nahi. Teen jagah: **Server** (har raat), **Google Drive**, aur **This computer** (office computer par ek dafa folder chunein, phir rozana khud copy hoti hai, 30 din rakhi jati hain).

---

## 7. Employees

- Employees table mein har cleaner ka **Short Name** dikhta hai — wahi jo Excel Job Sheet par hai. Poora naam dekhne ke liye naam par mouse rakhein. Short Name Edit mein badla ja sakta hai.
- Kisi employee ka **poora naam badlein** to Job Sheet ki uski saari rows aur monthly clients ke schedule mein bhi naam khud badal jata hai — kuch dobara likhne ki zaroorat nahi.
- Employees list mein kisi cleaner par click karein to **Employee Profile** popup khulta hai. Upar header mein tarteeb se: **Edit**, **Profile View**, laal 🗑, phir ✕.
  - **Profile View:** poora service record aur job history.
  - **Edit:** profile badlein. **Total Duty Hours** dropdown se chunein (6, 8, 9, 10, 12) ya koi aur number likhein; khali chhorein to 8 ghante maane jate hain — OT inhi se lagta hai.
  - **Laal 🗑 icon:** delete — pehle popup ke upar poochha jata hai.
- Jis employee ki photo upload hai, list (grid aur table) mein uske initials (jaise MA) ki jagah **photo** dikhti hai. Photo par click karein to bari ho kar khulti hai; band karne ke liye kahin bhi click, ✕ ya Esc. Photo Full Profile par upload / change hoti hai.

---

## 8. Aam baatein

- Har save sab users ko foran nazar aata hai (live).
- Delete ki gayi cheezon ka restore point banta hai (Settings).
- Ek computer par delete ki gayi cheez (contract, payment, advance waghera) doosre computer se **wapas nahi aati**, chahe wo computer offline tha. Restore se wapas laayi gayi cheez rehti hai.
- Website par test karna ho to naam ke shuru mein **TEST** likhein, taake asli data se alag rahe aur baad mein asani se hata sakein.
