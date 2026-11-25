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

### Client ke doosre address
- Client ke doosre address (KVC 2, KVC 3 …) par lagi jobs ab usi client ki hain — alag client ban kar list mein nahi aate.

### Schedule mein Material aur Charges / Hr
- Add / Edit Client → Monthly ya Bi-Weekly → schedule mein har din ka **Material** (list ya khud likhein) aur **Charges / Hr**. Bi-Weekly mein **Total Charges** khud banta hai. Bi-Weekly visit ke charges isi se bharte hain (0 nahi rehte).

### Ad-hoc job (monthly client ka extra kaam)
- Add Job mein monthly / bi-weekly client chunein to **Ad-hoc job** ka tick aata hai. Tick karein — job alag bill hogi, monthly invoice mein nahi aayegi (invoice mein tick se shamil kar sakte hain).

### Ek client ke kai numbers
- Add New Client / Edit Client mein Mobile ke neeche **+ Add another number** — jitne chahein number daalein, ✕ se hatayein. Client Profile ke upar sab numbers dikhte hain.

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

### Excel Job Sheet: time badlein to Charges khud badalte hain (25 Nov)
- Jis job mein **Charges / Hr** likha ho, us ka Start ya End time badlein (list se chunein ya likh kar Enter) to Duty Hrs aur **Charges = Charges / Hr × Duty Hrs** khud update ho jate hain. Misaal: 12–1 PM, 10 / hr = 10 → End time 2 PM = 20.
- Jo rows is fix se pehle badli thin un ke Charges purane hi rahenge — time ya Charges / Hr dobara select kar dein to theek ho jayenge.

### Excel Job Sheet: Reconfirmation aur Date column (24 Nov)
- Neeche footer mein **Reconfirmation** button: wahi hisaab jo office Excel mein karta hai — Charges, Less Rcvd, Pending, Balance, Add Adv, Balance. Aakhri Balance **0** ho to sheet theek hai (hara). 0 na ho to batata hai kitna farq hai aur kaun si rows nahi milti — row dabayein to sheet par wahi row khul jati hai. **Copy** se WhatsApp mein bhej sakte hain.
- Date menu mein **Last 7 Days** aur **Last 30 Days** bhi hain. Ek se zyada din khule hon to Start time se pehle **Date** ka column khud aa jata hai; Today / Yesterday par nahi hota.
- Daily Job Sheet par **Staff on Duty** ab team ke har cleaner ko ginta hai (pehle team wali row ek banda ginti thi — 1 Oct par 25 dikhata tha, asal 27).

### Live Map (25 Nov, raat)
- Har bande ka **pin** us ke role ke rang mein hai aur neeche **poora naam** likha hai. Mouse le jayein to likha aata hai woh **kahan** hai ("Now at: Villa 4-34B, Mirdif").
- Ek hi jagah kai log hon to beech mein ek gol nishaan (ginti ke saath) aur har banda line se juda hota hai — koi kisi ke peeche nahi chhupta.
- **CSR** map par nahi; us ki jagah **Technical** ka filter.
- Map ke neeche: **Cleaners on duty now · On the map · No position yet**. Jo kaam par hai magar map par nahi, us ka naam aur wajah neeche likhi hoti hai (location share nahi ki / step dabaya magar phone ne location nahi di). Map par aane ke liye cleaner My Duties par **Share my location** dabaye ya job ka step (On the way / Start) dabaye aur phone location allow kare.
- Kal ki job aaj start ki ho to bhi map par aati hai (Ayesha wala masla).

### Payments cards (25 Nov, raat)
- Ek row mein 5 cards, sab barabar. Pehle sirf ek row; **View more** se agli row, **Less** se wapas.

