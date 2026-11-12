// Dịch giao diện sang English / ខ្មែរ khi người dùng chọn. Tiếng Việt không qua lớp này.
// Code nghiệp vụ đọc chữ trên giao diện để làm việc (ví dụ tìm nút theo chữ), nên textContent / innerText
// luôn trả lại chữ tiếng Việt gốc; chỉ phần hiển thị được dịch.
(function () {
  var lang = 'vi';
  try { lang = localStorage.getItem('homeLang') || (navigator.language || 'vi').slice(0, 2); } catch (e) {}
  // Đổi ngôn ngữ trong app: mở lại để toàn bộ chữ theo ngôn ngữ mới
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-lang]');
    if (b && !b.closest('#loginScreen')) setTimeout(function () { location.reload(); }, 100);
  });
  if (lang !== 'en' && lang !== 'km') return;
  document.documentElement.lang = lang;
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
    [/^(thứ \S+|chủ nhật), (\d+) tháng (\d+)$/i, function (m) { var d = WEEK[m[1].toLocaleLowerCase('vi')]; return (d ? d[EN ? 0 : 1] : m[1]) + ', ' + m[2] + '/' + m[3]; }],
    [/^tháng (\d+)\/(\d{4})$/i, function (m) { return (EN ? 'Month ' : 'ខែ ') + m[1] + '/' + m[2]; }],
    [/^hạn (\d+\/\d+(?:\/\d+)?)$/i, function (m) { return (EN ? 'Due ' : 'កំណត់ ') + m[1]; }],
    [/^(quá hạn|hạn) (\d+\/\d+) · còn (.+)$/i, function (m) { var late = /^quá/i.test(m[1]); return (EN ? (late ? 'Overdue ' : 'Due ') + m[2] + ' · ' + m[3] + ' left' : (late ? 'ហួសកំណត់ ' : 'កំណត់ ') + m[2] + ' · នៅសល់ ' + m[3]); }],
    [/^quá hạn (\d+) ngày$/i, function (m) { return EN ? m[1] + ' days overdue' : 'ហួសកំណត់ ' + m[1] + ' ថ្ងៃ'; }],
    [/^(\d+) (ngày|món|khoản|căn|phòng|người|hoạt động|việc|lần|đêm|tháng)$/i, function (m) {
      var word = { 'ngày': ['days', 'ថ្ងៃ'], 'món': ['items', 'មុខ'], 'khoản': ['items', 'ខ្ទង់'], 'căn': ['houses', 'ផ្ទះ'], 'phòng': ['rooms', 'បន្ទប់'], 'người': ['people', 'នាក់'], 'hoạt động': ['activities', 'សកម្មភាព'], 'việc': ['tasks', 'កិច្ចការ'], 'lần': ['times', 'ដង'], 'đêm': ['nights', 'យប់'], 'tháng': ['months', 'ខែ'] }[m[2].toLocaleLowerCase('vi')];
      return m[1] + ' ' + word[EN ? 0 : 1];
    }],
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
    [/^thêm người ở cùng · (.+)$/i, function (m) { return (EN ? 'Add roommate · ' : 'បន្ថែមអ្នករស់នៅជាមួយ · ') + m[1]; }],
    [/^(.+) \(anh\/chị\)$/i, function (m) { return m[1] + (EN ? ' (you)' : ' (អ្នក)'); }],
    [/^ở từ (.+)$/i, function (m) { return (EN ? 'since ' : 'ចាប់ពី ') + m[1]; }],
    [/^mời (\d+\/\d+\/\d{4})$/i, function (m) { return (EN ? 'invited ' : 'អញ្ជើញ ') + m[1]; }],
    [/^khách chính (.+?)( thêm hoặc bỏ người ở cùng)?$/i, function (m) { return m[2] ? (EN ? 'Main tenant ' + m[1] + ' adds or removes roommates' : 'អ្នកជួលចម្បង ' + m[1] + ' បន្ថែម ឬដកអ្នករស់នៅជាមួយ') : (EN ? 'main tenant ' : 'អ្នកជួលចម្បង ') + m[1]; }],
    [/^đang ở (\d+) người( \/ tối đa (\d+))?(, phòng đã đủ người)?$/i, function (m) { return (EN ? m[1] + ' living here' + (m[2] ? ' / max ' + m[3] : '') + (m[4] ? ', the room is full' : '') : 'កំពុងស្នាក់នៅ ' + m[1] + ' នាក់' + (m[2] ? ' / អតិបរមា ' + m[3] : '') + (m[4] ? ', បន្ទប់ពេញហើយ' : '')); }],
    [/^(\d+) → (\d+) người( \/ tối đa (\d+))?$/i, function (m) { return m[1] + ' → ' + m[2] + (EN ? ' people' + (m[3] ? ' / max ' + m[4] : '') : ' នាក់' + (m[3] ? ' / អតិបរមា ' + m[4] : '')); }],
    [/^phòng chỉ cho tối đa (\d+) người, không được ở vượt\.?$/i, function (m) { return EN ? 'This room allows at most ' + m[1] + ' people.' : 'បន្ទប់នេះអនុញ្ញាតអតិបរមា ' + m[1] + ' នាក់។'; }],
    [/^từ kỳ sau thu thêm (.+) \/ người \/ tháng\.?$/i, function (m) { return EN ? 'From next period: extra ' + m[1] + ' / person / month.' : 'ពីគ្រាក្រោយ បង់បន្ថែម ' + m[1] + ' / នាក់ / ខែ។'; }],
    [/^thôi thu từ kỳ (.+)$/i, function (m) { return (EN ? 'Stops from period ' : 'ឈប់គិតពីគ្រា ') + m[1]; }],
    [/^nay (\d+) người$/i, function (m) { return EN ? 'Now ' + m[1] + ' people' : 'ឥឡូវ ' + m[1] + ' នាក់'; }],
    [/^(\p{Lu}\S*(?: \p{Lu}\S*){0,3}) (mời|gửi|duyệt|ghi)$/u, function (m) { var w = { 'mời': ['invited', 'បានអញ្ជើញ'], 'gửi': ['sent', 'បានផ្ញើ'], 'duyệt': ['approved', 'បានអនុម័ត'], 'ghi': ['recorded', 'បានកត់ត្រា'] }[m[2].toLocaleLowerCase('vi')]; return m[1] + ' ' + w[EN ? 0 : 1]; }],
    [/^mật khẩu cho (.+)$/i, function (m) { return (EN ? 'Password for ' : 'ពាក្យសម្ងាត់សម្រាប់ ') + m[1]; }],
    [/^(.+) đăng nhập bằng số (.+?)\.?$/i, function (m) { return EN ? m[1] + ' signs in with ' + m[2] + '.' : m[1] + ' ចូលដោយលេខ ' + m[2] + '។'; }],
    [/^báo cho (.+) đăng nhập bằng số$/i, function (m) { return EN ? 'Tell ' + m[1] + ' to sign in with' : 'ប្រាប់ ' + m[1] + ' ឱ្យចូលដោយលេខ'; }],
    [/^không duyệt (.+)\?$/i, function (m) { return (EN ? 'Decline ' : 'មិនអនុម័ត ') + m[1] + '?'; }],
    [/^ghi (.+) đã dọn đi\?$/i, function (m) { return EN ? 'Mark ' + m[1] + ' as moved out?' : 'កត់ត្រា ' + m[1] + ' ថាបានចេញ?'; }],
    [/^anh\/chị không còn ở phòng (.+)$/i, function (m) { return (EN ? 'You no longer live in room ' : 'អ្នកលែងស្នាក់នៅបន្ទប់ ') + m[1]; }],
    [/^đang chờ (.+?) (tiếp nhận|xác nhận đã sửa xong|ký|duyệt gia hạn(?: đến (.+))?|duyệt|xác nhận biên bản giao phòng|xác nhận hoàn (.+)|xem lại số hoàn cọc|kiểm tra phòng, tính hoàn cọc|xác nhận đã nhận)$/i, function (m) {
      var who = /^chủ nhà$/i.test(m[1]) ? (EN ? 'the owner' : 'ម្ចាស់ផ្ទះ') : /^quản lý$/i.test(m[1]) ? (EN ? 'the manager' : 'អ្នកគ្រប់គ្រង') : /^khách$/i.test(m[1]) ? (EN ? 'the tenant' : 'អ្នកជួល') : m[1];
      var k = m[2].replace(/ đến .+$/, '').replace(/^xác nhận hoàn .+$/, 'xác nhận hoàn');
      var W = { 'tiếp nhận': ['to accept it', 'ទទួល'], 'xác nhận đã sửa xong': ['to confirm the repair is done', 'បញ្ជាក់ថាជួសជុលរួច'], 'ký': ['to sign', 'ចុះហត្ថលេខា'], 'duyệt gia hạn': ['to approve the renewal', 'អនុម័តការបន្ត'], 'duyệt': ['to approve', 'អនុម័ត'], 'xác nhận biên bản giao phòng': ['to confirm the handover record', 'បញ្ជាក់កំណត់ត្រាប្រគល់បន្ទប់'], 'xác nhận hoàn': ['to confirm the refund', 'បញ្ជាក់ការសងប្រាក់'], 'xem lại số hoàn cọc': ['to recheck the refund', 'ពិនិត្យការសងប្រាក់កក់ឡើងវិញ'], 'kiểm tra phòng, tính hoàn cọc': ['to check the room and work out the refund', 'ពិនិត្យបន្ទប់ និងគណនាប្រាក់កក់'], 'xác nhận đã nhận': ['to confirm receipt', 'បញ្ជាក់ថាបានទទួល'] }[k.toLocaleLowerCase('vi')];
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
    [/^đã chờ (\d+) ngày$/i, function (m) { return EN ? 'waiting ' + m[1] + ' day(s)' : 'រង់ចាំ ' + m[1] + ' ថ្ងៃ'; }],
    [/^chi phí (.+)$/i, function (m) { return (EN ? 'cost ' : 'ចំណាយ ') + m[1]; }],
    [/^(\p{Lu}\S*(?: \p{Lu}\S*){0,3}) (sửa|lập)$/u, function (m) { var w = m[2] === 'sửa' ? ['fixed it', 'បានជួសជុល'] : ['drafted', 'បានរៀបចំ']; return m[1] + ' ' + w[EN ? 0 : 1]; }],
    [/^báo trả phòng ngày (.+)$/i, function (m) { return (EN ? 'Move-out on ' : 'ចេញពីបន្ទប់ថ្ងៃ ') + m[1]; }],
    [/^người ở cùng (.+)$/i, function (m) { return (EN ? 'Roommate ' : 'អ្នករស់នៅជាមួយ ') + m[1]; }],
    [/^(\p{Lu}\S*(?: \p{Lu}\S*){0,3}) nộp (.+)$/u, function (m) { return m[1] + (EN ? ' sent ' : ' បានផ្ញើ ') + m[2]; }],
    [/^tiền thuê tháng (\d+\/\d{4})( \(tháng đầu\))?$/i, function (m) { return (EN ? 'Rent for ' : 'ថ្លៃជួលខែ ') + m[1] + (m[2] ? (EN ? ' (first month)' : ' (ខែដំបូង)') : ''); }]
  ];
  var NAME_HEADS = { 'khách': 1 };
  var VI = /[ăâđêôơưàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ]/i;
  function one(text) {
    if (exact.has(text)) return exact.get(text);
    var key = text.toLocaleLowerCase('vi');
    if (dict.has(key)) {
      var hit = dict.get(key);
      return EN && text.length > 2 && text === text.toLocaleUpperCase('vi') ? hit.toUpperCase() : hit;
    }
    for (var i = 0; i < RULES.length; i++) { var m = text.match(RULES[i][0]); if (m) return RULES[i][1](m); }
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
    if (!raw || !VI.test(raw)) return null;
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
    var result = translate(now);
    if (!result) return;
    // Ô chọn không ghi value thì value lấy theo chữ hiện ra: giữ value là chữ gốc để dữ liệu luôn lưu tiếng Việt
    var opt = node.parentElement;
    if (opt && opt.tagName === 'OPTION' && !opt.hasAttribute('value')) opt.setAttribute('value', now.trim());
    original.set(node, { vi: now, shown: result }); busy = true; node.data = result;
  }
  function fixAttrs(el) {
    if (skip(el)) return;
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
