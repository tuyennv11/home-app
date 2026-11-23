// Dịch giao diện sang English / ខ្មែរ khi người dùng chọn. Tiếng Việt không qua lớp này.
// Code nghiệp vụ đọc chữ trên giao diện để làm việc (ví dụ tìm nút theo chữ), nên textContent / innerText
// luôn trả lại chữ tiếng Việt gốc; chỉ phần hiển thị được dịch.
(function () {
  var lang = 'vi';
  try { lang = localStorage.getItem('homeLang') || (navigator.language || 'vi').slice(0, 2); } catch (e) {}
  // Đổi ngôn ngữ trong app: mở lại để toàn bộ chữ theo ngôn ngữ mới, nhớ tab đang mở để mở lại đúng tab đó
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-lang]');
    if (!b || b.closest('#loginScreen')) return;
    try {
      var tab = document.querySelector('.tab.active'), box = document.querySelector('.content');
      sessionStorage.setItem('homeLangTab', JSON.stringify({ id: tab && tab.dataset.id, top: box ? box.scrollTop : 0, at: Date.now() }));
    } catch (err) {}
    setTimeout(function () { location.reload(); }, 100);
  });
  (function backToTab() {
    var saved = null;
    try { saved = JSON.parse(sessionStorage.getItem('homeLangTab') || 'null'); sessionStorage.removeItem('homeLangTab'); } catch (err) {}
    if (!saved || !saved.id || saved.id === 'home' || Date.now() - saved.at > 30000) return;
    // App còn tải dữ liệu và vẽ lại sau khi mở: thử trong vài giây, thôi ngay khi người dùng tự bấm bất cứ đâu
    var stop = Date.now() + 6000, placed = false;
    document.addEventListener('click', function (e) { if (e.isTrusted) stop = 0; }, true);
    (function tick() {
      if (Date.now() > stop) return;
      var tab = document.querySelector('.tab[data-id="' + saved.id + '"]'), page = document.getElementById(saved.id);
      if (typeof window.go === 'function' && tab && page && tab.offsetParent !== null && !tab.classList.contains('active')) {
        window.go(saved.id, tab);
        if (!placed) { placed = true; var box = document.querySelector('.content'); if (box) setTimeout(function () { box.scrollTop = saved.top || 0; }, 50); }
      }
      setTimeout(tick, 250);
    })();
  })();
  if (lang !== 'en' && lang !== 'km') return;
  document.documentElement.lang = lang;
  // Chữ cột bảng căn (Rented, Vacant, Assigned...) dài hơn tiếng Việt: nới cột cho thẳng hàng số
  var css = document.createElement('style');
  css.textContent = '.ht-grid{grid-template-columns:minmax(0,1fr) 48px 48px 48px 48px 14px}.ht-grid.mine{grid-template-columns:minmax(0,1fr) 42px 44px 44px 44px 52px 14px}.ht-head span{font-size:9px;letter-spacing:-.1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}';
  document.head.appendChild(css);
  var col = lang === 'en' ? 1 : 2, exact = new Map(), dict = new Map();
  (window.HOME_I18N || []).forEach(function (row) {
    if (!row[col]) return;
    exact.set(row[0], row[col]);
    var low = row[0].toLocaleLowerCase('vi');
    if (!dict.has(low)) dict.set(low, row[col]);
  });
  var WEEK = { 'thứ hai': ['MONDAY', 'ថ្ងៃច័ន្ទ'], 'thứ ba': ['TUESDAY', 'ថ្ងៃអង្គារ'], 'thứ tư': ['WEDNESDAY', 'ថ្ងៃពុធ'], 'thứ năm': ['THURSDAY', 'ថ្ងៃព្រហស្បតិ៍'], 'thứ sáu': ['FRIDAY', 'ថ្ងៃសុក្រ'], 'thứ bảy': ['SATURDAY', 'ថ្ងៃសៅរ៍'], 'chủ nhật': ['SUNDAY', 'ថ្ងៃអាទិត្យ'] };
  var EN = col === 1;
  var RULES = [
    [/^khôi phục bồi thường: (sửa )?(.+)$/i, function (m) { return (EN ? 'Compensation restored: ' : 'ស្ដារសំណងវិញ៖ ') + (m[1] ? (EN ? 'Repair ' : 'ជួសជុល ') : '') + any(m[2]); }],
    [/^từ chối trước 19\/11 nên khách vẫn trả$/i, function () { return EN ? 'Rejected before 19/11, so the tenant still pays' : 'បដិសេធមុន 19/11 ដូច្នេះអ្នកជួលនៅតែបង់'; }],
    [/^trừ lại (.+) tiền trả trước$/i, function (m) { return EN ? m[1] + ' taken back from prepaid' : 'កាត់ ' + m[1] + ' ពីប្រាក់បង់មុនវិញ'; }],
    [/^thông báo: (.+)$/i, function (m) { return (EN ? 'Notice: ' : 'សេចក្ដីជូនដំណឹង៖ ') + m[1]; }],
    [/^chia ngày: (.+)$/i, function (m) { return (EN ? 'split by days: ' : 'បែងចែកតាមថ្ងៃ៖ ') + daysText(m[1]); }],
    [/^kỳ này (.+ ngày.*)$/i, function (m) { return (EN ? 'this period ' : 'គ្រានេះ ') + daysText(m[1]); }],
    [/^tính (\$[\d.,]+|[\d.,]+\s*₫)$/i, function (m) { return (EN ? 'charged ' : 'គិត ') + m[1]; }],
    [/^dư (.+) trừ vào kỳ sau$/i, function (m) { return EN ? m[1] + ' extra, deducted next period' : 'លើស ' + m[1] + ' កាត់ក្នុងគ្រាក្រោយ'; }],
    [/^cọc (\S+) → (\S+)(?: \((thu thêm|trả lại khách) (.+)\))?$/i, function (m) { var x = m[3] ? (/^thu/i.test(m[3]) ? (EN ? ' (collect ' + m[4] + ' more)' : ' (ទារបន្ថែម ' + m[4] + ')') : (EN ? ' (return ' + m[4] + ' to tenant)' : ' (សងអ្នកជួល ' + m[4] + ')')) : ''; return (EN ? 'deposit ' : 'ប្រាក់កក់ ') + m[1] + ' → ' + m[2] + x; }],
    [/^đã đóng khoán (tháng \S+) (.+), chỉ tính (.+) theo số ngày ở$/i, function (m) { return EN ? 'Paid flat ' + any(m[1]).toLowerCase() + ' ' + m[2] + ', charged only ' + m[3] + ' by days stayed' : 'បានបង់ថ្លៃថេរ ' + any(m[1]) + ' ' + m[2] + ' គិតតែ ' + m[3] + ' តាមចំនួនថ្ងៃស្នាក់'; }],
    [/^đăng ký với chính quyền cho (.+)$/i, function (m) { return EN ? 'Register ' + m[1] + ' with the local authorities' : 'ចុះឈ្មោះ ' + m[1] + ' ជាមួយអាជ្ញាធរមូលដ្ឋាន'; }],
    [/^chờ (.+) trả khách (.+) cọc dư$/i, function (m) { return EN ? 'Waiting for ' + m[1] + ' to return ' + m[2] + ' extra deposit' : 'រង់ចាំ ' + m[1] + ' សងប្រាក់កក់លើស ' + m[2]; }],
    [/^trả khách (.+) (\$[\d.,]+|[\d.,]+\s*₫) cọc dư khi chuyển phòng$/i, function (m) { return EN ? 'Return ' + m[2] + ' extra deposit to ' + m[1] + ' (room transfer)' : 'សងប្រាក់កក់លើស ' + m[2] + ' ឱ្យ ' + m[1] + ' (ប្ដូរបន្ទប់)'; }],
    [/^ở cùng (.+)$/i, function (m) { return (EN ? 'Lives with ' : 'ស្នាក់នៅជាមួយ ') + m[1]; }],
    [/^lỗ (.+) chuyển sang tháng sau$/i, function (m) { return EN ? 'loss ' + m[1] + ' carried to next month' : 'ខាត ' + m[1] + ' យោងទៅខែក្រោយ'; }],
    [/^phòng đang phụ trách \((\d+)\)$/i, function (m) { return (EN ? 'Rooms in charge (' : 'បន្ទប់កំពុងទទួលបន្ទុក (') + m[1] + ')'; }],
    [/^giữ (.+) phụ trách$/i, function (m) { return EN ? 'Keep ' + m[1] + ' in charge' : 'ទុក ' + m[1] + ' ទទួលបន្ទុក'; }],
    [/^khách đang có hợp đồng \((.+)\)$/i, function (m) { return (EN ? 'The tenant has a contract (' : 'អ្នកជួលកំពុងមានកិច្ចសន្យា (') + any(m[1]) + ')'; }],
    [/^đã có (\d+) lần$/i, function (m) { return EN ? m[1] + ' time(s) so far' : 'មាន ' + m[1] + ' ដងហើយ'; }],
    [/^(.+) \(khách chính\)$/i, function (m) { return m[1] + (EN ? ' (main tenant)' : ' (អ្នកជួលចម្បង)'); }],
    [/^giá thực tế đã mua \/ làm lại \((.+)\)$/i, function (m) { return (EN ? 'Actual cost to buy / replace (' : 'តម្លៃទិញ / ធ្វើថ្មីជាក់ស្ដែង (') + m[1] + ')'; }],
    [/^khoản trên (.+) phải xin chủ nhà duyệt trước( khi chi)?$/i, function (m) { return EN ? 'Amounts over ' + m[1] + ' need the landlord\'s approval first' : 'ចំនួនលើស ' + m[1] + ' ត្រូវសុំម្ចាស់ផ្ទះអនុម័តជាមុន'; }],
    [/^số tiền dự kiến \((.+)\)$/i, function (m) { return (EN ? 'Estimated amount (' : 'ចំនួនប្រាក់ប៉ាន់ស្មាន (') + m[1] + ')'; }],
    [/^đã xác nhận bởi (.+)$/i, function (m) { return (EN ? 'Confirmed by ' : 'បានបញ្ជាក់ដោយ ') + m[1]; }],
    [/^anh\/chị đã trả trước (.+)$/i, function (m) { return EN ? 'You prepaid ' + m[1] : 'អ្នកបានបង់មុន ' + m[1]; }],
    [/^sẽ tự trừ vào kỳ tới$/i, function () { return EN ? 'it will be deducted next period automatically' : 'នឹងកាត់ក្នុងគ្រាក្រោយដោយស្វ័យប្រវត្តិ'; }],
    [/^(\d+) món$/i, function (m) { return m[1] + (EN ? ' items' : ' មុខ'); }],
    [/^(\d+) loại$/i, function (m) { return m[1] + (EN ? ' types' : ' ប្រភេទ'); }],
    [/^máy lạnh ×(\d+)$/i, function (m) { return (EN ? 'Air conditioner ×' : 'ម៉ាស៊ីនត្រជាក់ ×') + m[1]; }],
    [/^hợp đồng và tiền cọc đứng tên khách chính (.+)$/i, function (m) { return EN ? 'The contract and deposit are in the name of the main tenant ' + m[1] : 'កិច្ចសន្យា និងប្រាក់កក់ស្ថិតក្នុងឈ្មោះអ្នកជួលចម្បង ' + m[1]; }],
    [/^anh\/chị ở cùng phòng, xem được thời hạn và điều khoản$/i, function () { return EN ? 'You share the room and can see the term and clauses' : 'អ្នកនៅបន្ទប់រួម អាចមើលរយៈពេល និងលក្ខខណ្ឌ'; }],
    [/^khách chính (.+) đứng tên hợp đồng và tiền cọc$/i, function (m) { return EN ? 'Main tenant ' + m[1] + ' holds the contract and deposit' : 'អ្នកជួលចម្បង ' + m[1] + ' ជាអ្នកកាន់កិច្ចសន្យា និងប្រាក់កក់'; }],
    [/^muốn thêm người thì đề nghị, khách chính đồng ý rồi quản lý duyệt$/i, function () { return EN ? 'To add a person, propose it; the main tenant agrees, then the manager approves' : 'ចង់បន្ថែមមនុស្ស សូមស្នើ អ្នកជួលចម្បងយល់ព្រម បន្ទាប់មកអ្នកគ្រប់គ្រងអនុម័ត'; }],
    [/^(\d+) người ở \/ tối đa (\d+)$/i, function (m) { return EN ? m[1] + ' living here / max ' + m[2] : 'ស្នាក់ ' + m[1] + ' នាក់ / អតិបរមា ' + m[2]; }],
    [/^(P\.\S+) (\d+) ngày$/, function (m) { return m[1] + ' ' + m[2] + (EN ? ' days' : ' ថ្ងៃ'); }],
    [/^(\d+) cần chú ý$/i, function (m) { return EN ? m[1] + ' need attention' : m[1] + ' ត្រូវយកចិត្តទុកដាក់'; }],
    [/^(thứ \S+|chủ nhật), (\d+) tháng (\d+)$/i, function (m) { var d = WEEK[m[1].toLocaleLowerCase('vi')]; return (d ? d[EN ? 0 : 1] : m[1]) + ', ' + m[2] + '/' + m[3]; }],
    [/^tháng (\d+)\/(\d{4})$/i, function (m) { return (EN ? 'Month ' : 'ខែ ') + m[1] + '/' + m[2]; }],
    [/^sửa: (.+)$/i, function (m) { return (EN ? 'Repair: ' : 'ជួសជុល៖ ') + m[1]; }],
    [/^tiền đang giữ trong tháng \(thu (.+) − đã chi (.+)\)$/i, function (m) { return EN ? 'Held this month (collected ' + m[1] + ' − spent ' + m[2] + ')' : 'ប្រាក់កំពុងកាន់ក្នុងខែ (ទទួល ' + m[1] + ' − ចំណាយ ' + m[2] + ')'; }],
    [/^([\d.,]+) m² · ở (\d+)\/(\d+) ngày$/i, function (m) { return EN ? m[1] + ' m² · stayed ' + m[2] + '/' + m[3] + ' days' : m[1] + ' m² · ស្នាក់ ' + m[2] + '/' + m[3] + ' ថ្ងៃ'; }],
    [/^ở (\d+)\/(\d+) ngày$/i, function (m) { return EN ? 'stayed ' + m[1] + '/' + m[2] + ' days' : 'ស្នាក់ ' + m[1] + '/' + m[2] + ' ថ្ងៃ'; }],
    [/^bạn được hưởng ([\d.,]+)%$/i, function (m) { return EN ? 'Your share ' + m[1] + '%' : 'ចំណែករបស់អ្នក ' + m[1] + '%'; }],
    [/^chờ duyệt (.+)$/i, function (m) { return EN ? 'awaiting approval ' + m[1] : 'រង់ចាំអនុម័ត ' + m[1]; }],
    [/^trả lại (.+) cùng tiền hoàn cọc$/i, function (m) { return EN ? 'Returned to ' + m[1] + ' with the deposit refund' : 'សងជូន ' + m[1] + ' ជាមួយប្រាក់កក់'; }],
    [/^chi phí chung (.+) chia theo m² và số ngày ở của các phòng thuê trong tháng \(([\d.,]+) m²\)( · không có phòng thuê nên chủ nhà chịu)?$/i, function (m) { return EN ? 'Shared cost ' + m[1] + ' is split by m² and days stayed of rented rooms this month (' + m[2] + ' m²)' + (m[3] ? ' · no rented room, so the owner bears it' : '') : 'ចំណាយរួម ' + m[1] + ' ចែកតាម m² និងចំនួនថ្ងៃស្នាក់នៃបន្ទប់ជួលក្នុងខែ (' + m[2] + ' m²)' + (m[3] ? ' · គ្មានបន្ទប់ជួល ម្ចាស់ផ្ទះទទួល' : ''); }],
    [/^quản lý nhận phần hưởng theo % lợi nhuận phòng mình phụ trách \((.+)\)$/i, function (m) { return EN ? 'Managers get their % share of the profit of rooms they manage (' + m[1] + ')' : 'អ្នកគ្រប់គ្រងទទួលចំណែក % នៃប្រាក់ចំណេញបន្ទប់ដែលខ្លួនគ្រប់គ្រង (' + m[1] + ')'; }],
    [/^làm lại (.+) cho khách (.+)$/i, function (m) { return (EN ? 'Replace ' : 'ធ្វើថ្មី ') + (EN ? any(m[1]).toLowerCase() : any(m[1])) + (EN ? ' for tenant ' : ' សម្រាប់អ្នកជួល ') + m[2]; }],
    [/^(.+) \+ trả thêm$/i, function (m) { return (one(m[1]) || any(m[1])) + (EN ? ' + extra' : ' + បង់បន្ថែម'); }],
    [/^thưởng (\d+)% tiền thuê tháng đầu$/i, function (m) { return EN ? m[1] + '% bonus of first month rent' : 'រង្វាន់ ' + m[1] + '% នៃថ្លៃជួលខែដំបូង'; }],
    [/^khách trả dư (.+): trừ vào khoản khác còn nợ \((.+)\)(?:, còn (.+) ghi là tiền trả trước)?\.$/i, function (m) { return EN ? 'Tenant overpaid ' + m[1] + ': applied to other amounts owed (' + m[2] + ')' + (m[3] ? ', ' + m[3] + ' kept as prepayment.' : '.') : 'អ្នកជួលបង់លើស ' + m[1] + ': កាត់ចូលបំណុលផ្សេង (' + m[2] + ')' + (m[3] ? ', នៅសល់ ' + m[3] + ' ទុកជាប្រាក់បង់មុន។' : '។'); }],
    [/^đã báo (.+) · chờ xác nhận$/i, function (m) { return EN ? 'Reported ' + m[1] + ' · awaiting confirmation' : 'បានរាយការណ៍ ' + m[1] + ' · រង់ចាំបញ្ជាក់'; }],
    [/^cần đóng (.+) · đã báo (.+)$/i, function (m) { return EN ? 'Due ' + m[1] + ' · reported ' + m[2] : 'ត្រូវបង់ ' + m[1] + ' · បានរាយការណ៍ ' + m[2]; }],
    [/^khách mất (.+): thu (.+)$/i, function (m) { return EN ? 'Tenant lost ' + any(m[1]).toLowerCase() + ': charge ' + m[2] : 'អ្នកជួលបាត់ ' + any(m[1]) + ': ទារ ' + m[2]; }],
    [/^khách còn (.+) tiền trả trước: cộng vào tiền hoàn cọc\.?$/i, function (m) { return EN ? 'Tenant has ' + m[1] + ' prepaid left: added to the deposit refund.' : 'អ្នកជួលនៅសល់ប្រាក់បង់មុន ' + m[1] + ': បូកចូលប្រាក់កក់សង។'; }],
    [/^đã dọn đi \((\d+)\)( ›)?$/i, function (m) { return (EN ? 'Moved out (' : 'បានចេញ (') + m[1] + ')' + (m[2] || ''); }],
    [/^ẩn khách đã dọn đi$/i, function () { return EN ? 'Hide moved-out tenants' : 'លាក់អ្នកជួលដែលបានចេញ'; }],
    [/^(.+) đã nhận lại (.+) lúc (.+)$/i, function (m) { return EN ? m[1] + ' received ' + m[2] + ' back at ' + m[3] : m[1] + ' បានទទួល ' + m[2] + ' វិញនៅ ' + m[3]; }],
    [/^biên lai đã thu \((\d+)\)$/i, function (m) { return (EN ? 'Receipts (' : 'បង្កាន់ដៃបានទទួល (') + m[1] + ')'; }],
    [/^(\d+) ảnh$/i, function (m) { return m[1] + (EN ? (m[1] === '1' ? ' photo' : ' photos') : ' រូបភាព'); }],
    [/^deposit forfeited: trả phòng trước hạn(.*)$/i, function (m) { return EN ? 'Deposit forfeited: moved out before the end of the term' + (m[1] ? any(m[1]) : '') : 'បាត់ប្រាក់កក់៖ ចេញពីបន្ទប់មុនផុតកំណត់' + (m[1] ? any(m[1]) : ''); }],
    [/^ghi lại bồi thường: (sửa )?(.+)$/i, function (m) { return (EN ? 'Compensation re-entered: ' : 'កត់សំណងឡើងវិញ៖ ') + (m[1] ? (EN ? 'repair ' : 'ជួសជុល ') : '') + any(m[2]); }],
    [/^giá thuê phòng mới \((.+)\)$/i, function (m) { return (EN ? 'New room rent (' : 'ថ្លៃជួលបន្ទប់ថ្មី (') + m[1] + ')'; }],
    [/^tiền cọc phòng mới \((.+)\)$/i, function (m) { return (EN ? 'New room deposit (' : 'ប្រាក់កក់បន្ទប់ថ្មី (') + m[1] + ')'; }],
    [/^(P\.\S+): chờ chủ nhà chuyển (.+) hoàn cọc$/i, function (m) { return m[1] + (EN ? ': waiting for the owner to send ' + m[2] + ' for the deposit refund' : ': រង់ចាំម្ចាស់ផ្ទះផ្ញើ ' + m[2] + ' សម្រាប់សងប្រាក់កក់'); }],
    [/^nhận tiền rồi trả khách (.+); nếu tự ứng trước thì số này được trừ khi chốt tháng$/i, function (m) { return EN ? 'Receive it, then pay ' + m[1] + '; if you advance it yourself, it is deducted at month close' : 'ទទួលប្រាក់ រួចសងជូន ' + m[1] + '; បើអ្នកបង់មុនខ្លួនឯង ចំនួននេះត្រូវកាត់ពេលបិទខែ'; }],
    [/^(P\.\S+) · trả lại khách cọc dư khi chuyển phòng$/i, function (m) { return m[1] + (EN ? ' · Extra deposit returned on room transfer' : ' · សងប្រាក់កក់លើសពេលប្ដូរបន្ទប់'); }],
    [/^(P\.\S+): trả khách (.*?) ?(\S+) cọc dư khi chuyển phòng$/i, function (m) { return m[1] + (EN ? ': return ' + m[3] + ' extra deposit to ' + (m[2] || 'the tenant') + ' (room transfer)' : ': សងប្រាក់កក់លើស ' + m[3] + ' ឱ្យ ' + (m[2] || 'អ្នកជួល') + ' (ប្ដូរបន្ទប់)'); }],
    [/^(P\.\S+): chờ (.+?) trả khách (\S+) cọc dư$/i, function (m) { return m[1] + (EN ? ': waiting for ' + m[2] + ' to return ' + m[3] + ' extra deposit' : ': រង់ចាំ ' + m[2] + ' សងប្រាក់កក់លើស ' + m[3]); }],
    [/^cọc phòng mới thấp hơn$/i, function () { return EN ? 'new room deposit is lower' : 'ប្រាក់កក់បន្ទប់ថ្មីទាបជាង'; }],
    [/^bấm sau khi đã trả$/i, function () { return EN ? 'tap after paying' : 'ចុចក្រោយពេលបានសង'; }],
    [/^chờ (.+) trả khách$/i, function (m) { return EN ? 'waiting for ' + m[1] + ' to pay the tenant' : 'រង់ចាំ ' + m[1] + ' សងអ្នកជួល'; }],
    [/^bấm sau khi đã đưa tiền cho (.+)$/i, function (m) { return EN ? 'Tap after you have paid ' + m[1] : 'ចុចក្រោយពេលបានឱ្យប្រាក់ ' + m[1]; }],
    [/^không tính doanh thu$/i, function () { return EN ? 'not revenue' : 'មិនគិតជាចំណូល'; }],
    [/^huỷ khoản: (.+)$/i, function (m) { return (EN ? 'Charge cancelled: ' : 'លុបការគិតប្រាក់៖ ') + any(m[1]); }],
    [/^huỷ bồi thường: (.+)$/i, function (m) { return (EN ? 'Compensation cancelled: ' : 'លុបសំណង៖ ') + any(m[1]); }],
    [/^trả lại (.+) vào tiền trả trước$/i, function (m) { return EN ? m[1] + ' returned as prepayment' : 'សង ' + m[1] + ' ជាប្រាក់បង់មុន'; }],
    [/^tổng đang giữ (.+)$/i, function (m) { return (EN ? 'Total held ' + m[1] : 'សរុបកំពុងកាន់ ' + m[1]); }],
    [/^chờ (.+) xác nhận$/i, function (m) { return (EN ? 'waiting for ' + m[1] + ' to confirm' : 'រង់ចាំ ' + m[1] + ' បញ្ជាក់'); }],
    [/^còn (.+) chưa báo$/i, function (m) { return (EN ? m[1] + ' not reported yet' : 'នៅ ' + m[1] + ' មិនទាន់រាយការណ៍'); }],
    [/^từ (\d{1,2}\/\d{1,2}(?:\/\d{4})?)$/i, function (m) { return (EN ? 'from ' : 'ចាប់ពី ') + m[1]; }],
    [/^huỷ báo người ở lại: (.+)$/i, function (m) { return (EN ? 'Cancelled guest report: ' : 'បានបោះបង់រាយការណ៍ភ្ញៀវ៖ ') + m[1]; }],
    [/^báo có người ở lại: (.+)$/i, function (m) { return (EN ? 'Guest staying: ' : 'ភ្ញៀវស្នាក់នៅ៖ ') + m[1]; }],
    [/^phòng (P\.\S+)$/i, function (m) { return (m[0] === m[0].toUpperCase() ? (EN ? 'ROOM ' : 'បន្ទប់ ') : (EN ? 'Room ' : 'បន្ទប់ ')) + m[1]; }],
    [/^báo đã trả: (.+)$/i, function (m) { return (EN ? 'Reported paid: ' : 'បានរាយការណ៍ថាបានបង់៖ ') + (one(m[1]) || m[1]); }],
    [/^đã thu (.+) \(một phần\)$/i, function (m) { return (EN ? 'Collected: ' : 'បានប្រមូល៖ ') + (one(m[1]) || any(m[1])) + (EN ? ' (partial)' : ' (មួយផ្នែក)'); }],
    [/^đã thu (phụ phí .+)$/i, function (m) { return (EN ? 'Collected: ' : 'បានប្រមូល៖ ') + (one(m[1].charAt(0).toUpperCase() + m[1].slice(1)) || any(m[1])); }],
    [/^(.+) đòi$/i, function (m) { return EN ? 'collected by ' + m[1] : m[1] + ' ទារ'; }],
    [/^đã thu ((?:tiền|điện nước) .+)$/i, function (m) { return (EN ? 'Collected: ' : 'បានប្រមូល៖ ') + (one(m[1]) || m[1]); }],
    [/^báo trả phòng: (.+)$/i, function (m) { return (EN ? 'Move-out notice: ' : 'ជូនដំណឹងចាកចេញ៖ ') + m[1]; }],
    [/^dọn đi (\d+\/\d+(?:\/\d{4})?)$/i, function (m) { return (EN ? 'moving out ' : 'ចាកចេញ ') + m[1]; }],
    [/^(đang )?chi chung, chờ (.+?) duyệt(, sau đó chủ nhà duyệt)?$/i, function (m) { return EN ? 'Shared cost, waiting for ' + m[2] + ' to approve' + (m[3] ? ', then the owner' : '') : 'ចំណាយរួម រង់ចាំ ' + m[2] + ' អនុម័ត' + (m[3] ? ' បន្ទាប់មកម្ចាស់ផ្ទះ' : ''); }],
    [/^(đang )?chờ 1 quản lý khác duyệt \((.+)\)(, sau đó chủ nhà duyệt)?$/i, function (m) { return EN ? 'Waiting for another manager to approve (' + m[2] + ')' + (m[3] ? ', then the owner' : '') : 'រង់ចាំអ្នកគ្រប់គ្រងម្នាក់ទៀតអនុម័ត (' + m[2] + ')' + (m[3] ? ' បន្ទាប់មកម្ចាស់ផ្ទះ' : ''); }],
    [/^(.+) đã duyệt$/i, function (m) { return EN ? 'approved by ' + m[1] : m[1] + ' បានអនុម័ត'; }],
    [/^(tiếp nhận sửa|hẹn lại ngày sửa): (.+)$/i, function (m) { var again = /^hẹn/i.test(m[1]); return (EN ? (again ? 'Repair rescheduled: ' : 'Repair accepted: ') : (again ? 'ណាត់ជួសជុលឡើងវិញ៖ ' : 'ទទួលជួសជុល៖ ')) + (one(m[2]) || m[2]); }],
    [/^hẹn (\d+\/\d+(?:\/\d{4})?)$/i, function (m) { return (EN ? 'scheduled ' : 'ណាត់ ') + m[1]; }],
    // Khoản nợ, trả trước, phụ phí: tên khoản ghi tiếng Việt trong dữ liệu, chỉ dịch lúc hiện
    [/^khách trả thiếu (.+): phần còn lại vẫn ghi nợ$/i, function (m) { return EN ? 'Tenant paid ' + m[1] + ' short: the rest stays owed' : 'អ្នកជួលបង់ខ្វះ ' + m[1] + '៖ ប្រាក់នៅសល់នៅតែជំពាក់'; }],
    [/^khách trả dư (.+): ghi là tiền trả trước, tự trừ vào kỳ sau$/i, function (m) { return EN ? 'Tenant paid ' + m[1] + ' extra: recorded as prepaid, deducted next period' : 'អ្នកជួលបង់លើស ' + m[1] + '៖ កត់ជាការបង់មុន កាត់ក្នុងគ្រាបន្ទាប់'; }],
    [/^trong đó tiền cọc (.+) nộp chủ nhà, không tính doanh thu$/i, function (m) { return EN ? 'Of which deposit ' + m[1] + ', goes to the owner, not counted as revenue' : 'ក្នុងនោះប្រាក់កក់ ' + m[1] + ' ប្រគល់ម្ចាស់ផ្ទះ មិនគិតជាចំណូល'; }],
    [/^ghi nợ cho khách: (.+)$/i, function (m) { return (EN ? 'Charged to tenant: ' : 'កត់ជំពាក់អ្នកជួល៖ ') + any(m[1]); }],
    [/^trừ tiền trả trước vào (.+)$/i, function (m) { return (EN ? 'Prepaid amount used for ' : 'កាត់ប្រាក់បង់មុនសម្រាប់ ') + any(m[1]); }],
    [/^(.+): đã sửa xong$/i, function (m) { return EN ? m[1] + ': repaired' : m[1] + '៖ បានជួសជុលរួច'; }],
    [/^(.+): xác nhận đã sửa xong$/i, function (m) { return EN ? m[1] + ': confirmed the repair' : m[1] + '៖ បានបញ្ជាក់ថាជួសជុលរួច'; }],
    [/^(.+): tiếp nhận, hẹn sửa (.+)$/i, function (m) { return EN ? m[1] + ': accepted, repair on ' + m[2] : m[1] + '៖ បានទទួល ណាត់ជួសជុល ' + m[2]; }],
    [/^tiếp nhận, hẹn sửa (.+)$/i, function (m) { return EN ? 'accepted, repair on ' + m[1] : 'បានទទួល ណាត់ជួសជុល ' + m[1]; }],
    [/^(.+): từ chối chi phí ?(.*)$/i, function (m) { return EN ? m[1] + ': rejected the cost ' + m[2] : m[1] + '៖ បដិសេធចំណាយ ' + m[2]; }],
    [/^(.+): duyệt chi phí (.+)$/i, function (m) { return EN ? m[1] + ': approved the cost ' + m[2] : m[1] + '៖ អនុម័តចំណាយ ' + m[2]; }],
    [/^(.+): ghi lại chi phí (.+)$/i, function (m) { return EN ? m[1] + ': re-entered the cost ' + m[2] : m[1] + '៖ បញ្ចូលចំណាយឡើងវិញ ' + m[2]; }],
    [/^(.+) báo hư$/i, function (m) { return EN ? m[1] + ' reported it' : m[1] + ' បានរាយការណ៍ខូច'; }],
    [/^bị từ chối bởi (.+?): (.+)$/i, function (m) { return EN ? 'Rejected by ' + m[1] + ': ' + m[2] : 'បដិសេធដោយ ' + m[1] + '៖ ' + m[2]; }],
    [/^bị từ chối bởi (.+)$/i, function (m) { return (EN ? 'Rejected by ' : 'បដិសេធដោយ ') + m[1]; }],
    [/^(\p{Lu}\S*(?: \S+){0,3}) ghi$/u, function (m) { return EN ? 'entered by ' + m[1] : 'កត់ដោយ ' + m[1]; }],
    [/^(.+) đã đọc nội quy$/i, function (m) { return EN ? m[1] + ' read the house rules' : m[1] + ' បានអានបទបញ្ជាផ្ទះ'; }],
    [/^khách chính đồng ý người ở cùng:? (.+)$/i, function (m) { return EN ? 'Main tenant agreed to roommate ' + m[1] : 'អ្នកជួលចម្បងយល់ព្រមអ្នករស់នៅជាមួយ ' + m[1]; }],
    [/^tài khoản người ở cùng phòng (P\.\S+)$/i, function (m) { return EN ? 'Roommate account, room ' + m[1] : 'គណនីអ្នករស់នៅជាមួយ បន្ទប់ ' + m[1]; }],
    [/^đã đăng ký khách với chính quyền cho (.+)$/i, function (m) { return EN ? 'Registered with the authorities: ' + m[1] : 'បានចុះឈ្មោះជាមួយអាជ្ញាធរ៖ ' + m[1]; }],
    [/^đã khai báo tạm trú cho (.+)$/i, function (m) { return EN ? 'Residence declared for ' + m[1] : 'បានប្រកាសស្នាក់នៅសម្រាប់ ' + m[1]; }],
    [/^thưởng tìm khách cho (.+)$/i, function (m) { return EN ? 'Finder bonus for ' + m[1] : 'ប្រាក់រង្វាន់រកអ្នកជួលសម្រាប់ ' + m[1]; }],
    [/^thưởng tìm khách (.+)$/i, function (m) { return EN ? 'Finder bonus: ' + m[1] : 'ប្រាក់រង្វាន់រកអ្នកជួល៖ ' + m[1]; }],
    [/^thưởng (\d+)% tiền thuê tháng đầu$/i, function (m) { return EN ? m[1] + '% of first month rent' : m[1] + '% នៃថ្លៃជួលខែដំបូង'; }],
    [/^nhắc khách (.+) ký hợp đồng$/i, function (m) { return EN ? 'Reminded ' + m[1] + ' to sign the contract' : 'បានរំលឹក ' + m[1] + ' ចុះហត្ថលេខាកិច្ចសន្យា'; }],
    [/^(.+ \+ .+)$/, function (m) { var bits = m[1].split(' + '), any2 = bits.map(any); return any2.join(' + ') === m[1] ? null : any2.join(' + '); }],
    [/^bồi thường (?!sửa )(.+)$/i, function (m) { return (EN ? 'Compensation: ' : 'សំណង៖ ') + any(m[1]); }],
    [/^đã thu (bồi thường .+)$/i, function (m) { return (EN ? 'Collected: ' : 'បានប្រមូល៖ ') + any(m[1]); }],
    [/^(điện nước khoán tháng \S+) \((.+)\)$/i, function (m) { return any(m[1]) + ' (' + m[2].split(', ').map(any).join(', ') + ')'; }],
    [/^đã duyệt bởi (.+)$/i, function (m) { return (EN ? 'Approved by ' : 'អនុម័តដោយ ') + (exact.get(m[1]) || m[1]); }],
    [/^duyệt bởi (.+)$/i, function (m) { return (EN ? 'Approved by ' : 'អនុម័តដោយ ') + (exact.get(m[1]) || m[1]); }],
    [/^trả lại (.+) vào tiền trả trước$/i, function (m) { return EN ? m[1] + ' returned as prepaid credit' : 'ប្រគល់ ' + m[1] + ' ចូលប្រាក់បង់មុន'; }],
    [/^đổi tiền bồi thường: (sửa )?(.+)$/i, function (m) { return (EN ? (m[1] ? 'Repair compensation changed: ' : 'Compensation changed: ') : (m[1] ? 'ប្ដូរប្រាក់សំណងជួសជុល៖ ' : 'ប្ដូរប្រាក់សំណង៖ ')) + any(m[2]); }],
    [/^bồi thường sửa (.+)$/i, function (m) { return (EN ? 'Repair compensation: ' : 'សំណងជួសជុល៖ ') + any(m[1]); }],
    [/^nợ sau trả phòng: (.+)$/i, function (m) { return (EN ? 'Owed after move-out: ' : 'ជំពាក់ក្រោយប្រគល់បន្ទប់៖ ') + any(m[1]); }],
    [/^chênh lệch tiền thuê (\d+) ngày ở (P\.\S+)$/i, function (m) { return EN ? 'Rent difference for ' + m[1] + ' days in ' + m[2] : 'ភាពខុសគ្នាថ្លៃជួល ' + m[1] + ' ថ្ងៃនៅ ' + m[2]; }],
    [/^làm lại (.+) bị mất$/i, function (m) { return (EN ? 'Replace lost ' : 'ធ្វើថ្មី ') + (EN ? any(m[1]).toLowerCase() : any(m[1])) + (EN ? '' : ' ដែលបាត់'); }],
    [/^(?:đã )?thu bởi (.+)$/i, function (m) { return (EN ? 'Collected by ' : 'ប្រមូលដោយ ') + m[1]; }],
    [/^thêm ngày (\S+) bởi (.+)$/i, function (m) { return EN ? 'Added ' + m[1] + ' by ' + m[2] : 'បន្ថែមថ្ងៃ ' + m[1] + ' ដោយ ' + m[2]; }],
    [/^phụ phí (\d+) người ở thêm tháng (\S+)( \(tính theo ngày ở\))?( \(gồm điện nước khoán\))?$/i, function (m) { return EN ? 'Fee for ' + m[1] + ' extra person' + (m[1] === '1' ? '' : 's') + ', month ' + m[2] + (m[3] ? ' (by days stayed)' : '') + (m[4] ? ' (incl. flat utilities)' : '') : 'ថ្លៃមនុស្សបន្ថែម ' + m[1] + ' នាក់ ខែ ' + m[2] + (m[3] ? ' (តាមថ្ងៃស្នាក់នៅ)' : '') + (m[4] ? ' (រួមភ្លើងទឹកថេរ)' : ''); }],
    [/^trừ phụ phí đã đóng dư tháng (\S+)$/i, function (m) { return EN ? 'Extra person fee overpaid for ' + m[1] : 'ថ្លៃមនុស្សបន្ថែមបង់លើសខែ ' + m[1]; }],
    [/^(.+) trừ vào kỳ tới$/i, function (m) { return EN ? m[1] + ' deducted next period' : m[1] + ' កាត់ក្នុងគ្រាក្រោយ'; }],
    [/^(.+) \(đã thu một phần\)$/i, function (m) { return any(m[1]) + (EN ? ' (partly collected)' : ' (បានប្រមូលមួយផ្នែក)'); }],
    [/^thiếu (.+): phần còn lại vẫn ghi nợ$/i,function (m) { return EN ? 'Short by ' + m[1] + ': the rest stays owed' : 'ខ្វះ ' + m[1] + '៖ ប្រាក់នៅសល់នៅតែជំពាក់'; }],
    [/^dư (.+): ghi là trả trước, trừ vào kỳ sau$/i, function (m) { return EN ? 'Over by ' + m[1] + ': recorded as advance, deducted next period' : 'លើស ' + m[1] + '៖ កត់ជាការបង់មុន កាត់ក្នុងគ្រាបន្ទាប់'; }],
    [/^lần báo trước bị từ chối: (.+)$/i, function (m) { return (EN ? 'Previous report was rejected: ' : 'ការរាយការណ៍មុនត្រូវបានបដិសេធ៖ ') + m[1]; }],
    [/^chi phí bị từ chối: (.+)$/i, function (m) { return (EN ? 'Expense rejected: ' : 'ចំណាយត្រូវបានបដិសេធ៖ ') + (one(m[1]) || m[1]); }],
    [/^bị từ chối: (.+)$/i, function (m) { return (EN ? 'rejected: ' : 'ត្រូវបានបដិសេធ៖ ') + m[1]; }],
    [/^đã báo (\d+\/\d+)$/i, function (m) { return (EN ? 'Reported ' : 'បានរាយការណ៍ ') + m[1]; }],
    [/^đưa (?!tiền)(.+)$/i, function (m) { return (EN ? 'paid to ' : 'ប្រគល់ឱ្យ ') + m[1]; }],
    [/^trả một phần (.+)$/i, function (m) { return (EN ? 'Part payment: ' : 'បង់មួយផ្នែក៖ ') + any(m[1]); }],
    [/^hạn (\d+\/\d+(?:\/\d+)?)$/i, function (m) { return (EN ? 'Due ' : 'កំណត់ ') + m[1]; }],
    [/^(quá hạn|hạn) (\d+\/\d+) · còn (.+)$/i, function (m) { var late = /^quá/i.test(m[1]); return (EN ? (late ? 'Overdue ' : 'Due ') + m[2] + ' · ' + m[3] + ' left' : (late ? 'ហួសកំណត់ ' : 'កំណត់ ') + m[2] + ' · នៅសល់ ' + m[3]); }],
    [/^quá hạn (\d+) ngày$/i, function (m) { return EN ? m[1] + (m[1] === '1' ? ' day overdue' : ' days overdue') : 'ហួសកំណត់ ' + m[1] + ' ថ្ងៃ'; }],
    [/^(\d+) (ngày|món|khoản|căn|phòng|người|hoạt động|việc|lần|đêm|tháng)$/i, function (m) {
      var word = { 'ngày': ['days', 'ថ្ងៃ'], 'món': ['items', 'មុខ'], 'khoản': ['items', 'ខ្ទង់'], 'căn': ['houses', 'ផ្ទះ'], 'phòng': ['rooms', 'បន្ទប់'], 'người': ['people', 'នាក់'], 'hoạt động': ['activities', 'សកម្មភាព'], 'việc': ['tasks', 'កិច្ចការ'], 'lần': ['times', 'ដង'], 'đêm': ['nights', 'យប់'], 'tháng': ['months', 'ខែ'] }[m[2].toLocaleLowerCase('vi')];
      return m[1] + ' ' + word[EN ? 0 : 1];
    }],
    [/^quản lý được (\d+)% lợi nhuận các phòng mình phụ trách\.?$/i, function (m) { return EN ? 'Managers get ' + m[1] + '% of the profit of the rooms they handle' : 'អ្នកគ្រប់គ្រងទទួលបាន ' + m[1] + '% នៃប្រាក់ចំណេញពីបន្ទប់ដែលខ្លួនទទួលខុសត្រូវ'; }],
    [/^tăng giá phải báo trước ít nhất 30 ngày \(theo điều khoản hợp đồng\): chọn ngày áp dụng từ (\S+) trở đi\.?$/i, function (m) { return EN ? 'Rent increases need at least 30 days\' notice (per the contract): choose a start date from ' + m[1] + ' onward.' : 'ការដំឡើងថ្លៃត្រូវជូនដំណឹងយ៉ាងហោចណាស់ 30 ថ្ងៃមុន (តាមកិច្ចសន្យា)៖ ជ្រើសថ្ងៃអនុវត្តចាប់ពី ' + m[1] + ' ទៅ'; }],
    [/^tổng (\d+) căn$/i, function (m) { return EN ? 'Total ' + m[1] + ' houses' : 'សរុប ' + m[1] + ' ផ្ទះ'; }],
    [/^căn: (.+)$/i, function (m) { return (EN ? 'House: ' : 'ផ្ទះ៖ ') + m[1]; }],
    [/^phụ trách (\d+) phòng$/i, function (m) { return EN ? 'Assigned ' + m[1] + ' rooms' : 'ទទួលខុសត្រូវ ' + m[1] + ' បន្ទប់'; }],
    [/^căn (\d+) quản lý$/i, function (m) { return EN ? 'House with ' + m[1] + ' manager' : 'ផ្ទះមានអ្នកគ្រប់គ្រង ' + m[1]; }],
    [/^(\d+) khoản đã xác nhận$/i, function (m) { return EN ? m[1] + ' confirmed' : 'បានបញ្ជាក់ ' + m[1]; }],
    [/^ngày (\d+) hằng tháng$/i, function (m) { return EN ? 'Day ' + m[1] + ' of each month' : 'ថ្ងៃទី ' + m[1] + ' រៀងរាល់ខែ'; }],
    [/^hạn ngày (\d+) hằng tháng$/i, function (m) { return EN ? 'due on day ' + m[1] + ' of each month' : 'កំណត់ថ្ងៃទី ' + m[1] + ' រៀងរាល់ខែ'; }],
    [/^tiền thuê mỗi tháng \((\w+)\)$/i, function (m) { return (EN ? 'Monthly rent (' : 'ថ្លៃជួលប្រចាំខែ (') + m[1] + ')'; }],
    [/^tiền cọc \((\w+)\)$/i, function (m) { return (EN ? 'Deposit (' : 'ប្រាក់កក់ (') + m[1] + ')'; }],
    [/^số người ở \(tối đa (\d+)\)$/i, function (m) { return EN ? 'Occupants (max ' + m[1] + ')' : 'ចំនួនអ្នកស្នាក់នៅ (អតិបរមា ' + m[1] + ')'; }],
    [/^hôm nay là hạn đóng (.+)$/i, function (m) { return EN ? 'Today is the due date for ' + m[1] : 'ថ្ងៃនេះជាថ្ងៃកំណត់បង់ ' + m[1]; }],
    [/^ngày mai là hạn đóng (.+)$/i, function (m) { return EN ? 'Tomorrow is the due date for ' + m[1] : 'ថ្ងៃស្អែកជាថ្ងៃកំណត់បង់ ' + m[1]; }],
    [/^bắt buộc khi số tiền trên (.+)$/i, function (m) { return EN ? 'Required when the amount is over ' + m[1] : 'ចាំបាច់ពេលចំនួនទឹកប្រាក់លើស ' + m[1]; }],
    [/^gồm chi chung (.+)$/i, function (m) { return EN ? 'incl. shared costs ' + m[1] : 'រួមចំណាយរួម ' + m[1]; }],
    [/^chào (.+?) ?👋$/i, function (m) { return (EN ? 'Hello ' : 'សួស្ដី ') + m[1] + ' 👋'; }],
    [/^quản lý (.+) thêm$/i, function (m) { return EN ? 'Added by manager ' + m[1] : 'អ្នកគ្រប់គ្រង ' + m[1] + ' បានបន្ថែម'; }],
    [/^cố định (.+)\/tháng$/i, function (m) { return EN ? 'Fixed ' + m[1] + '/month' : 'ថេរ ' + m[1] + '/ខែ'; }],
    [/^đầu kỳ (.+)$/i, function (m) { return (EN ? 'start ' : 'ដើមគ្រា ') + m[1]; }],
    [/^người thêm: (.+)$/i, function (m) { return (EN ? 'Added by: ' : 'អ្នកបន្ថែម៖ ') + m[1]; }],
    [/^cùng căn ~(.+)$/i, function (m) { return (EN ? 'same house ~' : 'ផ្ទះដដែល ~') + m[1]; }],
    [/^duyệt phòng (.+)\?$/i, function (m) { return (EN ? 'Approve room ' : 'អនុម័តបន្ទប់ ') + m[1] + '?'; }],
    [/^(\d+) món chưa có ảnh$/i, function (m) { return EN ? m[1] + ' item(s) without photo' : m[1] + ' មុខគ្មានរូបថត'; }],
    [/^lý do từ chối: (.+)$/i, function (m) { return (EN ? 'Reason: ' : 'មូលហេតុ៖ ') + m[1]; }],
    [/^ghi bởi (.+)$/i, function (m) { return (EN ? 'by ' : 'ដោយ ') + m[1]; }],
    [/^QL (.+)$/, function (m) { return (EN ? 'Mgr ' : 'អ្នកគ្រប់គ្រង ') + m[1]; }],
    [/^hạn ký: (.+)$/i, function (m) { return (EN ? 'Sign by: ' : 'ចុះហត្ថលេខាមុន៖ ') + m[1]; }],
    [/^căn nhà: (.+)$/i, function (m) { return (EN ? 'House: ' : 'ផ្ទះ៖ ') + m[1]; }],
    [/^([\d.,]+ ?[₫$]|\$[\d.,]+)\/tháng$/, function (m) { return m[1] + (EN ? '/month' : '/ខែ'); }],
    [/^(.+): chờ (.+) ký hợp đồng$/i, function (m) { return EN ? m[1] + ': waiting for ' + m[2] + ' to sign' : m[1] + '៖ រង់ចាំ ' + m[2] + ' ចុះហត្ថលេខា'; }],
    [/^bước (\d+)\/(\d+)$/i, function (m) { return (EN ? 'step ' : 'ជំហាន ') + m[1] + '/' + m[2]; }],
    [/^kỳ sau (\d+\/\d+)$/i, function (m) { return (EN ? 'next due ' : 'លើកក្រោយ ') + m[1]; }],
    [/^cần đóng (.+)$/i, function (m) { return (EN ? 'To pay ' : 'ត្រូវបង់ ') + m[1]; }],
    [/^hẹn (\d+\/\d+(?:\/\d+)?)$/i, function (m) { return (EN ? 'scheduled ' : 'ណាត់ ') + m[1]; }],
    [/^(.+) hẹn sửa (\d+\/\d+\/\d{4})( \(.+\))?$/i, function (m) { return EN ? m[1] + ' will repair on ' + m[2] + (m[3] || '') : m[1] + ' ណាត់ជួសជុល ' + m[2] + (m[3] || ''); }],
    [/^hẹn sửa (\d+\/\d+\/\d{4})$/i, function (m) { return (EN ? 'repair on ' : 'ណាត់ជួសជុល ') + m[1]; }],
    [/^(\d+) biên bản chưa xem$/i, function (m) { return EN ? m[1] + ' unread record(s)' : m[1] + ' កំណត់ត្រាមិនទាន់មើល'; }],
    [/^đã trả trước (.+)$/i, function (m) { return (EN ? 'Prepaid ' : 'បានបង់មុន ') + m[1]; }],
    [/^(.+) đang sửa$/i, function (m) { return EN ? m[1] + ' is repairing' : m[1] + ' កំពុងជួសជុល'; }],
    [/^người ở cùng · (.+)$/i, function (m) { return (EN ? 'Roommates · ' : 'អ្នករស់នៅជាមួយ · ') + m[1]; }],
    [/^đã xem (\d+\/\d+)$/i, function (m) { return (EN ? 'seen ' : 'បានមើល ') + m[1]; }],
    [/^(chủ nhà|quản lý) đã nhắc ngày (\d+\/\d+\/\d+)$/i, function (m) { var mgr = /^q/i.test(m[1]); return EN ? (mgr ? 'Manager' : 'Landlord') + ' reminded on ' + m[2] : (mgr ? 'អ្នកគ្រប់គ្រង' : 'ម្ចាស់ផ្ទះ') + 'បានរំលឹកថ្ងៃ ' + m[2]; }],
    [/^đã nhắc (\d+\/\d+)$/i, function (m) { return (EN ? 'reminded ' : 'បានរំលឹក ') + m[1]; }],
    [/^khách đã nhắc (\d+) lần$/i, function (m) { return EN ? 'tenant reminded ' + m[1] + ' time(s)' : 'អ្នកជួលបានរំលឹក ' + m[1] + ' ដង'; }],
    [/^(theo danh sách|lúc giao phòng) ×?(\d+)$/i, function (m) { var mv = /^l/i.test(m[1]); return (EN ? (mv ? 'At move-in ' : 'Per list ') : (mv ? 'ពេលប្រគល់បន្ទប់ ' : 'តាមបញ្ជី ')) + (/×/.test(m[0]) ? '×' : '') + m[2]; }],
    [/^còn (\d+)%$/i, function (m) { return (EN ? m[1] + '% left' : 'នៅ ' + m[1] + '%'); }],
    [/^(điện|nước) khoán (\S+)\/tháng$/i, function (m) { var e = /^đ/i.test(m[1]); return EN ? (e ? 'Electricity' : 'Water') + ' flat ' + m[2] + '/month' : (e ? 'ភ្លើង' : 'ទឹក') + 'ថេរ ' + m[2] + '/ខែ'; }],
    [/^chụp ảnh riêng của (.+) \(bắt buộc\)$/i, function (m) { return EN ? 'Take a photo of ' + m[1] + ' (required)' : 'សូមថតរូប ' + m[1] + ' (ចាំបាច់)'; }],
    [/^(\d+) đã chọn(\s*＋)?$/i, function (m) { return (EN ? m[1] + ' selected' : 'បានជ្រើស ' + m[1]) + (m[2] ? '　＋' : ''); }],
    [/^đã chọn (\d+) ảnh · chọn lại$/i, function (m) { return EN ? m[1] + ' photos · choose again' : 'បានជ្រើស ' + m[1] + ' រូប · ជ្រើសម្ដងទៀត'; }],
    [/^＋ ảnh( \*)?$/i, function (m) { return (EN ? '＋ Photo' : '＋ រូបថត') + (m[1] || ''); }],
    [/^người thêm (\d+)$/i, function (m) { return EN ? 'Person ' + m[1] : 'អ្នកបន្ថែមទី ' + m[1]; }],
    [/^nhập họ tên người thêm (\d+)\.?$/i, function (m) { return EN ? 'Enter the full name of person ' + m[1] : 'បញ្ចូលឈ្មោះពេញអ្នកបន្ថែមទី ' + m[1]; }],
    [/^tải ảnh mặt trước cccd \/ hộ chiếu của người thêm (\d+) \(bắt buộc\)\.?$/i, function (m) { return EN ? 'Upload the front of the ID / passport of person ' + m[1] + ' (required)' : 'សូមផ្ទុករូបផ្នែកខាងមុខអត្តសញ្ញាណប័ណ្ណ / លិខិតឆ្លងដែនរបស់អ្នកបន្ថែមទី ' + m[1] + ' (ចាំបាច់)'; }],
    [/^thêm người ở cùng · (.+)$/i, function (m) { return (EN ? 'Add roommate · ' : 'បន្ថែមអ្នករស់នៅជាមួយ · ') + m[1]; }],
    [/^(.+) \((\d+) cái\)$/i, function (m) { return (one(m[1]) || m[1]) + ' (' + m[2] + ')'; }],
    [/^phòng đã có (.+), bấm chọn đúng cái bị hư\.?$/i, function (m) { return EN ? 'The room already has ' + (one(m[1]) || m[1]) + ': tap the one that is broken.' : 'បន្ទប់មាន ' + (one(m[1]) || m[1]) + ' រួចហើយ: ចុចជ្រើសគ្រឿងដែលខូច។'; }],
    [/^phòng có (\d+) cái, xem ảnh lúc giao phòng rồi chọn cái bị hư$/i, function (m) { return EN ? 'The room has ' + m[1] + ' of these: check the move-in photos and pick the broken one' : 'បន្ទប់មាន ' + m[1] + ' គ្រឿង: មើលរូបពេលប្រគល់បន្ទប់ ហើយជ្រើសគ្រឿងដែលខូច'; }],
    [/^(.+) \(anh\/chị\)$/i, function (m) { return m[1] + (EN ? ' (you)' : ' (អ្នក)'); }],
    [/^ở từ (.+)$/i, function (m) { return (EN ? 'since ' : 'ចាប់ពី ') + m[1]; }],
    [/^mời (\d+\/\d+\/\d{4})$/i, function (m) { return (EN ? 'invited ' : 'អញ្ជើញ ') + m[1]; }],
    [/^khách chính (.+?)( thêm hoặc bỏ người ở cùng)?$/i, function (m) { return m[2] ? (EN ? 'Main tenant ' + m[1] + ' adds or removes roommates' : 'អ្នកជួលចម្បង ' + m[1] + ' បន្ថែម ឬដកអ្នករស់នៅជាមួយ') : (EN ? 'main tenant ' : 'អ្នកជួលចម្បង ') + m[1]; }],
    [/^đang ở (\d+) người( \/ tối đa (\d+))?(, phòng đã đủ người)?$/i, function (m) { return (EN ? m[1] + ' living here' + (m[2] ? ' / max ' + m[3] : '') + (m[4] ? ', the room is full' : '') : 'កំពុងស្នាក់នៅ ' + m[1] + ' នាក់' + (m[2] ? ' / អតិបរមា ' + m[3] : '') + (m[4] ? ', បន្ទប់ពេញហើយ' : '')); }],
    [/^(\d+) → (\d+) người( \/ tối đa (\d+))?$/i, function (m) { return m[1] + ' → ' + m[2] + (EN ? ' people' + (m[3] ? ' / max ' + m[4] : '') : ' នាក់' + (m[3] ? ' / អតិបរមា ' + m[4] : '')); }],
    [/^phòng chỉ cho tối đa (\d+) người, không được ở vượt\.?$/i, function (m) { return EN ? 'This room allows at most ' + m[1] + ' people.' : 'បន្ទប់នេះអនុញ្ញាតអតិបរមា ' + m[1] + ' នាក់។'; }],
    [/^từ kỳ sau thu thêm (.+) \/ người \/ tháng\.?$/i, function (m) { return EN ? 'From next period: extra ' + m[1] + ' / person / month.' : 'ពីគ្រាក្រោយ បង់បន្ថែម ' + m[1] + ' / នាក់ / ខែ។'; }],
    [/^thôi thu từ kỳ (.+)$/i, function (m) { return (EN ? 'Stops from period ' : 'ឈប់គិតពីគ្រា ') + m[1]; }],
    [/^nay (\d+) người \(tối đa (\d+), chủ nhà đồng ý cho ở thêm\)$/i, function (m) { return EN ? 'Now ' + m[1] + ' people (max ' + m[2] + ', landlord allowed the extra person)' : 'ឥឡូវ ' + m[1] + ' នាក់ (អតិបរមា ' + m[2] + ', ម្ចាស់ផ្ទះយល់ព្រម)'; }],
    [/^(\p{Lu}\S*(?: \p{Lu}\S*){0,3}) thêm, (\p{Lu}\S*(?: \p{Lu}\S*){0,3}) đồng ý$/u, function (m) { return EN ? m[1] + ' added, ' + m[2] + ' agreed' : m[1] + ' បានបន្ថែម, ' + m[2] + ' បានយល់ព្រម'; }],
    [/^mời (.+) ở cùng$/i, function (m) { return EN ? 'Invited ' + m[1] + ' as a roommate' : 'បានអញ្ជើញ ' + m[1] + ' ស្នាក់នៅជាមួយ'; }],
    [/^quản lý không duyệt (.+)$/i, function (m) { return EN ? 'Manager declined ' + m[1] : 'អ្នកគ្រប់គ្រងមិនអនុម័ត ' + m[1]; }],
    [/^chủ nhà không đồng ý (.+)$/i, function (m) { return EN ? 'Landlord declined ' + m[1] : 'ម្ចាស់ផ្ទះមិនយល់ព្រម ' + m[1]; }],
    [/^đã báo (.+) dọn đi$/i, function (m) { return EN ? 'Reported ' + m[1] + ' moved out' : 'បានរាយការណ៍ ' + m[1] + ' ចេញហើយ'; }],
    [/^huỷ (mời|thêm) (.+)\?*$/i, function (m) { var mo = /mời/i.test(m[1]); return EN ? (mo ? 'Cancel the invite for ' : 'Cancel adding ') + m[2] : (mo ? 'បោះបង់ការអញ្ជើញ ' : 'បោះបង់ការបន្ថែម ') + m[2]; }],
    [/^máy chủ chưa nhận việc vừa làm, anh\/chị làm lại giúp: (.+)$/i, function (m) { return EN ? 'The server did not receive your last action, please do it again: ' + m[1] : 'ម៉ាស៊ីនមេមិនទាន់ទទួលសកម្មភាពចុងក្រោយ សូមធ្វើម្ដងទៀត: ' + m[1]; }],
    [/^nay (\d+) người$/i, function (m) { return EN ? 'Now ' + m[1] + ' people' : 'ឥឡូវ ' + m[1] + ' នាក់'; }],
    [/^(\p{Lu}\S*(?: \p{Lu}\S*){0,3}) (mời|gửi|duyệt|ghi|thêm|đồng ý)$/u, function (m) { var w = { 'đồng ý': ['agreed', 'បានយល់ព្រម'], 'mời': ['invited', 'បានអញ្ជើញ'], 'gửi': ['sent', 'បានផ្ញើ'], 'duyệt': ['approved', 'បានអនុម័ត'], 'thêm': ['added', 'បានបន្ថែម'], 'ghi': ['recorded', 'បានកត់ត្រា'] }[m[2].toLocaleLowerCase('vi')]; return m[1] + ' ' + w[EN ? 0 : 1]; }],
    [/^mật khẩu cho (.+)$/i, function (m) { return (EN ? 'Password for ' : 'ពាក្យសម្ងាត់សម្រាប់ ') + m[1]; }],
    [/^(.+) đăng nhập bằng số (.+?)\.?$/i, function (m) { return EN ? m[1] + ' signs in with ' + m[2] + '.' : m[1] + ' ចូលដោយលេខ ' + m[2] + '។'; }],
    [/^báo cho (.+) đăng nhập bằng số$/i, function (m) { return EN ? 'Tell ' + m[1] + ' to sign in with' : 'ប្រាប់ ' + m[1] + ' ឱ្យចូលដោយលេខ'; }],
    [/^không duyệt (.+)\?$/i, function (m) { return (EN ? 'Decline ' : 'មិនអនុម័ត ') + m[1] + '?'; }],
    [/^ghi (.+) đã dọn đi\?$/i, function (m) { return EN ? 'Mark ' + m[1] + ' as moved out?' : 'កត់ត្រា ' + m[1] + ' ថាបានចេញ?'; }],
    [/^anh\/chị không còn ở phòng (.+)$/i, function (m) { return (EN ? 'You no longer live in room ' : 'អ្នកលែងស្នាក់នៅបន្ទប់ ') + m[1]; }],
    [/^đang chờ (.+?) (tiếp nhận|xác nhận đã sửa xong|ký|duyệt gia hạn(?: đến (.+))?|duyệt|xác nhận biên bản giao phòng|xác nhận hoàn (.+)|xem lại số hoàn cọc|kiểm tra phòng, tính hoàn cọc|xác nhận đã nhận|trả lời|xem|xử lý)$/i, function (m) {
      var qm = m[1].match(/^quản lý (.+)$/i);
      var who = qm ? (EN ? 'manager ' : 'អ្នកគ្រប់គ្រង ') + qm[1] : /^chủ nhà$/i.test(m[1]) ? (EN ? 'the owner' : 'ម្ចាស់ផ្ទះ') : /^quản lý$/i.test(m[1]) ? (EN ? 'the manager' : 'អ្នកគ្រប់គ្រង') : /^khách$/i.test(m[1]) ? (EN ? 'the tenant' : 'អ្នកជួល') : m[1];
      var k = m[2].replace(/ đến .+$/, '').replace(/^xác nhận hoàn .+$/, 'xác nhận hoàn');
      var W = { 'tiếp nhận': ['to accept it', 'ទទួល'], 'xác nhận đã sửa xong': ['to confirm the repair is done', 'បញ្ជាក់ថាជួសជុលរួច'], 'ký': ['to sign', 'ចុះហត្ថលេខា'], 'duyệt gia hạn': ['to approve the renewal', 'អនុម័តការបន្ត'], 'duyệt': ['to approve', 'អនុម័ត'], 'xác nhận biên bản giao phòng': ['to confirm the handover record', 'បញ្ជាក់កំណត់ត្រាប្រគល់បន្ទប់'], 'xác nhận hoàn': ['to confirm the refund', 'បញ្ជាក់ការសងប្រាក់'], 'xem lại số hoàn cọc': ['to recheck the refund', 'ពិនិត្យការសងប្រាក់កក់ឡើងវិញ'], 'kiểm tra phòng, tính hoàn cọc': ['to check the room and work out the refund', 'ពិនិត្យបន្ទប់ និងគណនាប្រាក់កក់'], 'xác nhận đã nhận': ['to confirm receipt', 'បញ្ជាក់ថាបានទទួល'], 'trả lời': ['to reply', 'ឆ្លើយតប'], 'xem': ['to read it', 'មើល'], 'xử lý': ['to handle it', 'ដោះស្រាយ'] }[k.toLocaleLowerCase('vi')];
      var extra = m[3] ? (EN ? ' until ' : ' ដល់ ') + m[3] : m[4] ? ' ' + m[4] : '';
      return EN ? 'Waiting for ' + who + ' ' + W[0] + extra : 'រង់ចាំ ' + who + ' ' + W[1] + extra;
    }],
    [/^việc sửa (.+) thế nào$/i, function (m) { var x = one(m[1]) || m[1]; return EN ? 'How was the ' + x + ' repair' : 'ការជួសជុល ' + x + ' យ៉ាងម៉េចដែរ'; }],
    [/^sửa (.+)$/i, function (m) { return (EN ? 'Repair ' : 'ជួសជុល ') + (one(m[1]) || m[1]); }],
    [/^giao phòng (P\.\S+)$/i, function (m) { return (EN ? 'Handover ' : 'ប្រគល់បន្ទប់ ') + m[1]; }],
    [/^trả phòng, hoàn cọc (P\.\S+)$/i, function (m) { return (EN ? 'Move-out, refund ' : 'ចេញពីបន្ទប់ សងប្រាក់កក់ ') + m[1]; }],
    [/^(\d+)\/(\d+) hài lòng$/i, function (m) { return m[1] + '/' + m[2] + (EN ? ' satisfied' : ' ពេញចិត្ត'); }],
    [/^(\d+) chưa hài lòng$/i, function (m) { return m[1] + (EN ? ' not satisfied' : ' មិនទាន់ពេញចិត្ត'); }],
    [/^(\p{Lu}\S*(?: \p{Lu}\S*){0,3}) làm$/u, function (m) { return EN ? 'done by ' + m[1] : 'ធ្វើដោយ ' + m[1]; }],
    [/^lập bởi (.+)$/i, function (m) { return (EN ? 'drafted by ' : 'រៀបចំដោយ ') + m[1]; }],
    [/^(\d+) chờ anh\/chị xem$/i, function (m) { return EN ? m[1] + ' waiting for you' : m[1] + ' រង់ចាំអ្នកមើល'; }],
    [/^đã chờ (\d+) ngày$/i, function (m) { return EN ? 'waiting ' + m[1] + ' day(s)' : 'រង់ចាំ ' + m[1] + ' ថ្ងៃ'; }],
    [/^chi phí (.+)$/i, function (m) { return (EN ? 'cost ' : 'ចំណាយ ') + m[1]; }],
    [/^(\p{Lu}\S*(?: \p{Lu}\S*){0,3}) (sửa|lập)$/u, function (m) { var w = m[2] === 'sửa' ? ['fixed it', 'បានជួសជុល'] : ['drafted', 'បានរៀបចំ']; return m[1] + ' ' + w[EN ? 0 : 1]; }],
    [/^(duyệt gia hạn|gia hạn): (.+)$/i, function (m) { var d = /^duyệt/i.test(m[1]); return (EN ? (d ? 'Approve renewal: ' : 'Renewal: ') : (d ? 'អនុម័តការបន្ត៖ ' : 'ការបន្ត៖ ')) + m[2]; }],
    [/^(.+) đã trả lời$/i, function (m) { return EN ? 'replied by ' + m[1] : m[1] + ' បានឆ្លើយ'; }],
    [/^(.+) đã sửa xong$/i, function (m) { return EN ? 'repaired by ' + m[1] : m[1] + ' បានជួសជុលរួច'; }],
    [/^(.+): từ chối chi phí$/i, function (m) { return m[1] + (EN ? ': rejected the cost' : ': បដិសេធចំណាយ'); }],
    [/^Bị (.+) từ chối$/i, function (m) { return EN ? 'Rejected by ' + m[1] : 'ត្រូវបាន ' + m[1] + ' បដិសេធ'; }],
    [/^(?!(?:đã|bị|chưa|không) )(.+) từ chối$/i, function (m) { return EN ? 'rejected by ' + m[1] : m[1] + ' បានបដិសេធ'; }],
    [/^(.+) đã tiếp nhận, chưa hẹn ngày sửa$/i, function (m) { return EN ? 'accepted by ' + m[1] + ', no repair date yet' : m[1] + ' បានទទួល មិនទាន់ណាត់ថ្ងៃជួសជុល'; }],
    [/^(.+) đã tiếp nhận$/i, function (m) { return EN ? 'accepted by ' + m[1] : m[1] + ' បានទទួល'; }],
    [/^từ (\d{1,2}:\d{2}) (\d{1,2}\/\d{1,2})$/i, function (m) { return (EN ? 'since ' : 'តាំងពី ') + m[1] + ' ' + m[2]; }],
    [/^(.+): (tiếp nhận sửa|hẹn lại ngày sửa), hẹn (.+)$/i, function (m) { var a = /^hẹn/i.test(m[2]); return EN ? m[1] + ': ' + (a ? 'rescheduled' : 'accepted') + ', repair on ' + m[3] : m[1] + '៖ ' + (a ? 'ណាត់ឡើងវិញ' : 'ទទួល') + ' ណាត់ ' + m[3]; }],
    [/^(.+): báo chưa sửa xong(?: – (.+))?$/i, function (m) { return EN ? m[1] + ': not fixed yet' + (m[2] ? ' – ' + m[2] : '') : m[1] + '៖ មិនទាន់ជួសជុលរួច' + (m[2] ? ' – ' + m[2] : ''); }],
    [/^(.+) \/ lần, trên mức cần chủ nhà duyệt$/i, function (m) { return EN ? m[1] + ' per item, above that the owner approves' : m[1] + ' ក្នុងមួយដង លើសនេះម្ចាស់ផ្ទះអនុម័ត'; }],
    [/^(.+): tiếp nhận, hẹn sửa (\S+)(?: \((.+)\))?$/i, function (m) { return EN ? m[1] + ': accepted, repair on ' + m[2] + (m[3] ? ' (' + m[3] + ')' : '') : m[1] + '៖ ទទួល ណាត់ជួសជុល ' + m[2] + (m[3] ? ' (' + m[3] + ')' : ''); }],
    [/^(.+): hẹn lại ngày sửa: (\S+)(?: \((.+)\))?$/i, function (m) { return EN ? m[1] + ': rescheduled to ' + m[2] + (m[3] ? ' (' + m[3] + ')' : '') : m[1] + '៖ ណាត់ឡើងវិញ ' + m[2] + (m[3] ? ' (' + m[3] + ')' : ''); }],
    [/^quản lý tự chi tối đa (.+) mỗi lần sửa, trên mức này cần chủ nhà duyệt\.?$/i, function (m) { return EN ? 'The manager can spend up to ' + m[1] + ' per repair; above that the owner must approve.' : 'អ្នកគ្រប់គ្រងចំណាយបានរហូតដល់ ' + m[1] + ' ក្នុងមួយដង លើសនេះត្រូវឲ្យម្ចាស់ផ្ទះអនុម័ត។'; }],
    [/^(?:(.+) )?hẹn (\d+\/\d+\/\d{4})(?: · quá hẹn (\d+) ngày)?$/i, function (m) { return EN ? (m[1] ? m[1] + ': ' : '') + 'repair on ' + m[2] + (m[3] ? ' · ' + m[3] + ' days overdue' : '') : (m[1] ? m[1] + ' ' : '') + 'ណាត់ ' + m[2] + (m[3] ? ' · ហួស ' + m[3] + ' ថ្ងៃ' : ''); }],
    [/^quá hẹn (\d+) ngày$/i, function (m) { return EN ? m[1] + (m[1] === '1' ? ' day overdue' : ' days overdue') : 'ហួសណាត់ ' + m[1] + ' ថ្ងៃ'; }],
    [/^tiếp nhận, hẹn sửa (\S+)(?: \((.+)\))?$/i, function (m) { return EN ? 'accepted, repair on ' + m[1] + (m[2] ? ' (' + m[2] + ')' : '') : 'ទទួល ណាត់ជួសជុល ' + m[1] + (m[2] ? ' (' + m[2] + ')' : ''); }],
    [/^(.+) báo hư$/i, function (m) { return EN ? m[1] + ' reported it' : m[1] + ' បានរាយការណ៍'; }],
    [/^(.+): đã sửa xong$/i, function (m) { return EN ? m[1] + ': repaired' : m[1] + '៖ ជួសជុលរួច'; }],
    [/^(.+): xác nhận đã sửa xong$/i, function (m) { return EN ? m[1] + ': confirmed repaired' : m[1] + '៖ បញ្ជាក់ជួសជុលរួច'; }],
    [/^đã sửa xong, đang chờ (.+) xác nhận$/i, function (m) { return EN ? 'Repaired, waiting for ' + m[1] + ' to confirm' : 'ជួសជុលរួច រង់ចាំ ' + m[1] + ' បញ្ជាក់'; }],
    [/^(.+): (tiếp nhận sửa|hẹn lại ngày sửa|báo chưa sửa xong): (.+)$/i, function (m) { return m[1] + ': ' + (one(m[2] + ': ' + m[3]) || m[2] + ': ' + m[3]); }],
    [/^xin gia hạn hợp đồng đến (.+)$/i, function (m) { return (EN ? 'Asked to renew the contract until ' : 'សុំបន្តកិច្ចសន្យាដល់ ') + m[1]; }],
    [/^gửi (\d{1,2}:\d{2}(?: \d{1,2}\/\d{1,2})?|\d{1,2}\/\d{1,2}(?:\/\d{4})?)$/i, function (m) { return (EN ? 'sent ' : 'ផ្ញើ ') + m[1]; }],
    [/^báo trả phòng ngày (.+)$/i, function (m) { return (EN ? 'Move-out on ' : 'ចេញពីបន្ទប់ថ្ងៃ ') + m[1]; }],
    [/^người ở cùng (.+)$/i, function (m) { return (EN ? 'Roommate ' : 'អ្នករស់នៅជាមួយ ') + m[1]; }],
    [/^đã khóa sổ tháng (\d+(?:\/\d{4})?)$/i, function (m) { return (EN ? 'Books closed for ' : 'បានបិទបញ្ជីខែ ') + m[1]; }],
    [/^khóa sổ tháng (\d+)$/i, function (m) { return (EN ? 'Books closed for month ' : 'បិទបញ្ជីខែ ') + m[1]; }],
    [/^chủ nhà xác nhận chốt tháng (\d+)$/i, function (m) { return (EN ? 'Owner confirmed close for month ' : 'ម្ចាស់ផ្ទះបញ្ជាក់បិទបញ្ជីខែ ') + m[1]; }],
    [/^(.+) gửi số liệu cho chủ nhà tháng (\d+)$/i, function (m) { return m[1] + (EN ? ' sent figures to the owner for month ' : ' បានផ្ញើតួលេខឱ្យម្ចាស់ផ្ទះ ខែ ') + m[2]; }],
    [/^(.+) chuyển từ phòng (P\.\S+)$/i, function (m) { return m[1] + (EN ? ' moved from room ' : ' បានផ្លាស់ពីបន្ទប់ ') + m[2]; }],
    [/^(.+) chuyển sang phòng (P\.\S+)$/i, function (m) { return m[1] + (EN ? ' moved to room ' : ' បានផ្លាស់ទៅបន្ទប់ ') + m[2]; }],
    [/^chuyển từ phòng (P\.\S+) sang (P\.\S+)$/i, function (m) { return EN ? 'Moved from room ' + m[1] + ' to ' + m[2] : 'ផ្លាស់ពីបន្ទប់ ' + m[1] + ' ទៅ ' + m[2]; }],
    [/^điện nước khoán dư (\S+) trừ vào khoản kế tiếp$/i, function (m) { return EN ? 'Flat utilities overpaid ' + m[1] + ', deducted from the next charge' : 'ថ្លៃទឹកភ្លើងលើស ' + m[1] + ' កាត់ពីការបង់បន្ទាប់'; }],
    [/^khách (.+) đã xác nhận$/i, function (m) { return EN ? 'confirmed by tenant ' + m[1] : 'អ្នកជួល ' + m[1] + ' បានបញ្ជាក់'; }],
    [/^(✓ )?khóa sổ tháng (\d+\/\d{4})$/i, function (m) { return (m[1] || '') + (EN ? 'Books closed for ' : 'បិទបញ្ជីខែ ') + m[2]; }],
    [/^đã khóa sổ tháng (\d+\/\d{4})\. số liệu không đổi nữa; sai sót điều chỉnh vào tháng sau$/i, function (m) { return EN ? 'Books closed for ' + m[1] + '. Figures are final; corrections go into next month.' : 'បានបិទបញ្ជីខែ ' + m[1] + '។ តួលេខមិនប្ដូរទៀតទេ កំហុសនឹងកែនៅខែក្រោយ។'; }],
    [/^chủ nhà xác nhận chốt tháng (\d+\/\d{4})$/i, function (m) { return (EN ? 'Owner confirmed close for ' : 'ម្ចាស់ផ្ទះបញ្ជាក់បិទបញ្ជីខែ ') + m[1]; }],
    [/^(.+) gửi số liệu cho chủ nhà tháng (\d+\/\d{4})$/i, function (m) { return m[1] + (EN ? ' sent figures to the owner for ' : ' បានផ្ញើតួលេខឱ្យម្ចាស់ផ្ទះ ខែ ') + m[2]; }],
    [/^chủ nhà xác nhận đã nhận từ (.+) (\S*\d\S*)$/i, function (m) { return EN ? 'Owner confirmed receiving ' + m[2] + ' from ' + m[1] : 'ម្ចាស់ផ្ទះបញ្ជាក់បានទទួល ' + m[2] + ' ពី ' + m[1]; }],
    [/^(.+) xác nhận đã nhận (\S*\d\S*)$/i, function (m) { return m[1] + (EN ? ' confirmed receiving ' : ' បញ្ជាក់បានទទួល ') + m[2]; }],
    [/^(✓ )?đã gửi chủ nhà lúc (.+)$/i, function (m) { return (m[1] || '') + (EN ? 'Sent to owner at ' : 'បានផ្ញើម្ចាស់ផ្ទះនៅ ') + m[2]; }],
    [/^(✓ )?đã nhận đủ (\S*\d\S*)$/i, function (m) { return (m[1] || '') + (EN ? 'Received in full ' : 'បានទទួលគ្រប់ ') + m[2]; }],
    [/^xác nhận đã nhận tiền từ (.+)$/i, function (m) { return (EN ? 'Confirm money received from ' : 'បញ្ជាក់បានទទួលប្រាក់ពី ') + m[1]; }],
    [/^trả tiền cho (.+)$/i, function (m) { return (EN ? 'Pay ' : 'បង់ប្រាក់ឱ្យ ') + m[1]; }],
    [/^(?!(?:Còn phải|Phải|Đã|Cần) )(\p{Lu}\S*(?: \p{Lu}\S*){0,3}) nộp chủ nhà$/u, function (m) { return m[1] + (EN ? ' remits to the owner' : ' បង់ជូនម្ចាស់ផ្ទះ'); }],
    [/^trả lại khách (\S*\d\S*) cọc dư khi chuyển phòng$/i, function (m) { return EN ? 'Returned extra deposit ' + m[1] + ' on room transfer' : 'សងប្រាក់កក់លើស ' + m[1] + ' ពេលប្ដូរបន្ទប់'; }],
    [/^(.+) trả lại khách (.+)$/i, function (m) { return m[1] + (EN ? ' returns it to tenant ' : ' សងជូនអ្នកជួល ') + m[2]; }],
    [/^(P\.\S+): chuyển (\S*\d\S*) hoàn cọc cho (.+)$/i, function (m) { return m[1] + (EN ? ': send ' + m[2] + ' deposit refund to ' : '៖ ផ្ញើ ' + m[2] + ' សងប្រាក់កក់ឱ្យ ') + m[3]; }],
    [/^chủ nhà chuyển (\S*\d\S*) hoàn cọc cho (.+)$/i, function (m) { return EN ? 'Owner sent ' + m[1] + ' deposit refund to ' + m[2] : 'ម្ចាស់ផ្ទះបានផ្ញើ ' + m[1] + ' សងប្រាក់កក់ឱ្យ ' + m[2]; }],
    [/^(\S*\d\S*)\/người\/tháng(?: \(gồm điện nước khoán (\S*\d\S*)\))?$/i, function (m) { return m[1] + (EN ? '/person/month' + (m[2] ? ' (incl. flat utilities ' + m[2] + ')' : '') : '/នាក់/ខែ' + (m[2] ? ' (រួមទឹកភ្លើងថេរ ' + m[2] + ')' : '')); }],
    [/^(P\.\S+): (đăng ký khách với chính quyền|khai báo tạm trú|xoá tạm trú|báo chính quyền đã chuyển đi) cho (.+)$/i, function (m) { var k = m[2].toLowerCase(), en = { 'đăng ký khách với chính quyền': 'register with the authorities', 'khai báo tạm trú': 'declare residence', 'xoá tạm trú': 'remove residence record', 'báo chính quyền đã chuyển đi': 'tell the authorities they moved out' }[k], km = { 'đăng ký khách với chính quyền': 'ចុះឈ្មោះជាមួយអាជ្ញាធរ', 'khai báo tạm trú': 'ប្រកាសស្នាក់នៅ', 'xoá tạm trú': 'លុបការស្នាក់នៅ', 'báo chính quyền đã chuyển đi': 'ជូនដំណឹងអាជ្ញាធរថាបានចេញ' }[k]; return m[1] + ': ' + (EN ? en + ' for ' : km + ' សម្រាប់ ') + m[3]; }],
    [/^từ chối khoản khách báo · (P\.\S+)$/i, function (m) { return (EN ? 'Reject tenant-reported payment · ' : 'បដិសេធការបង់ដែលអ្នកជួលបានរាយការណ៍ · ') + m[1]; }],
    [/^cùng (.+)$/i, function (m) { return (EN ? 'With ' : 'ជាមួយ ') + m[1]; }],
    [/^từ (\d{1,2}\/\d{1,2}\/\d{4})$/i, function (m) { return (EN ? 'from ' : 'ចាប់ពី ') + m[1]; }],
    [/^số tiền (\S*\d\S*)$/i, function (m) { return (EN ? 'Amount ' : 'ចំនួន ') + m[1]; }],
    [/^(✓ )?đã nhận (\S*\d\S*)$/i, function (m) { return (m[1] || '') + (EN ? 'Received ' : 'បានទទួល ') + m[2]; }],
    [/^dư (\S*\d\S*)$/i, function (m) { return (EN ? 'over by ' : 'លើស ') + m[1]; }],
    [/^còn thiếu (\S*\d\S*)$/i, function (m) { return (EN ? 'short by ' : 'នៅខ្វះ ') + m[1]; }],
    [/^(\p{Lu}\S*(?: \p{Lu}\S*){0,3}) nộp (\S*\d\S*) \((còn phải|dư) (\S*\d\S*)\)$/u, function (m) { var over = m[3] === 'dư'; return m[1] + (EN ? ' sent ' + m[2] + (over ? ' (over by ' : ' (still owes ') : ' បានផ្ញើ ' + m[2] + (over ? ' (លើស ' : ' (នៅខ្វះ ')) + m[4] + ')'; }],
    [/^chủ nhà trả (.+?) (\S*\d\S*)(?: \((còn phải|dư) (\S*\d\S*)\))?$/i, function (m) { return (EN ? 'Owner paid ' + m[1] + ' ' + m[2] : 'ម្ចាស់ផ្ទះបានបង់ឱ្យ ' + m[1] + ' ' + m[2]) + (m[3] ? (m[3] === 'dư' ? (EN ? ' (over by ' : ' (លើស ') : (EN ? ' (still owes ' : ' (នៅខ្វះ ')) + m[4] + ')' : ''); }],
    [/^tiền cọc bổ sung khi chuyển sang (P\.\S+)$/i, function (m) { return (EN ? 'Extra deposit for moving to ' : 'ប្រាក់កក់បន្ថែមពេលប្ដូរទៅ ') + m[1]; }],
    [/^(\p{Lu}\S*(?: \p{Lu}\S*){0,3}) nộp (.+)$/u, function (m) { return m[1] + (EN ? ' sent ' : ' បានផ្ញើ ') + m[2]; }],
    // Dòng việc / lịch sử gọn (13/11): bỏ năm hiện tại → "tháng 11" cũng phải dịch được
    [/^(thu )?tiền thuê tháng (\d+(?:\/\d{4})?)( \(tháng đầu\))?$/i, function (m) { return (m[1] ? (EN ? 'Collect rent for ' : 'ប្រមូលថ្លៃជួលខែ ') : (EN ? 'Rent for ' : 'ថ្លៃជួលខែ ')) + (EN && m[2].indexOf('/') < 0 ? 'month ' : '') + m[2] + (m[3] ? (EN ? ' (first month)' : ' (ខែដំបូង)') : ''); }],
    [/^(thu )?tiền (điện|nước) khoán tháng (\d+(?:\/\d{4})?)$/i, function (m) { var e = /^đ/i.test(m[2]); return EN ? (m[1] ? 'Collect flat ' : 'Flat ') + (e ? 'electricity' : 'water') + ' for ' + (m[3].indexOf('/') < 0 ? 'month ' : '') + m[3] : (m[1] ? 'ប្រមូល' : '') + (e ? 'ថ្លៃអគ្គិសនីថេរ ខែ ' : 'ថ្លៃទឹកថេរ ខែ ') + m[3]; }],
    [/^hẹn sửa (\d+\/\d+(?:\/\d{4})?)$/i, function (m) { return (EN ? 'Repair scheduled ' : 'ណាត់ជួសជុល ') + m[1]; }],
    [/^khách báo chưa sửa xong: (.+)$/i, function (m) { return (EN ? 'Tenant says not fixed yet: ' : 'អ្នកជួលថាមិនទាន់ជួសជុលរួច៖ ') + (one(m[1]) || m[1]); }],
    [/^từ (\d{1,2}:\d{2})$/i, function (m) { return (EN ? 'since ' : 'តាំងពី ') + m[1]; }],
    [/^hoàn trả tiền cọc · (P\.\S+)$/i, function (m) { return (EN ? 'Deposit refund · ' : 'សងប្រាក់កក់ · ') + m[1]; }],
    [/^khách báo chưa xong: (.+)$/i, function (m) { return (EN ? 'tenant says not fixed: ' : 'អ្នកជួលថាមិនទាន់រួច៖ ') + m[1]; }],
    [/^khách (.+) đã nhận lại tiền cọc$/i, function (m) { return EN ? 'Tenant ' + m[1] + ' received the deposit back' : 'អ្នកជួល ' + m[1] + ' បានទទួលប្រាក់កក់វិញ'; }],
    [/^hoàn ((?:\$|-)?[\d.,]+\s*₫?)$/i, function (m) { return (EN ? 'Refund ' : 'សង ') + m[1]; }],
    [/^trừ ((?:\$|-)?[\d.,]+\s*₫?)$/i, function (m) { return (EN ? 'deducted ' : 'កាត់ ') + m[1]; }],
    [/^(.+) gửi$/i, function (m) { return EN ? 'sent by ' + m[1] : m[1] + ' បានផ្ញើ'; }],
    [/^hoàn cọc: (.+) báo chưa đúng$/i, function (m) { return EN ? 'Deposit refund: ' + m[1] + ' says it is not right' : 'សងប្រាក់កក់៖ ' + m[1] + ' ថាមិនត្រឹមត្រូវ'; }],
    [/^(.+) hoàn trả$/i, function (m) { return EN ? 'Refunded by ' + m[1] : m[1] + ' បានសង'; }],
    [/^gửi lúc (.+)$/i, function (m) { return (EN ? 'sent ' : 'ផ្ញើ ') + m[1]; }],
    [/^hoàn cọc: (.+)$/i, function (m) { return (EN ? 'Deposit refund: ' : 'សងប្រាក់កក់៖ ') + m[1]; }],
    [/^báo chưa sửa xong: (.+)$/i, function (m) { return (EN ? 'Reported not fixed yet: ' : 'បានរាយការណ៍ថាមិនទាន់ជួសជុលរួច៖ ') + (one(m[1]) || m[1]); }],
    [/^từ chối thanh toán: (.+?)(?: – (.+))?$/i, function (m) { return (EN ? 'Payment rejected: ' : 'បដិសេធការបង់៖ ') + (one(m[1]) || m[1]) + (m[2] ? ' – ' + m[2] : ''); }],
    [/^(.+) hẹn sửa (\d+\/\d+(?:\/\d{4})?) \((.+)\)$/i, function (m) { return EN ? m[1] + ' scheduled the repair for ' + m[2] + ' (' + m[3] + ')' : m[1] + ' ណាត់ជួសជុល ' + m[2] + ' (' + m[3] + ')'; }],
    [/^(.+) hẹn sửa (\d+\/\d+(?:\/\d{4})?)$/i, function (m) { return EN ? m[1] + ' scheduled the repair for ' + m[2] : m[1] + ' ណាត់ជួសជុល ' + m[2]; }],
    [/^(.+) đã sửa xong$/i, function (m) { return EN ? 'Repaired by ' + m[1] : m[1] + ' បានជួសជុលរួច'; }],
    [/^duyệt hợp đồng: (.+)$/i, function (m) { return (EN ? 'Approve contract: ' : 'អនុម័តកិច្ចសន្យា៖ ') + m[1]; }],
    [/^ghi chi phí sửa: (.+)$/i, function (m) { return (EN ? 'Record repair cost: ' : 'កត់ចំណាយជួសជុល៖ ') + m[1]; }],
    [/^duyệt chi: (.+)$/i, function (m) { return (EN ? 'Approve expense: ' : 'អនុម័តចំណាយ៖ ') + any(m[1]); }],
    [/^bạn được hưởng (.+)$/i, function (m) { return EN ? 'Your share ' + m[1] : 'ចំណែករបស់អ្នក ' + m[1]; }],
    [/^phải nộp (.+)$/i, function (m) { return EN ? 'to pay in ' + m[1] : 'ត្រូវបង់ ' + m[1]; }],
    [/^chủ nhà sẽ trả bạn (.+)$/i, function (m) { return EN ? 'the owner will pay you ' + m[1] : 'ម្ចាស់ផ្ទះនឹងបង់អ្នក ' + m[1]; }],
    [/^chốt tháng (\d+(?:\/\d{4})?): gửi số liệu cho chủ nhà$/i, function (m) { return EN ? 'Close month ' + m[1] + ': send figures to the owner' : 'បិទបញ្ជីខែ ' + m[1] + '៖ ផ្ញើតួលេខទៅម្ចាស់ផ្ទះ'; }],
    [/^(thu )?điện nước khoán tháng (\d+(?:\/\d{4})?)(?: \((điện|nước)\))?$/i, function (m) { var part = m[3] ? (m[3].toLocaleLowerCase('vi') === 'điện' ? (EN ? ' (electricity)' : ' (អគ្គិសនី)') : (EN ? ' (water)' : ' (ទឹក)')) : ''; return (m[1] ? (EN ? 'Collect flat utilities for ' : 'ប្រមូលថ្លៃទឹកភ្លើងថេរ ខែ ') : (EN ? 'Flat utilities for ' : 'ថ្លៃទឹកភ្លើងថេរ ខែ ')) + (EN && m[2].indexOf('/') < 0 ? 'month ' : '') + m[2] + part; }],
    [/^nợ quá (\d+) ngày$/i, function (m) { return EN ? 'Owed over ' + m[1] + ' days' : 'ជំពាក់លើស ' + m[1] + ' ថ្ងៃ'; }],
    [/^đã quá hạn (\d+) ngày$/i, function (m) { return EN ? m[1] + (m[1] === '1' ? ' day overdue' : ' days overdue') : 'ហួសកំណត់ ' + m[1] + ' ថ្ងៃ'; }],
    [/^hợp đồng (.+) hết hạn (\d+\/\d+(?:\/\d+)?)$/i, function (m) { return EN ? m[1] + '\'s contract ends ' + m[2] : 'កិច្ចសន្យា ' + m[1] + ' ផុតកំណត់ ' + m[2]; }],
    [/^chốt tháng (\d+(?:\/\d{4})?)$/i, function (m) { return (EN ? 'Close month ' : 'បិទបញ្ជីខែ ') + m[1]; }],
    [/^khoán (\S+)\/tháng$/i, function (m) { return EN ? 'Fixed ' + m[1] + '/month' : 'ថេរ ' + m[1] + '/ខែ'; }],
    [/^theo đồng hồ (\S+)\/(kWh|m³)$/i, function (m) { return EN ? 'Metered ' + m[1] + '/' + m[2] : 'តាមនាឡិកា ' + m[1] + '/' + m[2]; }],
    [/^(\d+) người \/ tối đa (\d+)$/i, function (m) { return EN ? m[1] + ' / max ' + m[2] : m[1] + ' នាក់ / អតិបរមា ' + m[2]; }],
    [/^(\S+)\/người\/tháng$/i, function (m) { return EN ? m[1] + '/person/month' : m[1] + '/នាក់/ខែ'; }],
    [/^điện nước khoán (\S+)$/i, function (m) { return EN ? 'fixed utilities ' + m[1] : 'ទឹកភ្លើងថេរ ' + m[1]; }],
    [/^(.+) lập (\d{2}\/\d{2})$/i, function (m) { return EN ? 'Made by ' + m[1] + ' ' + m[2] : m[1] + ' បានធ្វើ ' + m[2]; }],
    [/^(\d{2}\/\d{2}\/\d{4} – \d{2}\/\d{2}\/\d{4}) \((?:(\d+) năm)? ?(?:(\d+) tháng)?\)$/i, function (m) { var y = +m[2] || 0, mo = +m[3] || 0, t = EN ? [y ? y + (y > 1 ? ' years' : ' year') : '', mo ? mo + (mo > 1 ? ' months' : ' month') : ''] : [y ? y + ' ឆ្នាំ' : '', mo ? mo + ' ខែ' : '']; return m[1] + ' (' + t.filter(Boolean).join(' ') + ')'; }],
    [/^phòng: (.+)$/i, function (m) { return (EN ? 'Room: ' : 'បន្ទប់៖ ') + m[1].replace(/(\d+) người/g, EN ? '$1 people' : '$1 នាក់').replace(/Phòng ở/g, EN ? 'Living room' : 'បន្ទប់ស្នាក់នៅ'); }],
    [/^niêm yết (\S+) · (thấp|cao) hơn (\S+)$/i, function (m) { var lo = /^th/i.test(m[2]); return EN ? 'Listed ' + m[1] + ' · ' + m[3] + (lo ? ' lower' : ' higher') : 'តម្លៃប្រកាស ' + m[1] + ' · ' + (lo ? 'ទាបជាង ' : 'ខ្ពស់ជាង ') + m[3]; }],
    [/^niêm yết (\S+)$/i, function (m) { return EN ? 'listed ' + m[1] : 'តម្លៃប្រកាស ' + m[1]; }],
    [/^(thấp|cao) hơn niêm yết (.+)$/i, function (m) { var lo = /^th/i.test(m[1]); return EN ? (lo ? 'Below' : 'Above') + ' listed price by ' + m[2] : (lo ? 'ទាបជាង' : 'ខ្ពស់ជាង') + 'តម្លៃប្រកាស ' + m[2]; }],
    [/^hợp đồng (\S+\/tháng), niêm yết (\S+?)\.?$/i, function (m) { return EN ? 'Contract ' + m[1].replace('/tháng', '/month') + ', listed ' + m[2] + '.' : 'កិច្ចសន្យា ' + m[1].replace('/tháng', '/ខែ') + ' តម្លៃប្រកាស ' + m[2] + '។'; }],
    [/^giá (\S+) ([<>]) niêm yết (\S+)$/i, function (m) { return EN ? 'rent ' + m[1] + ' ' + m[2] + ' listed ' + m[3] : 'ថ្លៃជួល ' + m[1] + ' ' + m[2] + ' តម្លៃប្រកាស ' + m[3]; }],
    [/^đã từ chối hợp đồng (P\.\S+?)\.?$/i, function (m) { return EN ? 'Contract ' + m[1] + ' rejected.' : 'បានបដិសេធកិច្ចសន្យា ' + m[1] + '។'; }],
    [/^đã báo (.+) sửa\.?$/i, function (m) { return EN ? m[1] + ' has been told to fix it.' : 'បានប្រាប់ ' + m[1] + ' ឱ្យកែ។'; }],
    [/^ảnh (\d+)$/i, function (m) { return EN ? 'Photo ' + m[1] : 'រូបថត ' + m[1]; }],
    [/^đã duyệt hợp đồng (P\.\S+?)\.?$/i, function (m) { return EN ? 'Contract ' + m[1] + ' approved.' : 'បានអនុម័តកិច្ចសន្យា ' + m[1] + '។'; }],
    [/^đã gửi (.+) ký\.?$/i, function (m) { return EN ? 'Sent to ' + m[1] + ' to sign.' : 'បានផ្ញើទៅ ' + m[1] + ' ដើម្បីចុះហត្ថលេខា។'; }],
    [/^đã chuyển (.+) từ (P\.\S+) sang (P\.\S+?)\.?$/i, function (m) { return EN ? 'Moved ' + m[1] + ' from ' + m[2] + ' to ' + m[3] + '.' : 'បានផ្លាស់ ' + m[1] + ' ពី ' + m[2] + ' ទៅ ' + m[3] + '។'; }],
    [/^đã gửi thông báo tới (\d+) phòng\.?$/i, function (m) { return EN ? 'Notice sent to ' + m[1] + ' room(s).' : 'បានផ្ញើការជូនដំណឹងទៅ ' + m[1] + ' បន្ទប់។'; }],
    [/^(\d+)\/(\d+) người đã xem$/i, function (m) { return EN ? m[1] + '/' + m[2] + ' have read it' : m[1] + '/' + m[2] + ' នាក់បានមើល'; }],
    [/^còn (\d+)%$/i, function (m) { return EN ? m[1] + '% left' : 'នៅសល់ ' + m[1] + '%'; }],
    [/^(\d+) món cần chú ý \(hư, thiếu hoặc còn dưới 30%\)$/i, function (m) { return EN ? m[1] + ' item(s) need attention (broken, missing or under 30% left)' : m[1] + ' មុខត្រូវយកចិត្តទុកដាក់ (ខូច បាត់ ឬនៅសល់តិចជាង 30%)'; }],
    [/^tháng (\d+)$/i, function (m) { return (EN ? 'Month ' : 'ខែ ') + m[1]; }],
    [/^[ởỞ] cùng (\p{Lu}.*)$/u, function (m) { return (EN ? 'Living with ' : 'រស់នៅជាមួយ ') + m[1]; }],
    [/^phòng tối đa (\d+) người, đã đủ$/i, function (m) { return EN ? 'The room allows ' + m[1] + ' people and is full' : 'បន្ទប់អនុញ្ញាត ' + m[1] + ' នាក់ ពេញហើយ'; }],
    [/^xin cho ở (\d+) người \(tối đa (\d+)\)$/i, function (m) { return EN ? 'Request for ' + m[1] + ' people (max ' + m[2] + ')' : 'សុំស្នាក់នៅ ' + m[1] + ' នាក់ (អតិបរមា ' + m[2] + ')'; }],
    [/^phòng tối đa (\d+) người$/i, function (m) { return EN ? 'The room allows ' + m[1] + ' people' : 'បន្ទប់អនុញ្ញាត ' + m[1] + ' នាក់'; }],
    [/^đồng ý thì số người tối đa của phòng tăng lên (\d+)$/i, function (m) { return EN ? 'If you agree, the room maximum becomes ' + m[1] : 'បើយល់ព្រម ចំនួនអតិបរមារបស់បន្ទប់នឹងកើនដល់ ' + m[1]; }],
    [/^(\d+) người đang chờ duyệt$/i, function (m) { return EN ? m[1] + ' waiting for approval' : m[1] + ' នាក់កំពុងរង់ចាំអនុម័ត'; }],
    [/^không đồng ý cho (.+) ở thêm\??$/i, function (m) { return EN ? 'Decline the extra stay for ' + m[1] + '?' : 'មិនយល់ព្រមឱ្យ ' + m[1] + ' ស្នាក់នៅបន្ថែម?'; }],
    [/^(lưu|đồng ý) thì phòng ở (\d+) người, số người tối đa vẫn là (\d+)$/i, function (m) { var sv = /^l/i.test(m[1]); return EN ? (sv ? 'Saving' : 'Agreeing') + ' lets ' + m[2] + ' people live here; the room maximum stays ' + m[3] : (sv ? 'រក្សាទុក' : 'យល់ព្រម') + ' បន្ទប់នឹងមាន ' + m[2] + ' នាក់ ចំនួនអតិបរមានៅតែ ' + m[3]; }],
    [/^ở (\d+) người$/i, function (m) { return EN ? m[1] + ' people living here' : 'ស្នាក់នៅ ' + m[1] + ' នាក់'; }],
    [/^số người tối đa vẫn (\d+)$/i, function (m) { return EN ? 'room maximum stays ' + m[1] : 'ចំនួនអតិបរមានៅតែ ' + m[1]; }],
    [/^chủ nhà (đồng ý )?cho ở thêm khi phòng đủ \(tối đa (\d+)\): (.+)$/i, function (m) { return EN ? 'Landlord allowed an extra person in a full room (max ' + m[2] + '): ' + m[3] : 'ម្ចាស់ផ្ទះអនុញ្ញាតមនុស្សបន្ថែមពេលបន្ទប់ពេញ (អតិបរមា ' + m[2] + '): ' + m[3]; }],
    [/^quản lý đồng ý, gửi chủ nhà cho ở thêm: (.+)$/i, function (m) { return EN ? 'Manager agreed, sent to the landlord: ' + m[1] : 'អ្នកគ្រប់គ្រងយល់ព្រម ផ្ញើទៅម្ចាស់ផ្ទះ: ' + m[1]; }],
    [/^khách chính (.+) đồng ý, quản lý xem rồi chủ nhà đồng ý cho ở thêm\.?$/i, function (m) { return EN ? 'Main tenant ' + m[1] + ' agrees, then the manager reviews and the landlord approves the extra person.' : 'អ្នកជួលចម្បង ' + m[1] + ' យល់ព្រម បន្ទាប់មកអ្នកគ្រប់គ្រងពិនិត្យ ហើយម្ចាស់ផ្ទះយល់ព្រម។'; }],
    [/^(\p{Lu}\S*(?: \p{Lu}\S*){0,3}) mời (\d{1,2}\/\d{1,2}\/\d{4})$/u, function (m) { return EN ? m[1] + ' invited ' + m[2] : m[1] + ' បានអញ្ជើញ ' + m[2]; }],
    [/^(.+) đề nghị thêm người$/i, function (m) { return EN ? m[1] + ' proposes adding a person' : m[1] + ' ស្នើបន្ថែមមនុស្ស'; }],
    [/^chủ nhà không đồng ý: (.+)$/i, function (m) { return EN ? 'Landlord declined: ' + m[1] : 'ម្ចាស់ផ្ទះមិនយល់ព្រម: ' + m[1]; }],
    [/^xin cho ở thêm khi phòng đủ \(tối đa (\d+)\)$/i, function (m) { return EN ? 'Extra person for a full room (max ' + m[1] + ')' : 'សុំបន្ថែមមនុស្សពេលបន្ទប់ពេញ (អតិបរមា ' + m[1] + ')'; }],
    [/^cho ở (\d+) người\??$/i, function (m) { return EN ? 'Allow ' + m[1] + ' people' : 'អនុញ្ញាត ' + m[1] + ' នាក់'; }],
    [/^(\d+) người$/i, function (m) { return EN ? m[1] + (m[1] === '1' ? ' person' : ' people') : m[1] + ' នាក់'; }],
    [/^đã dọn đi \((\d+)\) ›$/i, function (m) { return EN ? 'Moved out (' + m[1] + ') ›' : 'បានចាកចេញ (' + m[1] + ') ›'; }],
    [/^thu thêm (.+) \/ người \/ tháng, tháng đầu tính theo số ngày ở$/i, function (m) { return EN ? 'Extra ' + m[1] + ' / person / month, the first month by days stayed' : 'បង់បន្ថែម ' + m[1] + ' / នាក់ / ខែ ខែដំបូងគិតតាមចំនួនថ្ងៃស្នាក់នៅ'; }],
    [/^ghi (.+) đã dọn đi\?$/i, function (m) { return EN ? 'Record ' + m[1] + ' as moved out?' : 'កត់ថា ' + m[1] + ' បានចាកចេញ?'; }],
    [/^(\p{Lu}\S*(?: \p{Lu}\S*){0,3}) xác nhận$/u, function (m) { return EN ? 'confirmed by ' + m[1] : m[1] + ' បានបញ្ជាក់'; }],
    // Tester 22/11: chữ còn sót khi chuyển phòng, chia ngày điện nước, hồ sơ quản lý, form vi phạm / mất đồ / chi
    // Dòng lịch sử chép từ phòng cũ có " (P.xxx)" ở cuối: dịch phần trước rồi giữ tên phòng (tester 21/11)
    [/^(.+) \((P\.[^)\s]+)\)$/, function (m) { var t = one(m[1]); return t ? t + ' (' + m[2] + ')' : null; }]
  ];
  var NAME_HEADS = { 'khách': 1 };
  function daysText(t) { return String(t).replace(/phòng (\d\S*)/g, 'P.$1').replace(/(\d+) ngày/g, EN ? '$1 days' : '$1 ថ្ងៃ'); }
  var VI = /[ăâđêôơưàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ]/i;
  // Tên khoản lồng trong câu: thử dịch cả cụm, cả khi viết thường ("tiền thuê tháng 11/2026")
  function any(text) {
    var t = String(text || ''), cap = t.charAt(0).toLocaleUpperCase('vi') + t.slice(1);
    return one(t) || exact.get(t) || dict.get(t.toLocaleLowerCase('vi')) || one(cap) || labelled(t) || t;
  }
  function one(text) {
    if (exact.has(text)) return exact.get(text);
    var key = text.toLocaleLowerCase('vi');
    if (dict.has(key)) {
      var hit = dict.get(key);
      return EN && text.length > 2 && text === text.toLocaleUpperCase('vi') ? hit.toUpperCase() : hit;
    }
    for (var i = 0; i < RULES.length; i++) { var m = text.match(RULES[i][0]); if (m) { var out = RULES[i][1](m); if (out != null) return out; } }
    // Cụm đã biết đứng đầu, phần sau là tên hoặc mã: "Quản lý Lộc", "Chào Lan"
    var words = text.split(' ');
    for (var n = Math.min(words.length - 1, 6); n >= 1; n--) {
      var head = words.slice(0, n).join(' '), rest = words.slice(n);
      if (n === 1 && NAME_HEADS[head.toLocaleLowerCase('vi')] && words.length <= 3) return null; // "Khách Thử" là tên người, không dịch
      var known = exact.get(head) || dict.get(head.toLocaleLowerCase('vi'));
      if (known && rest.length <= 3 && /^[\p{Lu}\d$+]/u.test(rest[0])) return known + ' ' + rest.join(' ');
    }
    return null;
  }
  // Dòng lịch sử "Duyệt chi phí: Sửa máy bơm", "Đổi quản lý phụ trách: A → B": dịch phần nhãn, giữ tên người dùng gõ
  function labelled(part) {
    var bits = part.split(/(: | – | → )/), changed = false;
    if (bits.length < 2) return null;
    var out = bits.map(function (bit, i) { if (i % 2) return bit; var t = one(bit); if (t) changed = true; return t || bit; });
    return changed ? out.join('') : null;
  }
  function translate(raw) {
    // "AMETAA ghi": chữ "ghi" không dấu nhưng là tiếng Việt
    if (!raw || (!VI.test(raw) && !/(^|\s)ghi( ·|$)/.test(raw) && !/(^|· )QL \S/.test(raw))) return null;
    // Cả câu (giữ dấu chấm, dấu hỏi) có trong từ điển thì dùng luôn
    var whole = raw.trim(), hitWhole = exact.get(whole) || dict.get(whole.toLocaleLowerCase('vi'));
    if (hitWhole) return raw.slice(0, raw.indexOf(whole)) + hitWhole + raw.slice(raw.indexOf(whole) + whole.length);
    var lead = raw.match(/^[\s＋+⌂⚙◷▦›‹·　]*/)[0], tail = raw.match(/[\s:.?!›·　]*$/)[0];
    var core = raw.slice(lead.length, raw.length - tail.length);
    if (!core) return null;
    var hitCore = exact.get(core) || dict.get(core.toLocaleLowerCase('vi'));
    if (hitCore) return lead + hitCore + tail;
    var parts = core.split(/( · |\. )/), changed = false;
    var out = parts.map(function (part, i) { if (i % 2) return part; var t = one(part) || labelled(part); if (t) changed = true; return t || part; });
    return changed ? lead + out.join('') + tail : null;
  }
  var original = new WeakMap(), ATTRS = ['placeholder', 'title', 'aria-label'];
  function skip(node) {
    var el = node.nodeType === 1 ? node : node.parentElement;
    return !el || el.closest('#loginScreen,.legal-sheet,script,style,textarea,select.account-select,.account-panel,[translate=no]');
  }
  function fixText(node) {
    if (skip(node)) return;
    var saved = original.get(node), now = node.data;
    if (saved && saved.shown === now) return;
    var result = translate(now), parent = node.parentElement;
    // Chữ không dấu ("Thu", "Chi") trên nút lọc: chỉ dịch khi khớp đúng từ điển
    if (!result && parent && parent.matches('button, .pill, .st-head > span, .rp-head > span, .rd-asset-meta u') && !VI.test(now)) {
      var hit = exact.get(now.trim());
      if (hit) result = now.replace(now.trim(), hit);
    }
    // "Sửa" trên nút là sửa cài đặt (Edit), không phải phòng đang sửa chữa (Repair)
    if (parent && parent.hasAttribute('data-expense-limit') && now.trim() === 'Sửa') result = EN ? 'Edit' : 'កែ';
    if (!result) return;
    // Ô chọn không ghi value thì value lấy theo chữ hiện ra: giữ value là chữ gốc để dữ liệu luôn lưu tiếng Việt
    var opt = node.parentElement;
    if (opt && opt.tagName === 'OPTION' && !opt.hasAttribute('value')) opt.setAttribute('value', now.trim());
    original.set(node, { vi: now, shown: result }); busy = true; node.data = result;
  }
  function fixAttrs(el) {
    // Ô nhập nhiều dòng: không dịch chữ người dùng gõ, nhưng vẫn dịch chữ gợi ý
    if (el.tagName === 'TEXTAREA' ? skip(el.parentElement || el) : skip(el)) return;
    ATTRS.forEach(function (a) { if (el.hasAttribute(a)) { var r = translate(el.getAttribute(a)); if (r) el.setAttribute(a, r); } });
  }
  function walk(root) {
    if (root.nodeType === 3) return fixText(root);
    if (root.nodeType !== 1) return;
    fixAttrs(root);
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT), n;
    while ((n = w.nextNode())) { if (n.nodeType === 3) fixText(n); else fixAttrs(n); }
  }
  var busy = false;
  function viText(el) {
    var out = '', w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT), n;
    while ((n = w.nextNode())) { var s = original.get(n); out += s && s.shown === n.data ? s.vi : n.data; }
    return out;
  }
  // Mã nghiệp vụ đọc lại chữ gốc tiếng Việt
  ['textContent', 'innerText'].forEach(function (prop) {
    var owner = prop === 'textContent' ? Node.prototype : HTMLElement.prototype;
    var d = Object.getOwnPropertyDescriptor(owner, prop);
    Object.defineProperty(owner, prop, {
      configurable: true, set: d.set,
      get: function () {
        if (this.nodeType === 3) { var s = original.get(this); return s && s.shown === this.data ? s.vi : d.get.call(this); }
        if (this.nodeType === 1 && this.querySelector && !this.closest('#loginScreen')) return viText(this);
        return d.get.call(this);
      }
    });
  });
  function start() {
    walk(document.body);
    var dbgN = 0, dbgT = Date.now(), watchBody = function () { dbgN = 0; mo.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS }); }, mo = new MutationObserver(function (list) {
      if (Date.now() - dbgT > 1000) { dbgT = Date.now(); dbgN = 0; }
      // Lưới an toàn: code nào đó vẽ lại mãi vì so chữ đã dịch với chữ gốc → tạm nghỉ dịch 1 giây, không để app treo
      if ((dbgN += list.length) > 3000) { console.warn('i18n: vẽ lại liên tục', list[0] && list[0].target); mo.disconnect(); setTimeout(function () { walk(document.body); watchBody(); }, 1000); return; }
      list.forEach(function (m) {
        if (m.type === 'characterData') return fixText(m.target);
        if (m.type === 'attributes') return fixAttrs(m.target);
        m.addedNodes.forEach(walk);
      });
    });
    watchBody();
  }
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
})();