### Invoices (25 Nov)
- Har invoice ke saath ab **Edit** (pencil) bhi hai: wahi form khulta hai, sab bhara hua. Number, status aur payments wahi rehte hain. **Paid** ya **Void** invoice edit nahi hoti (taala dikhta hai). Jitna paisa mil chuka hai, total us se kam nahi ho sakta.
- New Invoice mein client chunte waqt har client ke saath **Pending AED …** (laal) ya **No dues** (hara) likha aata hai. Area wala chip hata diya (address neeche likha hota hai).
- Ek invoice mein kai lines ho sakti hain: **+ Add line**.

### Overview (25 Nov)
- Cards ab halke rangon mein hain aur khulte waqt ek ke baad ek aate hain.
- **Live Map** cards ke foran baad hai. Map ke neeche chhota button (jaise "520px") pakad kar upar / neeche khenchein to map chhota / bada hota hai. Double-click se wapas 520.
- **Live Activity** mein har cleaner ka card: **Cleaning** (kitna kaam ho gaya), **On the way** (gaari chal rahi), **Later today**, **Day done**. Cleaner My Duties par jo dabata hai (On the way / Started / Done) wahi pehle maana jata hai.
- **Today's Dispatch & Shifts** sab se neeche. Service column nahi; Time mein start aur "to end". **Columns** button se columns chhupa sakte hain.

### Inventory (25 Nov)
- Table mein **In Stock** aur **Min Stock** ab alag alag columns hain: upar number, neeche unit (Bottle, Pair…).
- **Add Item** mein pehle sirf zaroori cheezein: naam, category, unit, Current Stock, Minimum Stock. Cost, supplier, location, reorder quantity **More details** dabane par.
- Unit mein number na likhein (jaise "5") — Bottles, Litres, Pieces jaisa lafz likhein. "abc" item ka unit abhi "5" hai, Edit se theek kar dein.

### Payments screen (25 Nov)
- **Date filter sirf ek hai**, header ke neeche: Today, 7 Days, 14 Days, 30 Days, This Month, Last Month. **More** mein 3 / 6 / 12 Months, This Year, Last Year, All Time aur **Custom Range** (From / To). Yahi date cards aur neeche ki lists (Outstanding, Recovered, Cash Book) dono par lagti hai.
- **Weekly report, Export Report, Record Manual Pending** ab header ke **⋮** menu mein hain.
- **Cards:** Filtered Due Total ab upar card mein hai (search / staff / amount filter ke baad ka total). Naye cards: Clients Owing, High Value Dues, Oldest Due, Unpaid Invoices, Recovery Rate. Card par mouse le jayein to neeche kone mein **aankh** ka button — dabane se card chhup jata hai. Wapas laane ke liye "hidden cards · Show all" ya ⋮ → Show hidden cards.
- List ke upar search aur filters ek line mein hain; aakhir mein **Highest Due Amount First** (sort).

### Header ke buttons (24 Nov)
- Upar daayen tarteeb: **Add Job** → **Excel Sheet** → date (◀ ▶) aur Today / range → **⋮** menu.
- **Import** ab ⋮ menu mein hai (**Import Excel**). Jobs table ke upar wala Excel Sheet button hata diya — Excel Sheet ab header mein hai.

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

### Ghalat page address
- CRM ka ghalat address likhein to ab "Page not found" aata hai (pehle khaali page). **Go to Overview** dabayein ya baayen menu istemal karein.

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
- **Sum:** cells khench kar chunein, ya column ka harf (A, B, C …) dabayein — neeche patti mein **Sum · Count · Avg** aata hai (Charges se pehle).
- **Mode / Material list:** har item ke saath ✏️ (naam badlein) aur 🗑 (hatayein — pehle poochhta hai). Jobs ka purana Mode / Material nahi badalta.
- **Split payment:** Mode dropdown → **Split payment** → modes tick karein (Cash, Online …) aur har ek ki raqam likhein → **Save split**. Mode "Cash + Online" ho jata hai, Received kul raqam.
- **Mode ke tags:** jis job ke paise baqi hain uske Mode ke saath **Pending Due**, jo zyada paise de chuka ho uske saath **Advance**.
- **Team ke remarks** sirf Leader ki row mein dikhte hain.
- **Advance:** client ka advance ho to nayi job ki raqam khud usmein se kat jati hai — poori, ya jitna advance ho (remark: "Paid from advance AED 150", Advance column mein **ADJ −150**). Baqi raqam pending rehti hai.
- **Naya client (Excel):** address mein naya naam likh kar Enter — wahi "Add New Client" popup khulta hai jo Clients screen par hai. Number UAE format ka na ho to "Save anyway?" poochha jata hai — ab ye Excel par bhi dikhta hai (pehle nahi dikhta tha, is liye save nahi hota tha).
- **Staff ka rang:** Staff cell par right-click se rang sirf us cleaner ke Staff cell par lagta hai, poori row par nahi. **Reset Block** se hat jata hai.
- **Jobs ki tarteeb:** har cleaner ki jobs subah se shaam ki tarteeb mein. Time badlein to save (3 second) ke baad row apni jagah chali jati hai.
- **Undo / Redo:** har tabdeeli (likhna, row ya cell ka rang, row hatana) Ctrl+Z se wapas hoti hai — auto-save ke baad bhi. Ctrl+Y se dobara. **Ctrl+X** se cell kaat kar Ctrl+V se doosri jagah lagayein.
- **Column chhota / bara:** column ke kinare ko khench kar jitna chahein chhota ya bara karein (Staff bhi).
- **Staff cell:** naye khali block ke Staff cell par double-click karein — Address jaisa dropdown khulta hai, sirf wo cleaners aur technical staff jo abhi sheet par nahi hain.
- **OT:** cleaner ka kul OT uske block ki **sab se upar** wali row mein; OT na ho to khana khali.
- **Address dropdown:** har client ke saath laal **Pending AED …** ya hara **Advance AED …** tag dikhta hai.
- Koi bhi popup (Add Job waghera) khulte hi cell ka dropdown khud band ho jata hai.
- **Charges Per Hour** likhein to Charges = rate × ghante khud bhar jata hai. Charges baad mein haath se badal sakte hain (VAT ya extra fee) — rate wahi rehta hai.
- **Block order** button: cleaners ke blocks ki tarteeb khud set karein (khenchein ya ↑ ↓). Ye tarteeb har din aur har user ke liye rehti hai, naye jobs se nahi badalti. **A→Z** dabane se wapas naam ki tarteeb.
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

### Leads (Website) — do tabs
- Sidebar mein **Leads (Website)** ab Marketing ke neeche hai. Header ke **neeche** do tabs: **Fluent Forms** aur **WhatsApp Clicks** (baqi screens jaisi patti).
- Header ka naam ab **Website Leads** hai; neeche ek line mein total inquiries aur "Endpoint: 200 OK Listening".
- Lead 🗑️ se delete karein to wo hamesha ke liye hat jati hai (pehle kabhi kabhi 12 second baad wapas aa jati thi).
- Upar ke cards (Today, Yesterday, **Last 30 Days**, **Last 7 Days**, Action Required) neeche ke filters ke saath badalte hain. Conversion Rate wala card hata diya.
- Form Submissions ki har row par 👁 **View**, ✏️ **Edit** aur 🗑️ **Delete**. Edit dabayein to lead seedha edit mode mein khulti hai.
- Submission popup mein **Estimated Value** nahi hai. Edit popup mein **Lead Status** upar ✕ ke saath hai.

### WhatsApp Clicks (website)
- Upar **Website connection** batata hai website se aakhri click kab aaya, ya wo kyun ruka (misaal: secret ghalat). Screen har minute khud refresh hoti hai.
- Website par jab koi WhatsApp button dabata hai, wo click CRM ki **WhatsApp Clicks** screen par aata hai: kis page se, kaun sa button, kis campaign / Google / Facebook se, mobile ya computer.
- Ye **lead nahi** hai — click mein customer ka number nahi hota. Ye batata hai ke kaun se pages aur campaigns WhatsApp chats la rahe hain. Asal chat Conversations mein aati hai.
- **Cards:** Today, Yesterday, 7 din, 30 din, All time — card par click karein to wahi muddat lag jati hai. **More cards** se Mobile clicks, Top pages, Top areas.
- **Filters:** muddat (Custom range bhi), **By page**, **By area**, search. Page / area chunein to cards bhi badal jate hain. Naya click foran aata hai.
- **By Area / Area / location column:** pehle page ka area (misaal Dubai Investment Park ka area page, ya message mein area ka naam). Na ho to visitor ki **IP se location** — "Dubai · Palm Jumeirah", "Sharjah", "Outside UAE" (saath mein chhota **IP** likha hota hai). Visitor ko koi popup nahi aata.
- IP wali location **andaza** hai: ghar / office ke internet par aksar community sahi aati hai, mobile data par zyada tar sirf emirate (kabhi ghalat emirate). Purane clicks jin ke saath IP save nahi hui, "No area" mein rehte hain.
- Har row ke aakhir mein 👁 (**View**), ✏️ (**Edit**) aur 🗑️ (**Delete**) hai. View se click ki poori detail (page, button, source, IP location, device, message) ek window mein — wahin se Edit ya Delete bhi. Edit se page, button, source, device ya message theek karein; Delete se test ya double click hata dein (pehle poochhta hai). Ye sirf admin / manager kar sakte hain.

## 4b. Overview (pehli screen)

- Header par ab **New Booking** nahi hai, aur **Quick Actions** wala dabba hata diya. Nayi booking **Bookings** ya Job Sheet se banayein.
- **Naya design (24 Nov):** upar 12 chhote cards, ek line mein 4 — Jobs, Collected, **Pending Collection**, Completion / Active Cleaners, **Crew Utilization**, **Hours Worked**, **Low Stock** / Fluent Form, WhatsApp Clicks, **New Clients**, **Expenses**. Neeche wale Pending / Low Stock / Crew dabbe ab upar cards mein hain.
- **Reports**, **Live Activity** aur **Live Map** poori chaurai mein hain. Har ek ke header mein **Hide** dabayein to wo band ho jata hai (**Show** se wapas) — aap ka computer yaad rakhta hai.
- Crew Availability aur Today's Coverage aadhe-aadhe; Revenue vs Target bara (70%) aur Business Health chhota (30%) — Business Health mein ab Crew Utilization aur Collection Rate bhi.
- **Today's Dispatch & Shifts:** har job par ✏️ **Edit** — wahi popup jo Daily Job Sheet par hai (staff, time, charges, received, mode, remarks). Sirf us din ki row badalti hai, client ka monthly schedule nahi; OT khud dobara banta hai. Band (Close Day) din edit nahi hota. ↗ se job Daily Job Sheet par us date par khulti hai. Upar **search** se client, area ya cleaner dhoondein.
- Upar ke cards mein **Fluent Form Leads** aur **WhatsApp Clicks** bhi hain — ye upar wale **Date Filter** (Today, Yesterday, 7 Days … Custom) ke mutabiq badalte hain. Card dabayein to Leads khul jata hai. (Daily Leads wala dabba hata diya.)
- **Service Mix** wala chart hata diya. Revenue vs Target ab poori chaurai mein hai.
- Neeche ke cards theek kiye: Pending card ab Pending screen jitna hi dikhata hai (aaj ke baad ki visits nahi); Active Cleaners / Crew Utilization sirf cleaners ginte hain; Crew Availability batata hai abhi kaun kaam par hai, kis ki job baad mein hai, kaun free hai; jobs ka Done / Live / Scheduled waqt se banta hai.
- **Reports:** Daily (aaj), Yesterday, Last 7 Days, Last 30 Days chunein — jobs, billed, collected, pending, expenses, naye clients, leads, clicks aur top areas. **Send by WhatsApp**, **Copy** ya **Download** (Excel mein khulta hai).
- **Live Map** (poori chaurai): upar daayen konay se map ka rang chunein — **Colorful**, **Streets**, **Satellite**. **Fit all** se sab nazar aate hain, **Full screen** se map poori screen par. Log map ke neeche cards mein bhi hain.
- Map par cleaners (hara), drivers (neela) aur CSR (jamni) chhote **bot** ki shakal mein. Bot par mouse le jayein (phone par tap) — naam, kaam abhi kya kar raha hai, aur location kab aayi. Upar se All / Cleaners / Drivers / CSR chunein; side list mein naam dabayein to map wahan chala jata hai.
  - Hara chamakta ghera = abhi live, peela = aaj ki aakhri location, grey = aaj ki aakhri job step ki jagah.
  - **Location tabhi aati hai jab staff khud share kare:** phone par **My Duties** kholein aur **Share my location with the office** dabayein (driver: "Start shift — share my location"). Page band ho to location rukk jati hai — poore din ki tracking Android app ke saath aayegi.
  - **24 Nov se:** ek dafa Share dabaya to agli baar My Duties kholte hi location khud shuru ho jati hai (jab tak **Stop** na dabayein). Share ke dauran phone ki screen band nahi hoti; neeche likha hota hai "last sent … ago". Cleaner khara bhi ho to har minute location jati hai. **My Duties ka page khula rakhein** — page band ya phone lock ho to location nahi jati (ye Android app se hoga).
  - Cleaner / driver ki login ab sirf apni duties dekhti hai: na clients, na doosre employees ka record, na leads, na Activity Log.

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

### Invoices
- **Monthly Clients → Generate Invoice:** Sr#, Date, Day, Hours, Charges/hr, Amount — har line par 👁 (job dekhein), ✏️ (is invoice ke liye ghante / rate), 🗑 (job is invoice se nikalein; job khud rehti hai).
- **Invoices screen:** invoice kholein — har line par 👁 ✏️ 🗑. Total khud dobara banta hai. Paid invoice nahi badalti.

### Alerts — contract khatam
- Monthly / Bi-Weekly contract 30 din mein khatam ho raha ho to Alerts mein aata hai (7 din ya kam = laal).

### Contract renew (Client Profile)
- Contract 30 din mein khatam ho raha ho to profile par peela banner aata hai: **+1 / +3 / +6 / +12 mo** dabayein — contract utne mahine aage barh jata hai.

### Pending → Active Outstanding Dues
- Har row ek job hai. Ek job par kai cleaners hon to bhi ek hi row (naam saath likhe hote hain).
- Client column mein client ka naam, neeche address (agar naam se alag ho) aur area.
- Aaj ke baad ki visits (jo abhi hui nahi) yahan nahi aatin.
- Monthly / Bi-Weekly client ki har unpaid visit alag row hai — ye copy nahi, alag visits hain.
- Agar ek hi visit do dafa sheet par likh di (misaal copy / paste se dusre cleaner par), to charges dono rows par aa jate hain — extra row ke charges 0 karein ya row delete karein.

### Advance se pending clear karein
- Client ka pending bhi ho aur advance bhi, to profile par **Settle AED X from advance** dabayein. Advance purani pending jobs par pehle lagta hai.

### Payments — period aur Weekly report
- Payments ke upar period chunein: This month, Last month, 3 ya 12 mahine. Cards usi period ke hote hain.
- **Weekly report** dabayein — WhatsApp khulta hai pichle 7 din ki report ke sath (jobs, billed, collected, pending, naye clients, leads, clicks). Jis ko bhejna ho chunein.

### Cleaner absent → replacement (Excel sheet)
- Cleaner ko absent / leave mark karein to upar peela banner aata hai: us ki Monthly **aur Bi-Weekly** jobs, aur replacement cleaner chunne ka option. Sirf us din ki job badalti hai, client ka schedule wahi rehta hai.

### Bi-Weekly client — rate zaroori
- Bi-Weekly client har tick kiye din par **Charges / Hr** ke baghair save nahi hota (taake visit AED 0 par na bane).

### Activity Log → Restore
- Kisi entry par click karein → **Restore** (sirf admin / manager): delete hui job / client / employee / expense wapas, badli hui cheez pehle jaisi, nayi job **Undo (remove)**. Pehle poochhta hai.

### Data health
- Data mein masle dikhata hai (misaal: job par aisa staff jo Employees mein nahi). Item click karein to seedha wahi job khulti hai.
- Ab yeh bhi: AED 0 charges wali jobs, Bi-Weekly client jis ke din par rate nahi, Pending Received jo kisi due par nahi laga, aur woh clients jin ka pending aur advance dono hain.

### Backup
- Har raat 2 baje (Dubai) poora data — aur passport, EID, visa jaise **uploaded documents** bhi — server par copy hota hai, aur us ki ek copy **Google Drive** ke "Safaeewala-Backups" folder mein jati hai. Upar ka status batata hai ke backup chal raha hai ya nahi.
- Upar ek status batata hai ke backup ho raha hai ya nahi. Teen jagah: **Server** (har raat), **Google Drive**, aur **This computer** (office computer par ek dafa folder chunein, phir rozana khud copy hoti hai, 30 din rakhi jati hain).

---

## 7. Employees
- **Employee delete:** popup mein **DELETE** likhna lazmi hai. Payment delete par bhi yahi.

- Employees table mein har cleaner ka **Short Name** dikhta hai — wahi jo Excel Job Sheet par hai. Poora naam dekhne ke liye naam par mouse rakhein. Short Name Edit mein badla ja sakta hai.
- Kisi employee ka **poora naam badlein** to Job Sheet ki uski saari rows aur monthly clients ke schedule mein bhi naam khud badal jata hai — kuch dobara likhne ki zaroorat nahi.
- Employees list mein kisi cleaner par click karein to **Employee Profile** popup khulta hai. Upar header mein tarteeb se: **Edit**, **Profile View**, laal 🗑, phir ✕.
  - **Profile View:** poora service record aur job history.
  - **Edit:** profile badlein. **Total Duty Hours** dropdown se chunein (6, 8, 9, 10, 12) ya koi aur number likhein; khali chhorein to 8 ghante maane jate hain — OT inhi se lagta hai.
  - **Laal 🗑 icon:** delete — pehle popup ke upar poochha jata hai.
- **Documents ka preview:** har document (EID, passport, visa …) 👁 par click karne se popup mein khulta hai — download karne ki zaroorat nahi. Bina extension wali purani files bhi ab khulti hain (pehle sirf Download aata tha).
- **Add Job mein Staff:** list mein sirf cleaners; **Technical** tick karein to technical staff aur drivers bhi aate hain. CSR kabhi nahi.
- **Contract dates:** Excel Job Sheet par employee sirf **Joined Date** se **Contract End Date** tak nazar aata hai (trainee ke liye **Training Start** se). Is se pehle ya baad ki sheet par uska khali block, Staff suggestion, Add Job aur Attendance popup mein naam nahi aata. Purani saved jobs nazar aati rehti hain.
- **Naam:** do employees ka poora naam ek jaisa nahi ho sakta, aur Short Name bhi kisi aur jaisa nahi (misaal: "Ambika" aur "Ambika D"). Aisa ho to Save par message aata hai — last name ka pehla harf laga dein.
- Jis employee ki photo upload hai, list (grid aur table) mein uske initials (jaise MA) ki jagah **photo** dikhti hai. Photo par click karein to bari ho kar khulti hai; band karne ke liye kahin bhi click, ✕ ya Esc. Photo Full Profile par upload / change hoti hai.

---

## 8. Aam baatein

- Har save sab users ko foran nazar aata hai (live).
- Delete ki gayi cheezon ka restore point banta hai (Settings).
- Ek computer par delete ki gayi cheez (contract, payment, advance waghera) doosre computer se **wapas nahi aati**, chahe wo computer offline tha. Restore se wapas laayi gayi cheez rehti hai.
- Website par test karna ho to naam ke shuru mein **TEST** likhein, taake asli data se alag rahe aur baad mein asani se hata sakein.
