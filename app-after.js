// Chạy sau code demo: ghi nhớ trạng thái đăng nhập của app thật.
(function () {
  var signIn = window.signInAs, signOutFn = window.signOut;
  if (typeof signIn === 'function') {
    window.signInAs = function () {
      try { localStorage.setItem('homeAppSignedIn', '1'); } catch (e) {}
      return signIn.apply(this, arguments);
    };
  }
  if (typeof signOutFn === 'function') {
    window.signOut = function () {
      try { localStorage.removeItem('homeAppSignedIn'); } catch (e) {}
      return signOutFn.apply(this, arguments);
    };
  }
})();
// Khi trang đăng nhập đang mở: khoá mọi phần khác của app (kể cả bảng bật lên mở sau đó), trừ cửa sổ chính sách / điều khoản.
(function () {
  var phone = document.querySelector('.phone');
  if (!phone) return;
  function lock() {
    var login = document.getElementById('loginScreen');
    Array.prototype.forEach.call(phone.children, function (el) {
      if (el.id === 'loginScreen' || el.querySelector('.legal-sheet')) return;
      if (login) el.setAttribute('inert', ''); else el.removeAttribute('inert');
    });
  }
  new MutationObserver(lock).observe(phone, { childList: true });
  lock();
})();
// Đăng nhập thật qua Supabase. App thật không còn tài khoản mẫu.
// Không hỏi mã vùng: gõ số là đủ, sai thì app tự thử mã vùng còn lại
if (typeof loginCountry === 'function') window.loginCountry = function () { return '84'; };
(function () {
  document.addEventListener('submit', function (event) {
    var form = event.target;
    if (!form || !form.closest || !form.closest('#loginScreen')) return;
    event.preventDefault(); event.stopImmediatePropagation(); // app thật chỉ đăng nhập qua máy chủ
    var box = form.closest('#loginScreen'), btn = box.querySelector('.login-submit');
    var phone = box.querySelector('#loginPhone').value, password = box.querySelector('#loginPassword').value;
    var region = loginCountry(), digits = phone.replace(/\D/g, '');
    var show = function (error) { renderLoginScreen({ phone: phone, cc: region, error: error }); };
    if (!digits || !password) return show('empty');
    // Gõ cả mã vùng mà không có dấu +: 84900111222 cũng là +84, 855976996789 cũng là +855
    var withCc = ['84', '855'].some(function (cc) { return digits.indexOf(cc) === 0 && digits.length >= 11; });
    if (withCc && phone.trim().charAt(0) !== '0') phone = '+' + digits;
    var key = phoneKey(phone, region);
    if (!key || key.length < 9 || key.length > 15) return show('badPhone');
    if (!window.HOME_DB) return show('network');
    var wait = loginLockMinutes(key);
    if (wait) return renderLoginScreen({ phone: phone, cc: loginCountry(), error: 'tooMany', minutes: wait });
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="login-spin" aria-label="…"></span>'; }
    // Số Việt Nam ở căn Campuchia có thể được lưu +855 và ngược lại: sai thì thử mã vùng còn lại
    var other = phoneKey(phone, region === '84' ? '855' : '84');
    window.HOME_DB.signIn(key, password).then(function (res) {
      if (res.error && res.error.status === 400 && other !== key && phone.trim().charAt(0) !== '+') return window.HOME_DB.signIn(other, password);
      return res;
    }).then(function (res) {
      if (res.error || !res.me || res.me.trang_thai !== 'hoat_dong') {
        var cc = loginCountry();
        if (res.me) { window.HOME_DB.signOut(); return renderLoginScreen({ phone: phone, cc: cc, error: res.me.trang_thai === 'tam_khoa' ? 'locked' : 'deleted' }); }
        // Sai mật khẩu thì máy chủ trả mã 400; còn lại là lỗi mạng, không tính vào số lần sai
        if (res.error && res.error.status !== 400) {
          return show('network');
        }
        var locked = noteLoginFail(key);
        return renderLoginScreen({ phone: phone, cc: cc, error: locked ? 'tooMany' : 'wrong', minutes: locked });
      }
      clearLoginFails(key);
      var ownerKey = (loginAccounts().find(function (u) { return u.role === 'owner'; }) || {}).key || 'owner|Anh Tuyên|';
      var roleKey = res.me.vai_tro === 'chu_nha' ? ownerKey : res.me.vai_tro === 'quan_ly' ? 'manager|' + res.me.ten + '|' : null;
      // Căn / phòng còn sót của lần đăng nhập trước (hay tài khoản khác) không được coi là sửa đổi chưa gửi
      try { ['homeRealHouses', 'homeRealRooms', 'homeRealRoomsBase', 'homeRealHousesBase', 'homeRealRoomIds'].forEach(function (k) { localStorage.removeItem(k); }); } catch (e) {}
      try { localStorage.setItem('homeServerUser', JSON.stringify({ id: res.me.id, vai_tro: res.me.vai_tro, ten: res.me.ten, phone: res.me.so_dien_thoai })); } catch (e) {}
      // Tải dữ liệu thật về máy rồi mở lại app ở chế độ dữ liệu thật
      var fail = function (error) {
        try { localStorage.removeItem('homeServerUser'); } catch (e) {}
        window.HOME_DB.signOut();
        show(error);
      };
      var whichRoom = res.me.vai_tro === 'khach' ? window.HOME_DB.myRoom(res.me.id) : Promise.resolve({});
      whichRoom.then(function (place) {
        if (place.error) return fail('loadFail');
        if (res.me.vai_tro === 'khach') {
          if (!place.room) return fail('noRoom');
          roleKey = 'tenant|' + res.me.ten + '|' + place.room;
        }
        window.HOME_DB.pullAll().then(function (p) {
          if (p.error) return fail('loadFail');
          // Khách không được thấy số căn, số phòng
          if (res.me.vai_tro !== 'khach') try { sessionStorage.setItem('homeRealToast', 'Đã tải dữ liệu: ' + p.houses + ' căn · ' + p.rooms + ' phòng'); } catch (e) {}
          try { sessionStorage.setItem('homeRealReloadAt', String(Date.now())); localStorage.setItem('homeAppSignedIn', '1'); localStorage.removeItem('homeSignedOut'); localStorage.setItem('homeAccount', roleKey); localStorage.setItem('homeServerUser', JSON.stringify({ id: res.me.id, vai_tro: res.me.vai_tro, ten: res.me.ten, phone: res.me.so_dien_thoai, key: roleKey })); } catch (e) {}
          location.reload();
        });
      });
    });
  }, true);
  var so = window.signOut;
  if (typeof so === 'function') window.signOut = function () {
    try { ['homeServerUser', 'homeRealHouses', 'homeRealRooms', 'homeRealRoomsBase', 'homeRealHousesBase'].forEach(function (k) { localStorage.removeItem(k); }); } catch (e) {}
    if (window.HOME_DB) window.HOME_DB.signOut();
    return so.apply(this, arguments);
  };
})();
// Đặt mật khẩu trong app (thêm quản lý, lập hợp đồng cho khách, đặt lại mật khẩu, tự đổi mật khẩu)
// → khi đang đăng nhập bằng tài khoản thật thì làm luôn trên máy chủ Supabase.
(function () {
  var base = window.setUserPassword;
  if (typeof base !== 'function') return;
  function serverUser() { try { return JSON.parse(localStorage.getItem('homeServerUser') || 'null'); } catch (e) { return null; } }
  function toast(t) { if (typeof appToast === 'function') appToast(t); }
  window.setUserPassword = function (key, pw, by, selfChanged) {
    var result = base.apply(this, arguments);
    var me = serverUser();
    if (!me || !window.HOME_DB || !key || !pw) return result;
    if (selfChanged) {
      // Mật khẩu người dùng tự đặt không để lại trên máy
      try { var saved = readPasswords(); if (saved[key]) { saved[key].pw = ''; localStorage.setItem('homePasswords', JSON.stringify(saved)); } } catch (e) {}
      window.HOME_DB.changeOwnPassword(pw).then(function (r) { toast(r.error ? 'Máy chủ chưa đổi được mật khẩu: ' + r.error : 'Đã đổi mật khẩu trên máy chủ'); });
      return result;
    }
    var user = (readUsers() || []).find(function (u) { return u.key === key; });
    var role = String(key).split('|')[0];
    var vaiTro = role === 'manager' ? 'quan_ly' : role === 'tenant' ? 'khach' : null;
    var phone = user && user.phone;
    if (!vaiTro || !phone) { toast('Chưa có số điện thoại nên chưa tạo được tài khoản trên máy chủ'); return result; }
    window.__homeSavingAccount = (window.__homeSavingAccount || 0) + 1;
    window.HOME_DB.saveAccount({ phoneKey: phoneKey(phone, '84'), name: user.name, role: vaiTro, password: pw, room: vaiTro === 'khach' ? user.room : null }).then(function (r) {
      window.__homeSavingAccount--;
      if (!r || r.error) toast('Máy chủ chưa tạo được tài khoản: ' + ((r && r.error) || 'lỗi không rõ'));
      else {
        toast(r.da_co ? 'Đã đặt lại mật khẩu trên máy chủ cho ' + user.name : 'Đã tạo tài khoản trên máy chủ cho ' + user.name);
        // Ghi lại mã trên máy chủ, để phân công của người này gửi lên được
        var list = readUsers(), target = list.find(function (u) { return u.key === key; });
        if (target && r.id && !target.uuid) { target.uuid = r.id; saveUsers(list); }
        // Tài khoản xong rồi mới gửi được phần giao căn, giao phòng
        if (me.vai_tro === 'chu_nha') window.HOME_DB.pushPeople().then(function (p) { if (p.error) toast('Chưa lưu được phân công lên máy chủ: ' + p.error); });
        if (r.id && vaiTro === 'khach' && user.room) window.HOME_DB.linkTenantRoom(r.id, user.room).then(function (l) { if (l.error) toast('Chưa gắn được khách vào phòng: ' + l.error); });
      }
    });
    return result;
  };
})();

// Quản lý và khách chỉ được ở đúng tài khoản của mình, không bao giờ rơi về vai chủ nhà hay người khác
(function () {
  if (!window.HOME_REAL) return;
  var me = null;
  try { me = JSON.parse(localStorage.getItem('homeServerUser') || 'null'); } catch (e) {}
  if (!me || me.vai_tro === 'chu_nha') return;
  var mine = me.key || (me.vai_tro === 'quan_ly' ? 'manager|' + me.ten + '|' : '');
  if (!mine) return window.signOut(); // phiên cũ chưa ghi tài khoản: đăng nhập lại
  var select = document.getElementById('accountSelect'), base = window.setAccount;
  function keep() {
    if (select && !Array.prototype.some.call(select.options, function (o) { return o.value === mine; })) {
      var option = document.createElement('option'); option.value = mine; option.textContent = me.ten; select.append(option);
    }
    if (select) select.value = mine;
  }
  window.setAccount = function () { keep(); return base.call(this, mine); };
  keep();
  if (localStorage.getItem('homeAccount') !== mine) window.setAccount(mine);
})();

// Chế độ dữ liệu thật: báo đã tải; mỗi lần mở app thì tải lại căn + phòng (nếu đổi thì mở lại)
(function () {
  if (!window.HOME_REAL) return;
  try { var who = JSON.parse(localStorage.getItem('homeServerUser') || 'null'); if (who && who.phone && who.vai_tro === 'chu_nha') OWNER_ACCOUNT.phone = who.phone; } catch (e) {}
  try { var t = sessionStorage.getItem('homeRealToast'); if (t) { sessionStorage.removeItem('homeRealToast'); setTimeout(function () { if (typeof appToast === 'function') appToast(t); }, 600); } } catch (e) {}
  function refresh() {
    if (!window.HOME_DB) return window.addEventListener('home-db-ready', refresh, { once: true });
    // Vừa đăng nhập xong đã tải đủ dữ liệu: không tải lại ngay lần nữa (tải định kỳ 60 giây vẫn chạy)
    // vừa mở lại chưa tới 20 giây: không tải ngay, nhưng hẹn tải ở mốc 20 giây (trước đây chờ tới lần tải định kỳ 60 giây — tester 21/11)
    try { var since = Date.now() - (Number(sessionStorage.getItem('homeRealReloadAt')) || 0); if (window.__homeBootHadRooms !== false && since < 20000) { if (!window.__homeDataPulled) setTimeout(refresh, Math.max(1000, 20000 - since)); return; } } catch (e) {}
    var snapshot = function () { return ['homeRealHouses', 'homeRealRooms', 'homeUsers', 'homePropertyManagers', 'homeRoomManagers'].map(function (k) { return localStorage.getItem(k) || ''; }).join('|'); };
    var before = snapshot(), hadRooms = !!String(localStorage.getItem('homeRealRooms') || '').replace(/^\[\]$/, '');
    window.HOME_DB.pullAll().then(function (p) {
      if (p.error) return;
      if (snapshot() === before && !p.changed) return;
      // Chỉ mở lại khi đã qua 1 phút kể từ lần trước, không để app tự tải lại liên tục
      var last = 0; try { last = Number(sessionStorage.getItem('homeRealReloadAt')) || 0; } catch (e) {}
      if (document.querySelector('.modal-overlay')) return;
      // Tester 21/11: máy mở lúc bộ nhớ trống (chưa có phòng) → trang dựng khi chưa có gì, ô phòng / Tổng quan không tự có → mở lại trang một lần
      if (typeof window.__homeReloadIfFirstRooms === 'function' && window.__homeReloadIfFirstRooms()) return;
      var firstRooms = false;
      if (Date.now() - last < 60000 && !firstRooms) {
        // Vừa mở lại chưa tới 1 phút: không tải lại trang, chỉ vẽ lại với dữ liệu mới, giữ đúng trang đang xem
        var sel = document.getElementById('accountSelect'), page = (document.querySelector('.subpage.active') || {}).id, y = window.scrollY;
        try { if (sel && typeof window.setAccount === 'function') window.setAccount(sel.value); if (page && (document.querySelector('.subpage.active') || {}).id !== page) window.go(page); window.scrollTo(0, y); } catch (e) {}
        return;
      }
      // Mở lại vẫn về đúng tab đang xem
      try { sessionStorage.setItem('homeRealReloadAt', String(Date.now())); sessionStorage.setItem('homeReturnTab', (document.querySelector('.subpage.active') || {}).id || 'home'); } catch (e) {}
      location.reload();
    });
  }
  setTimeout(refresh, 1500);
})();

// Lần đầu vào app: chấp nhận Điều khoản và Chính sách; khách đồng ý riêng về ảnh giấy tờ. Lưu trên máy chủ.
(function () {
  if (!window.HOME_REAL) return;
  var VERSION = '2026-11-02';
  var TEXT = {
    vi: { head: 'Trước khi dùng Home', terms: 'Tôi đã đọc và đồng ý với Điều khoản sử dụng và Chính sách quyền riêng tư.', id: 'Cho phép Home lưu ảnh giấy tờ tuỳ thân để làm hợp đồng và khai báo tạm trú.', privacy: 'Xem Chính sách', read: 'Xem Điều khoản', ok: 'Đồng ý và tiếp tục', no: 'Đăng xuất', err: 'Chưa lưu được. Kiểm tra mạng rồi thử lại.' },
    en: { head: 'Before you use Home', terms: 'I have read and agree to the Terms of Use and Privacy Policy.', id: 'Allow Home to store my ID photos for the lease and residence registration.', privacy: 'View Policy', read: 'View Terms', ok: 'Agree and continue', no: 'Sign out', err: 'Could not save. Check your connection and try again.' },
    km: { head: 'មុនពេលប្រើ Home', terms: 'ខ្ញុំបានអាន និងយល់ព្រមនឹងលក្ខខណ្ឌប្រើប្រាស់ និងគោលការណ៍ឯកជនភាព។', id: 'អនុញ្ញាតឱ្យ Home រក្សាទុករូបថតឯកសារអត្តសញ្ញាណ សម្រាប់កិច្ចសញ្ញា និងការប្រកាសស្នាក់នៅ។', privacy: 'មើលគោលការណ៍', read: 'មើលលក្ខខណ្ឌ', ok: 'យល់ព្រម និងបន្ត', no: 'ចាកចេញ', err: 'មិនអាចរក្សាទុកបានទេ។ សូមពិនិត្យអ៊ីនធឺណិត ហើយសាកម្ដងទៀត។' }
  };
  function start() {
    var me = null;
    try { me = JSON.parse(localStorage.getItem('homeServerUser') || 'null'); } catch (e) {}
    if (!me) return;
    window.HOME_DB.consents(me.id, VERSION).then(function (have) {
      if (!have) return; // chưa có bảng hoặc mất mạng: không chặn
      var needId = me.vai_tro === 'khach' && have.indexOf('giay_to') < 0;
      if (have.indexOf('dieu_khoan') >= 0 && !needId) return;
      var t = TEXT[loginLang()] || TEXT.vi, overlay = document.createElement('div');
      overlay.className = 'modal-overlay'; overlay.style.zIndex = 55;
      overlay.innerHTML = '<form class="modal-sheet" novalidate><div class="modal-head">' + t.head + '</div>' +
        '<div class="modal-actions"><button type="button" data-doc="privacy">' + t.privacy + '</button><button type="button" data-doc="terms">' + t.read + '</button></div>' +
        '<label class="user-check"><input type="checkbox" name="terms"><span>' + t.terms + '</span></label>' +
        (needId ? '<label class="user-check"><input type="checkbox" name="id"><span>' + t.id + '</span></label>' : '') +
        '<p class="user-error" hidden></p><div class="modal-actions"><button type="button" data-no>' + t.no + '</button><button type="submit" class="save" disabled>' + t.ok + '</button></div></form>';
      appendToPhone(overlay);
      var form = overlay.querySelector('form'), save = form.querySelector('.save');
      form.addEventListener('change', function () { save.disabled = !form.terms.checked || (needId && !form.id.checked); });
      form.addEventListener('click', function (event) {
        var doc = event.target.closest('[data-doc]');
        if (doc) openLegal(doc.dataset.doc);
        if (event.target.closest('[data-no]')) window.signOut();
      });
      form.addEventListener('submit', function (event) {
        event.preventDefault();
        var rows = [];
        if (have.indexOf('dieu_khoan') < 0) rows.push({ loai: 'dieu_khoan', noi_dung: t.terms });
        if (needId) rows.push({ loai: 'giay_to', noi_dung: t.id });
        save.disabled = true;
        window.HOME_DB.saveConsents(me.id, VERSION, rows).then(function (r) {
          if (!r.error) return overlay.remove();
          save.disabled = false;
          var box = form.querySelector('.user-error'); box.textContent = t.err; box.hidden = false;
        });
      });
    });
  }
  if (window.HOME_DB) setTimeout(start, 800); else window.addEventListener('home-db-ready', function () { setTimeout(start, 800); }, { once: true });
})();

// Ô bắt buộc: nhãn có dấu * đỏ. Ô bắt buộc là ô có required (trình duyệt chặn) hoặc data-req (code tự kiểm tra khi lưu)
(function () {
  function control(label) {
    if (label.querySelector('input,select,textarea')) return null;
    for (var el = label.nextElementSibling, i = 0; el && i < 4 && el.tagName !== 'LABEL'; el = el.nextElementSibling, i++) {
      var c = el.matches('input,select,textarea') ? el : el.querySelector('[required],[data-req]') || el.querySelector('input,select,textarea');
      if (c) return c;
    }
    return null;
  }
  function mark() {
    document.querySelectorAll('.phone form label, .phone .modal-sheet label').forEach(function (label) {
      var c = control(label), need = !!c && (c.required || c.hasAttribute('data-req')) && !c.readOnly && !c.disabled;
      if (label.classList.contains('req') !== need) label.classList.toggle('req', need);
    });
  }
  var queued = false;
  new MutationObserver(function () { if (queued) return; queued = true; queueMicrotask(function () { queued = false; mark(); }); })
    .observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['required', 'data-req', 'readonly', 'disabled'] });
  mark();
})();

// Lướt nội dung xuống thì ẩn thanh tab dưới, kéo lên / về đầu / tới cuối danh sách thì hiện lại.
// Cộng dồn quãng lướt để ngón tay rê chậm không làm thanh nhấp nháy; trang ngắn thì không ẩn.
(function () {
  var last = 0, acc = 0;
  function bar() { return document.querySelector('.phone .tabs'); }
  document.addEventListener('scroll', function (event) {
    var c = event.target, t = bar();
    if (!t || !c || !c.matches || !c.matches('.phone main.content')) return;
    var max = c.scrollHeight - c.clientHeight, y = Math.max(0, Math.min(c.scrollTop, max)), dy = y - last;
    last = y;
    if (max < 120 || y <= 40 || y >= max - 8) { t.classList.remove('tabs-away'); acc = 0; return; }
    acc = acc * dy > 0 ? acc + dy : dy;
    if (acc > 24) t.classList.add('tabs-away');
    else if (acc < -16) t.classList.remove('tabs-away');
  }, true);
  // Đổi trang: luôn hiện thanh tab và báo trình đọc màn hình tab nào đang chọn
  function mark() {
    var t = bar(); if (!t) return;
    t.setAttribute('aria-label', 'Điều hướng chính');
    t.querySelectorAll('.tab').forEach(function (tab) {
      if (tab.classList.contains('active')) tab.setAttribute('aria-current', 'page'); else tab.removeAttribute('aria-current');
      var i = tab.querySelector('i'); if (i) i.setAttribute('aria-hidden', 'true');
    });
  }
  if (typeof window.go === 'function') {
    var base = window.go;
    window.go = function () { var r = base.apply(this, arguments); var t = bar(); if (t) t.classList.remove('tabs-away'); last = 0; acc = 0; mark(); return r; };
  }
  mark();
})();

// Mã phòng gõ "p.405", "p405", "P 405" → "P.405" (thống nhất kiểu mã phòng); mã liền khác viết hoa hết, có dấu cách thì viết hoa chữ đầu
(function () {
  function roomCode(v) {
    var s = String(v || '').trim().replace(/\s+/g, ' '), m = s.match(/^p[\s.\-_]*(\d.*)$/i);
    if (m) return 'P.' + m[1].replace(/\s+/g, '').toUpperCase();
    if (!/\s/.test(s)) return s.toUpperCase(); // mã liền như hn-201 → HN-201
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  }
  function isRoomForm(form) { var h = form && form.querySelector('.modal-head'); return !!h && /^Thêm phòng mới/.test(h.textContent.trim()); }
  function fix(form) { var i = form.querySelector('input[name=name]'); if (i && i.value) i.value = roomCode(i.value); }
  document.addEventListener('change', function (e) { var f = e.target.form; if (e.target.name === 'name' && isRoomForm(f)) fix(f); }, true);
  document.addEventListener('submit', function (e) { if (isRoomForm(e.target)) fix(e.target); }, true);
})();


// Khách đã ký, chưa xong việc vào ở: thẻ "Việc cần làm" đầu màn khách (Ký hợp đồng ✓ → Nhận phòng → Đóng cọc + tiền thuê kỳ đầu).
// App tạo khoản cọc + tiền thuê kỳ đầu khi khách xác nhận biên bản giao phòng, nên nhận phòng đứng trước.
// Chưa nhận phòng thì ẩn thẻ "Khoản thanh toán" (chưa có khoản nào phải đóng). Xong hết thì thẻ tự mất.
(function () {
  function get(k, d) { try { return JSON.parse(localStorage.getItem(k) || 'null') || d; } catch (e) { return d; } }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function render() {
    var portal = document.getElementById('tenantPortal'), sel = document.getElementById('accountSelect');
    if (!portal || !sel) return;
    var acct = String(sel.value || '').split('|'), box = document.getElementById('tenantTodo'), due = document.getElementById('tenantDueCard');
    var room = acct[2], name = acct[1], c = acct[0] === 'tenant' && (get('homeContracts', {})[room] || null), html = '';
    var signed = c && c.status === 'Đã ký' && (!c.tenantName || c.tenantName === name);
    var hand = signed ? get('homeInventoryRecords', []).filter(function (r) { return r && r.room === room && r.type === 'Giao phòng' && (!r.tenant || r.tenant === name); }).sort(function (a, b) { return (b.time || 0) - (a.time || 0); }) : [];
    var moved = hand.some(function (r) { return r.status === 'Đã được khách thuê xác nhận'; }), pendingHand = !moved && hand[0];
    var first = signed ? get('homeRentCharges', []).filter(function (x) { return x && x.room === room && x.tenantKey === acct.join('|') && (x.kind === 'deposit' || x.kind === 'rent') && (x.status === 'Chưa thu' || x.status === 'Đã báo thanh toán'); }) : [];
    var dep = first.filter(function (x) { return x.kind === 'deposit' && !/bổ sung/i.test(String(x.title || '')); })[0];
    if (signed && (!moved || dep)) {
      // Khách nhắc quản lý hẹn ngày giao phòng: mỗi ngày một lần (anh yêu cầu 13/11)
      var nudge = (function () { var l = (c.handoverNudges || []).slice(-1)[0], d = l && (String(l.at).match(/(\d{1,2})\/(\d{1,2})\/\d{4}/) || []); return { last: l, day: d && d[1] ? d[1].padStart(2, '0') + '/' + d[2].padStart(2, '0') : '', today: !!(l && String(l.at).indexOf(new Date().toLocaleDateString('vi-VN')) >= 0) }; })();
      var step = function (done, now, title, sub, btn) {
        return '<div class="todo-step' + (done ? ' done' : now ? ' now' : '') + '"><span class="todo-dot">' + (done ? '✓' : '') + '</span><div><strong>' + title + '</strong>' + (sub ? '<small>' + sub + '</small>' : '') + '</div>' + (btn || '') + '</div>';
      };
      // Khách trả trước khi nhận phòng, quản lý đã xác nhận: bước đóng cọc tính xong (anh chốt 12/11)
      var paidEv = !moved && !dep ? ((get('homeTenantEvents', {})[room]) || []).filter(function (e) { return e && e.kind === 'payment' && e.status === 'Đã xác nhận' && (!e.tenantName || e.tenantName === name); }) : [];
      var prepaid = paidEv.length ? (function () { var sum = paidEv.reduce(function (a, e) { return a + (Number(e.amount) || 0); }, 0); try { return amountForHouse(sum, propertyIdForRoom(room)); } catch (x) { return String(sum); } })() : '';
      var reported = dep && (dep.status === 'Đã báo thanh toán' || Array.prototype.some.call(portal.querySelectorAll('.tenant-actions button'), function (x) { return /^Đã báo thanh toán/.test(x.textContent.trim()); }));
      html = '<div class="todo-head">Việc cần làm</div>' +
        step(true, false, 'Ký hợp đồng', esc(c.number)) +
        step(moved, !moved, 'Nhận phòng', moved ? '' : pendingHand ? 'Quản lý đã gửi biên bản giao phòng' : 'Quản lý sẽ hẹn ngày giao phòng' + (nudge.last ? ' · đã nhắc ' + nudge.day : ''),
          pendingHand ? '<button type="button" class="todo-btn" data-todo="hand" data-id="' + esc(pendingHand.id) + '">Xem và xác nhận</button>' : nudge.today ? '' : '<button type="button" class="todo-btn" data-todo="nudge">Nhắc quản lý</button>') +
        step(!!prepaid, moved && !prepaid, 'Đóng cọc và tiền thuê kỳ đầu', prepaid ? 'Đã trả trước ' + prepaid + ' · tự trừ vào kỳ đầu' : reported ? 'Đã báo thanh toán · chờ quản lý xác nhận' : moved ? 'Bấm Báo đã thanh toán sau khi chuyển tiền' : 'Sau khi nhận phòng');
    }
    if (due) { var hide = signed && !moved; if (due.hidden !== hide) due.hidden = hide; portal.querySelectorAll('.tenant-actions button').forEach(function (b) { if (/^(Báo|Đã báo) đã thanh toán|^Đã báo thanh toán/.test(b.textContent.trim()) && b.hidden !== hide) b.hidden = hide; }); }
    if (!html) { if (box) box.remove(); return; }
    if (!box) { box = document.createElement('div'); box.id = 'tenantTodo'; box.className = 'tenant-todo'; (due || portal.firstElementChild).insertAdjacentElement(due ? 'beforebegin' : 'afterend', box); }
    if (box.dataset.html !== html) { box.dataset.html = html; box.innerHTML = html; }
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-todo]');
    if (!b) return;
    if (b.dataset.todo === 'hand' && typeof window.openHandoverReview === 'function') window.openHandoverReview(b.dataset.id);
    if (b.dataset.todo === 'nudge') {
      var acct = String(document.getElementById('accountSelect').value || '').split('|'), room = acct[2], c = getHomeContract(room);
      if (!c) return;
      var at = new Date().toLocaleString('vi-VN');
      c.handoverNudges = (c.handoverNudges || []).concat([{ at: at, by: acct[1] }]);
      saveHomeContract(room, c);
      appendRoomHistory(room, { kind: 'room', title: 'Khách nhắc hẹn ngày giao phòng', detail: acct[1] + ' · ' + at, tenantName: acct[1], actor: acct[1] });
      if (typeof appToast === 'function') appToast('Đã nhắc quản lý');
    }
  });
  var t = 0, busy = false;
  function soon() { if (busy) return; clearTimeout(t); t = setTimeout(function () { busy = true; try { render(); } finally { setTimeout(function () { busy = false; }, 0); } }, 80); }
  function watch() { var p = document.getElementById('tenantPortal'); if (p) new MutationObserver(soon).observe(p, { childList: true, subtree: true }); render(); }
  var setItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function (k) { var r = setItem.apply(this, arguments); if (/home(Contracts|InventoryRecords|RentCharges)$/.test(k)) soon(); return r; };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch); else watch();
})();

// Điều khoản hợp đồng (anh chốt 12/11): mẫu chung, chủ nhà sửa trong ⚙ cài đặt căn (lưu homeHouseSettings[căn].contractTerms).
// Khách đọc trong màn hợp đồng trước khi ký; app tự điền phòng, tên, tiền, ngày. Chủ nhà chưa sửa thì dùng mẫu sẵn theo ngôn ngữ của khách.
// Đổi cài đặt căn (kể cả điều khoản) ghi vào Lịch sử.
(function () {
  var DEFAULT = {
    vi: ["1. Chủ nhà (bên cho thuê) cho {khach} thuê phòng {phong} để ở, thời hạn {thoi_han}. Số người ở: {so_nguoi}, không ở quá số người này.", "2. Tiền thuê {tien_thue}/tháng, đóng {han_dong} bằng chuyển khoản theo mã QR trong app; app tự gửi biên lai. Điện nước: {dien_nuoc}. Đóng trễ không bị phạt, app sẽ nhắc; nợ quá 15 ngày thì chủ nhà liên hệ trực tiếp.", "3. Tiền cọc {coc}, hoàn lại ngay khi trả phòng, sau khi kiểm tra phòng và trừ tiền còn nợ, chi phí hư hỏng, mất đồ (nếu có). Khoản trừ lớn hơn tiền cọc thì người thuê trả phần còn thiếu.", "4. Người ở thêm phải báo trong app, có ảnh CCCD / hộ chiếu, và được quản lý duyệt{phu_phi_cau}. Người ở lại qua đêm chỉ cần báo trong app; ở quá {dem} đêm trong 30 ngày thì phải đăng ký người ở cùng.", "5. Người thuê đưa giấy tờ để bên cho thuê khai báo tạm trú (Việt Nam: công an / VNeID; Campuchia: sangkat). Ảnh giấy tờ được giữ trong app đến 1 năm sau khi trả phòng.", "6. Người thuê giữ gìn phòng và tài sản theo biên bản giao phòng. Hư hỏng do người thuê gây ra, mất chìa khoá / thẻ / remote thì người thuê trả theo hoá đơn thực tế; hao mòn tự nhiên thì không phải trả.", "7. Có hư hỏng thì báo trong app. Không tự sửa, không cải tạo, không cho người khác thuê lại khi chưa được chủ nhà đồng ý. Quản lý được vào phòng để sửa chữa, bảo trì khi đã hẹn trước, trừ trường hợp khẩn cấp (cháy, rò nước).", "8. Còn 30 ngày là hết hạn, người thuê chọn Gia hạn hoặc Không gia hạn trong app. Muốn tăng giá, chủ nhà báo trong app trước ít nhất 30 ngày.", "9. Muốn trả phòng trước hạn, báo trong app trước ít nhất 30 ngày; tiền thuê kỳ cuối tính theo số ngày ở. Báo trước dưới 30 ngày hoặc đi không báo thì mất toàn bộ tiền cọc và tính trọn kỳ cuối, trừ khi chủ nhà đồng ý khác.", "10. Khi trả phòng, hai bên kiểm tra phòng theo biên bản giao phòng. Vi phạm nội quy được lập biên bản trong app; đến lần thứ 3, chủ nhà có thể lấy lại phòng. Chủ nhà lấy lại phòng thì báo trước ít nhất 30 ngày, hoàn đủ cọc và tiền thuê những ngày chưa ở.", "11. Chủ nhà duyệt và người thuê ký hợp đồng trong app Home♡; bản điều khoản người thuê đã đọc được lưu kèm hợp đồng. Khiếu nại gửi chủ nhà qua mục Góp ý / Khiếu nại. Nếu các bản ngôn ngữ khác nhau, dùng bản tiếng Việt (căn ở Việt Nam) hoặc bản tiếng Khmer (căn ở Campuchia)."],
    en: ["1. The landlord lets room {phong} to {khach} as a residence, for the term {thoi_han}. Number of occupants: {so_nguoi}; no more people may live there.", "2. Rent {tien_thue}/month, due {han_dong}, paid by bank transfer using the QR code in the app; the app sends a receipt. Utilities: {dien_nuoc}. There is no late fee; the app sends reminders, and if rent is more than 15 days overdue the landlord will contact the tenant directly.", "3. Deposit {coc}, refunded at move-out after the room is checked, minus any unpaid amounts and the cost of damage or missing items. If deductions exceed the deposit, the tenant pays the difference.", "4. Any additional occupant must be reported in the app with an ID card / passport photo and approved by the manager{phu_phi_cau}. Overnight guests only need to be reported in the app; a guest staying more than {dem} nights in 30 days must be registered as an occupant.", "5. The tenant provides ID documents so the landlord can register their residence (Vietnam: police / VNeID; Cambodia: sangkat). ID photos are kept in the app for up to 1 year after move-out.", "6. The tenant takes care of the room and the items in the handover record. The tenant pays the actual invoiced cost of damage they cause and of lost keys / cards / remotes; normal wear and tear is not charged.", "7. Report damage in the app. No repairs, alterations or subletting without the landlord's consent. The manager may enter the room for repairs or maintenance by prior appointment, except in emergencies (fire, water leak).", "8. 30 days before the end date, the tenant chooses Renew or Do not renew in the app. To raise the rent, the landlord gives at least 30 days' notice in the app.", "9. To leave early, give at least 30 days' notice in the app; rent for the last period is then charged by the day. With less than 30 days' notice, or leaving without notice, the full deposit is forfeited and the whole last period is charged, unless the landlord agrees otherwise.", "10. At move-out, both parties check the room against the handover record. Breaches of the house rules are recorded in the app; after the 3rd breach the landlord may take the room back. When the landlord takes the room back, they give at least 30 days' notice and refund the full deposit and the rent for unused days.", "11. The landlord approves and the tenant signs this contract in the Home♡ app; the terms the tenant read are saved with the contract. Complaints go to the landlord via Feedback / Complaint. If language versions differ, the Vietnamese version applies for houses in Vietnam and the Khmer version for houses in Cambodia."],
    km: ["1. ម្ចាស់ផ្ទះ ជួលបន្ទប់ {phong} ឱ្យ {khach} ស្នាក់នៅ រយៈពេល {thoi_han}។ ចំនួនអ្នកស្នាក់នៅ៖ {so_nguoi} នាក់ មិនត្រូវលើសចំនួននេះ។", "2. ថ្លៃជួល {tien_thue}/ខែ បង់ {han_dong} ដោយផ្ទេរប្រាក់តាមកូដ QR ក្នុងកម្មវិធី កម្មវិធីផ្ញើបង្កាន់ដៃដោយស្វ័យប្រវត្តិ។ ទឹកភ្លើង៖ {dien_nuoc}។ បង់យឺតមិនពិន័យទេ កម្មវិធីនឹងរំលឹក ជំពាក់លើស 15 ថ្ងៃ ម្ចាស់ផ្ទះនឹងទាក់ទងផ្ទាល់។", "3. ប្រាក់កក់ {coc} ប្រគល់វិញភ្លាមពេលចេញ ក្រោយពិនិត្យបន្ទប់ និងកាត់ប្រាក់ជំពាក់ ថ្លៃខូចខាត ឬបាត់របស់ (ប្រសិនបើមាន)។ បើប្រាក់កាត់លើសប្រាក់កក់ អ្នកជួលត្រូវបង់ចំនួនដែលខ្វះ។", "4. អ្នកស្នាក់នៅបន្ថែមត្រូវរាយការណ៍ក្នុងកម្មវិធី មានរូបអត្តសញ្ញាណប័ណ្ណ / លិខិតឆ្លងដែន និងត្រូវអ្នកគ្រប់គ្រងអនុម័ត{phu_phi_cau}។ ភ្ញៀវស្នាក់មួយយប់ គ្រាន់តែរាយការណ៍ក្នុងកម្មវិធី ស្នាក់លើស {dem} យប់ក្នុង 30 ថ្ងៃ ត្រូវចុះឈ្មោះជាអ្នកស្នាក់នៅជាមួយ។", "5. អ្នកជួលផ្តល់ឯកសារឱ្យម្ចាស់ផ្ទះចុះឈ្មោះស្នាក់នៅ (វៀតណាម៖ ប៉ូលិស / VNeID; កម្ពុជា៖ សង្កាត់)។ រូបឯកសាររក្សាទុកក្នុងកម្មវិធីរហូតដល់ 1 ឆ្នាំក្រោយចេញ។", "6. អ្នកជួលថែរក្សាបន្ទប់ និងទ្រព្យតាមកំណត់ត្រាប្រគល់។ ការខូចខាតដែលអ្នកជួលបង្ក និងការបាត់សោ / កាត / តេឡេបញ្ជា អ្នកជួលបង់តាមវិក្កយបត្រពិត។ ការរេចរឹលធម្មតា មិនគិតថ្លៃទេ។", "7. មានការខូចខាត សូមរាយការណ៍ក្នុងកម្មវិធី។ មិនត្រូវជួសជុលខ្លួនឯង កែប្រែ ឬជួលបន្តដោយគ្មានការយល់ព្រមពីម្ចាស់ផ្ទះ។ អ្នកគ្រប់គ្រងអាចចូលបន្ទប់ដើម្បីជួសជុល ឬថែទាំ ពេលបានណាត់ជាមុន លើកលែងករណីបន្ទាន់ (អគ្គិភ័យ លេចទឹក)។", "8. នៅសល់ 30 ថ្ងៃមុនផុតកំណត់ អ្នកជួលជ្រើសរើស បន្តកិច្ចសន្យា ឬ មិនបន្ត ក្នុងកម្មវិធី។ ចង់ដំឡើងថ្លៃ ម្ចាស់ផ្ទះត្រូវជូនដំណឹងក្នុងកម្មវិធីយ៉ាងហោចណាស់ 30 ថ្ងៃមុន។", "9. ចង់ចេញមុនកំណត់ ត្រូវជូនដំណឹងក្នុងកម្មវិធីយ៉ាងហោចណាស់ 30 ថ្ងៃមុន ថ្លៃជួលវគ្គចុងក្រោយគិតតាមចំនួនថ្ងៃស្នាក់នៅ។ ជូនដំណឹងតិចជាង 30 ថ្ងៃ ឬចេញដោយមិនជូនដំណឹង នឹងត្រូវដកហូតប្រាក់កក់ទាំងអស់ និងគិតថ្លៃវគ្គចុងក្រោយពេញ លើកលែងតែម្ចាស់ផ្ទះយល់ព្រមផ្សេង។", "10. ពេលចេញ ភាគីទាំងពីរពិនិត្យបន្ទប់តាមកំណត់ត្រាប្រគល់។ ការបំពានបទបញ្ជាផ្ទះត្រូវកត់ត្រាក្នុងកម្មវិធី លើកទី 3 ម្ចាស់ផ្ទះអាចយកបន្ទប់វិញ។ ម្ចាស់ផ្ទះយកបន្ទប់វិញ ត្រូវជូនដំណឹងយ៉ាងហោចណាស់ 30 ថ្ងៃមុន ប្រគល់ប្រាក់កក់ពេញ និងថ្លៃជួលថ្ងៃដែលមិនទាន់ស្នាក់នៅ។", "11. ម្ចាស់ផ្ទះអនុម័ត ហើយអ្នកជួលចុះហត្ថលេខាកិច្ចសន្យាក្នុងកម្មវិធី Home♡ លក្ខខណ្ឌដែលអ្នកជួលបានអានរក្សាទុកជាមួយកិច្ចសន្យា។ បណ្តឹងផ្ញើទៅម្ចាស់ផ្ទះតាមផ្នែក មតិយោបល់ / បណ្តឹង។ បើកំណែភាសាខុសគ្នា ប្រើកំណែភាសាវៀតណាម (ផ្ទះនៅវៀតណាម) ឬកំណែភាសាខ្មែរ (ផ្ទះនៅកម្ពុជា)។"]
  };
  function lang() { try { var l = localStorage.getItem('homeLang'); return l === 'en' || l === 'km' ? l : 'vi'; } catch (e) { return 'vi'; } }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function role() { var s = document.getElementById('accountSelect'); return s ? String(s.value).split('|')[0] : ''; }
  function me() { var s = document.getElementById('accountSelect'); return s ? String(s.value).split('|')[1] || '' : ''; }
  function settings(id) { try { return (typeof houseSettings === 'function' ? houseSettings(id) : {}) || {}; } catch (e) { return {}; } }
  function houseOf(room) { try { return typeof propertyIdForRoom === 'function' ? propertyIdForRoom(room) : ''; } catch (e) { return ''; } }
  function houseName(id) { try { return ((readProperties() || []).find(function (h) { return h.id === id; }) || {}).name || ''; } catch (e) { return ''; } }
  function ownTerms(house, L) { var own = settings(house).contractTerms; if (own && typeof own === 'object') return String(own[L] || '').trim(); return L === 'vi' && own ? String(own).trim() : ''; }
  window.contractTermsTemplate = function (house, L) { L = L || lang(); return ownTerms(house, L) || DEFAULT[L].join('\n'); };
  // Bản điều khoản đã ký còn đúng không: ghi kèm giá / thời hạn lúc ký; hợp đồng cũ thì xem bản đã ký có chứa giá hiện tại
  function signedKey(c) { return [c.rent, c.term, c.deposit].join('|'); }
  function termsStillFit(c, room) {
    if (c.termsFor) return c.termsFor === signedKey(c);
    try { var house = houseOf(room), r = typeof amountForHouse === 'function' && house ? amountForHouse(Number(c.rent) || 0, house) : money(Number(c.rent) || 0); return String(c.termsText).indexOf(r) >= 0 && String(c.termsText).indexOf(String(c.term || '')) >= 0; } catch (e) { return true; }
  }
  function fill(text, room, c) {
    var house = houseOf(room), m = function (v) { try { return typeof amountForHouse === 'function' && house ? amountForHouse(Number(v) || 0, house) : money(Number(v) || 0); } catch (e) { return String(v || ''); } };
    var L = lang(), W = { vi: ['điện', 'nước', 'theo đồng hồ', 'cố định', '/tháng', 'chưa nhập giá'], en: ['electricity', 'water', 'metered', 'flat', '/month', 'price not set'], km: ['ភ្លើង', 'ទឹក', 'តាមកុងទ័រ', 'ថេរ', '/ខែ', 'មិនទាន់កំណត់តម្លៃ'] }[L], u = '';
    try {
      var b = c.utilityBilling || getUtilityBillingForRoom(room);
      u = ['electricity', 'water'].map(function (sv, i) {
        var it = (b && b[sv]) || {}, fixed = it.method === 'fixed', v = fixed ? it.fixedMonthly : it.unitRate;
        return W[i] + ' ' + (v == null ? W[5] : fixed ? W[3] + ' ' + m(v) + W[4] : W[2] + ' ' + m(v) + (sv === 'electricity' ? '/kWh' : '/m³'));
      }).join(', ');
    } catch (e) {}
    var d = (String(c.dueDay || '').match(/\d+/) || [])[0], due = d ? { vi: 'ngày ' + d + ' hằng tháng', en: 'on day ' + d + ' of each month', km: 'ថ្ងៃទី ' + d + ' រៀងរាល់ខែ' }[L] : String(c.dueDay || '');
    var rates = { fee: 0, utility: 0 }, flat = false;
    try { rates = window.extraPersonRates(room); flat = !!window.roomUtilityFixed(room); } catch (e) {}
    var extra = m((Number(rates.fee) || 0) + (flat ? Number(rates.utility) || 0 : 0)) + (flat && rates.utility ? { vi: ' (gồm điện nước khoán ' + m(rates.utility) + ')', en: ' (incl. flat utilities ' + m(rates.utility) + ')', km: ' (រួមទឹកភ្លើងថេរ ' + m(rates.utility) + ')' }[L] : '');
    var term = String(c.term || '').replace(/(\d+)\s*tháng/gi, function (all, n) { return L === 'en' ? n + (n === '1' ? ' month' : ' months') : L === 'km' ? n + ' ខែ' : all; });
    var map = { phong: room, khach: c.tenantName || '', thoi_han: term, tien_thue: m(c.rent), coc: m(c.deposit), han_dong: due, dien_nuoc: u,
      chu_nha: (function () { try { return ownerName(); } catch (e) { return ''; } })(), can: houseName(house), so_nguoi: String(c.occupants || 1), phu_phi: extra,
      phu_phi_cau: rates.fee > 0 || (flat && rates.utility > 0) ? { vi: '; đóng thêm ' + extra + ' mỗi người mỗi tháng, tháng đầu tính theo số ngày ở', en: '; each costs an extra ' + extra + ' per month, the first month counted by days stayed', km: '; បង់បន្ថែម ' + extra + ' ក្នុងម្នាក់ក្នុងមួយខែ ខែដំបូងគិតតាមថ្ងៃស្នាក់នៅ' }[L] : { vi: '; không thu thêm tiền', en: '; no extra charge', km: '; មិនគិតថ្លៃបន្ថែម' }[L],
      dem: String(Number(settings(house).guestNightLimit) || 14) };
    text = String(text).replace('{chu_nha} (bên cho thuê)', 'Chủ nhà (bên cho thuê)').replace('{chu_nha} (the landlord)', 'The landlord').replace('{chu_nha} (ម្ចាស់ផ្ទះ)', 'ម្ចាស់ផ្ទះ').replace(/\{phong\} – \{can\}/g, '{phong}');
    map.chu_nha = { vi: 'Chủ nhà', en: 'The landlord', km: 'ម្ចាស់ផ្ទះ' }[L] || map.chu_nha;
    return text.replace(/\{(\w+)\}/g, function (all, k) { return k in map ? map[k] : all; });
  }
  // Màn hợp đồng: thêm khung điều khoản (cuộn riêng) ngay trên dòng Trạng thái
  if (typeof window.showContract === 'function') {
    var base = window.showContract;
    window.showContract = function () {
      var r = base.apply(this, arguments);
      try {
        var sheets = document.querySelectorAll('.modal-overlay .modal-sheet'), sheet = sheets[sheets.length - 1];
        var room = (document.querySelector('#tenantRoom') || {}).innerText || '', c = (typeof getHomeContract === 'function' && getHomeContract(room)) || {};
        if (sheet && !sheet.querySelector('.contract-terms')) {
          var fresh = fill(window.contractTermsTemplate(houseOf(room)), room, c), text = c.termsText && termsStillFit(c, room) ? c.termsText : fresh;
          var rows = Array.prototype.filter.call(sheet.querySelectorAll('.tenant-kv'), function (x) { return x.textContent.trim().indexOf('Trạng thái') === 0; });
          var box = document.createElement('div');
          box.className = 'contract-terms';
          box.innerHTML = '<strong>Điều khoản</strong><div class="contract-terms-body" translate="no">' + text.split('\n').filter(Boolean).map(function (l) { return '<p>' + esc(l) + '</p>'; }).join('') + '</div>';
          (rows[0] || sheet.querySelector('.modal-actions')).insertAdjacentElement('beforebegin', box);
        }
      } catch (e) {}
      return r;
    };
  }
  // Khách ký: lưu đúng bản điều khoản đã đọc vào hợp đồng
  if (typeof window.confirmHomeContract === 'function') {
    var sign = window.confirmHomeContract;
    window.confirmHomeContract = function (room) {
      var text = (document.querySelector('.contract-terms-body') || {}).innerText || '';
      var r = sign.apply(this, arguments);
      try {
        var all = JSON.parse(localStorage.getItem('homeContracts') || '{}');
        if (text && all[room] && all[room].status === 'Đã ký' && !all[room].termsText) { all[room].termsText = text.trim(); all[room].termsFor = signedKey(all[room]); localStorage.setItem('homeContracts', JSON.stringify(all)); }
      } catch (e) {}
      return r;
    };
  }
  // ⚙ Cài đặt căn (chủ nhà): dòng "Điều khoản hợp đồng ›" mở trang sửa riêng; lưu ngay
  function logChange(id, fields) {
    if (!id || !fields.length) return;
    var st = settings(id), log = (st.log || []).slice(-49);
    log.push({ at: Date.now(), by: me(), fields: fields });
    saveHouseSettings(id, { log: log });
  }
  function openTerms(id) {
    var o = document.createElement('div'), L = lang(), drafts = {};
    o.className = 'modal-overlay';
    o.innerHTML = '<div class="modal-sheet"><div class="modal-head">Điều khoản hợp đồng</div><div class="pills terms-langs">' + [['vi', 'Tiếng Việt'], ['en', 'English'], ['km', 'ខ្មែរ']].map(function (x) { return '<button type="button" class="pill" data-terms-lang="' + x[0] + '" translate="no">' + x[1] + '</button>'; }).join('') + '</div><small class="note">Mỗi ngôn ngữ một bản: khách đọc bản theo ngôn ngữ của mình. {chu_nha} {khach} {phong} {can} {so_nguoi} {thoi_han} {tien_thue} {coc} {han_dong} {dien_nuoc} {phu_phi}: app tự điền khi khách xem.</small><textarea rows="14" class="terms-edit" translate="no"></textarea><div class="modal-actions"><button type="button" class="save" data-terms-save>Lưu</button><button type="button" data-terms-reset>Mẫu sẵn</button><button type="button" data-terms-close>Huỷ</button></div></div>';
    var box = o.querySelector('textarea');
    function show(next) { if (box.dataset.lang) drafts[box.dataset.lang] = box.value; L = next; box.dataset.lang = L; box.value = L in drafts ? drafts[L] : window.contractTermsTemplate(id, L); o.querySelectorAll('[data-terms-lang]').forEach(function (b) { b.classList.toggle('selected', b.dataset.termsLang === L); }); }
    show(L);
    (document.querySelector('.phone') || document.body).appendChild(o);
    o.addEventListener('click', function (e) {
      var pick = e.target.closest('[data-terms-lang]');
      if (pick) show(pick.dataset.termsLang);
      else if (e.target.closest('[data-terms-close]')) o.remove();
      else if (e.target.closest('[data-terms-reset]')) box.value = DEFAULT[L].join('\n');
      else if (e.target.closest('[data-terms-save]')) {
        drafts[L] = box.value;
        var next = {}, changed = false;
        ['vi', 'en', 'km'].forEach(function (k) {
          var v = k in drafts ? drafts[k].trim() : ownTerms(id, k);
          if (v === DEFAULT[k].join('\n')) v = '';
          if (v) next[k] = v;
          if (v !== ownTerms(id, k)) changed = true;
        });
        if (changed) { saveHouseSettings(id, { contractTerms: Object.keys(next).length ? next : '' }); logChange(id, ['Điều khoản hợp đồng']); }
        o.remove();
      }
    });
  }

  var LABELS = { findBonusPct: 'Thưởng tìm khách', extraPersonFee: 'Phụ thu người ở thêm', extraPersonUtility: 'Điện nước người ở thêm', cashLimit: 'Hạn mức tiền mặt', utility: 'Giá điện nước', bankBin: 'Tài khoản nhận tiền', bankAccount: 'Tài khoản nhận tiền', bankHolder: 'Tài khoản nhận tiền', abaQr: 'Mã QR ABA' };
  function snap(id) { var st = settings(id), h = {}; try { h = (readProperties() || []).find(function (x) { return x.id === id; }) || {}; } catch (e) {} return { st: st, name: h.name, address: h.address, currency: h.currency }; }
  function diff(a, b) {
    var out = [];
    if (a.name !== b.name) out.push('Tên căn');
    if (a.address !== b.address) out.push('Địa chỉ');
    if (a.currency !== b.currency) out.push('Tiền tệ');
    Object.keys(LABELS).forEach(function (k) { if (JSON.stringify(a.st[k] ?? '') !== JSON.stringify(b.st[k] ?? '') && out.indexOf(LABELS[k]) < 0) out.push(LABELS[k]); });
    return out;
  }
  function finishPending() {
    var p = null;
    try { p = JSON.parse(sessionStorage.getItem('homeHouseSettingsBefore') || 'null'); sessionStorage.removeItem('homeHouseSettingsBefore'); } catch (e) {}
    if (!p || !p.id) return;
    var f = diff(p.was, snap(p.id));
    if (f.length) logChange(p.id, f);
  }
  setTimeout(finishPending, 1500);
  new MutationObserver(function (list) {
    list.forEach(function (m) {
      m.addedNodes.forEach(function (node) {
        if (node.nodeType !== 1 || !node.classList || !node.classList.contains('modal-overlay')) return;
        setTimeout(function () {
          var form = node.querySelector('form');
          if (!form || form.dataset.termsEnhanced || !form.querySelector('[name=currency]') || !form.querySelector('[name=address]') || role() !== 'owner') return;
          form.dataset.termsEnhanced = '1';
          var choice = form.querySelector('[name=propertyChoice]'), id = function () { return choice && choice.value || form.dataset.newHouse || ''; };
          var before = id() && !form.dataset.newHouse ? snap(id()) : null; // căn mới tạo: không ghi lịch sử "đổi cài đặt"
          var maint = Array.prototype.find.call(form.querySelectorAll('a,button'), function (x) { return /^Lịch bảo trì/.test(x.textContent.trim()); });
          var anchor = form.querySelector('[name=bankHolder]') || form.querySelector('[name=address]');
          var row = document.createElement('button');
          row.type = 'button'; row.className = 'terms-row';
          row.innerHTML = '<span>Điều khoản hợp đồng</span><span>›</span>';
          row.addEventListener('click', function () { if (id()) openTerms(id()); });
          if (maint) maint.insertAdjacentElement('beforebegin', row); else anchor.insertAdjacentElement('afterend', row);
          row.hidden = !id();
          if (choice) choice.addEventListener('change', function () { row.hidden = !id(); before = id() ? snap(id()) : null; });
          form.addEventListener('submit', function () {
            var hid = id(), was = before;
            if (!hid || !was) return;
            // App có thể tải lại ngay sau khi lưu: nhớ bản trước, ghi lịch sử lúc mở lại nếu chưa kịp
            try { sessionStorage.setItem('homeHouseSettingsBefore', JSON.stringify({ id: hid, was: was })); } catch (e) {}
            setTimeout(finishPending, 300);
          });
        }, 30);
      });
    });
  }).observe(document.querySelector('.phone') || document.body, { childList: true });
  // Lịch sử: thêm các lần đổi cài đặt căn
  if (typeof window.collectHistoryItems === 'function') {
    var hist = window.collectHistoryItems;
    window.collectHistoryItems = function () {
      var items = hist.apply(this, arguments);
      try {
        if (role() !== 'owner' && role() !== 'manager') return items;
        var all = readHouseSettings(), scope = typeof workScope === 'function' ? workScope() : null;
        Object.keys(all).forEach(function (id) {
          if (scope && scope.houseOk && !scope.houseOk(id)) return;
          (all[id].log || []).forEach(function (e) {
            items.push({ type: 'room', house: id, title: houseName(id) + ' · Đổi cài đặt căn: ' + (e.fields || []).join(', '), actor: cleanActor(e.by || ''), time: e.at, target: { type: 'none' } });
          });
        });
        items.sort(function (a, b) { return (Number(b.time) || 0) - (Number(a.time) || 0); });
      } catch (e) {}
      return items;
    };
    // Màn chính đã vẽ lần đầu trước khi gắn phần này: vẽ lại một lần
    try { if (typeof renderWorkCenter === 'function' && document.getElementById('workCenter')) renderWorkCenter(); } catch (e) {}
  }
})();

// Thông báo của khách (nút Thông báo ở góc phải): việc chờ xác nhận, việc cần làm, nhắc hạn, thông báo của căn
(function () {
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function jump(el) {
    if (!el) return;
    try { go('home', document.querySelector('.tab[data-id="home"]')); } catch (e) {}
    setTimeout(function () { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); el.classList.add('work-flash'); setTimeout(function () { el.classList.remove('work-flash'); }, 2200); }, 80);
  }
  window.openTenantNotices = function () {
    var acct = (document.getElementById('accountSelect') || {}).value || '';
    if (acct.split('|')[0] !== 'tenant') return;
    var rows = [], targets = [];
    function add(title, sub, el) { targets.push(el); rows.push('<button type="button" class="work-row rb-choose bell-row" data-bell-go="' + (targets.length - 1) + '"><span class="work-main"><span class="work-title">' + esc(title) + '</span>' + (sub ? '<span class="work-sub">' + esc(sub) + '</span>' : '') + '</span><span class="work-chevron">›</span></button>'); }
    document.querySelectorAll('#tenantConfirmBox .confirm-card').forEach(function (card) {
      var t = card.querySelector('h4,h5,strong,.title'), title = (t ? t.textContent : card.textContent).trim().split('\n')[0];
      add(title.slice(0, 80), 'Cần anh/chị xác nhận', card);
    });
    Array.prototype.forEach.call(document.querySelectorAll('#tenantPriorityAlerts > *'), function (el) {
      var lines = (el.innerText || '').split('\n').map(function (x) { return x.trim(); }).filter(Boolean);
      if (lines.length) add(lines[0], lines.slice(1).join(' · ').slice(0, 90), el);
    });
    var todo = document.querySelector('#tenantTodo .todo-step.now strong');
    if (todo) add('Việc cần làm: ' + todo.textContent.trim(), '', document.getElementById('tenantTodo'));
    try { var due = tenantDueReminder(); if (due) add(due, '', document.getElementById('tenantDueCard')); } catch (err) {}
    var notices = [];
    try { notices = tenantNotices(acct).slice(0, 20); } catch (err) {}
    var o = document.createElement('div');
    o.className = 'modal-overlay';
    o.innerHTML = '<div class="modal-sheet"><div class="modal-head">Thông báo</div>' + (rows.length ? '<div class="work-list">' + rows.join('') + '</div>' : '') +
      (notices.length ? notices.map(function (n) { return noticeRow(n, { tenant: true, unread: !(n.readBy && n.readBy[acct]), read: true }); }).join('') : '') +
      (!rows.length && !notices.length ? '<p class="note">Chưa có thông báo nào.</p>' : '') +
      '<div class="modal-actions"><button type="button" data-bell-close>Đóng</button></div></div>';
    (document.querySelector('.phone') || document.body).appendChild(o);
    o.addEventListener('click', function (ev) {
      var g = ev.target.closest('[data-bell-go]');
      if (g) { o.remove(); jump(targets[Number(g.dataset.bellGo)]); return; }
      var n = ev.target.closest('.notice-item');
      if (n) n.classList.remove('unread');
      if (ev.target.closest('[data-bell-close]') || ev.target === o) o.remove();
    });
  };
})();

// Ô số (tiền, chỉ số): gõ / dán "480,5" → 480.5. Căn VND thì dấu phẩy là ngăn nghìn: "6,200,000" → 6200000
(function () {
  document.addEventListener('beforeinput', function (e) {
    var f = e.target;
    if (!(f instanceof HTMLInputElement) || f.type !== 'number') return;
    var data = e.data != null ? e.data : e.dataTransfer ? e.dataTransfer.getData('text') : null;
    if (!data || data.indexOf(',') < 0) return;
    var vnd = false;
    try { vnd = currencyCode() === 'VND'; } catch (err) {}
    var fixed = vnd ? data.replace(/,/g, '') : /,\d{3}(,|$)/.test(data) && /^\d{1,3}(,\d{3})+(\.\d+)?$/.test(data.trim()) ? data.replace(/,/g, '') : data.replace(/,/g, '.');
    e.preventDefault();
    if (!document.execCommand('insertText', false, fixed)) { f.value = (f.value || '') + fixed; f.dispatchEvent(new Event('input', { bubbles: true })); }
  }, true);
})();

// Lịch sử: dòng hợp đồng cũ mang nhãn "Chờ chủ nhà duyệt" / "Chờ người thuê ký" thì đổi sang nhãn đã xong khi bước đó xong
// (Lập hợp đồng → Đã lập, Chủ nhà duyệt → Đã duyệt). Bị từ chối thì giữ "Từ chối".
(function () {
  var STEP = { 'Chờ chủ nhà duyệt': 1, 'Chờ người thuê ký': 2, 'Đã ký': 3 };
  function fix() {
    var all, contracts, changed = false;
    try { all = JSON.parse(localStorage.getItem('homeTenantEvents') || '{}'); contracts = JSON.parse(localStorage.getItem('homeContracts') || '{}'); } catch (e) { return; }
    Object.keys(all).forEach(function (room) {
      var c = contracts[room];
      if (!c || !c.number) return;
      (all[room] || []).forEach(function (ev) {
        if (!ev || ev.kind !== 'contract' || !(ev.status in STEP) || ev.status === 'Đã ký') return;
        if (String(ev.detail || '').indexOf(c.number) < 0) return;
        var now = c.status === 'Từ chối' ? 9 : STEP[c.status] || 0;
        if (now <= STEP[ev.status]) return;
        ev.status = c.status === 'Từ chối' && ev.status === 'Chờ chủ nhà duyệt' ? 'Từ chối' : /duyệt/i.test(ev.title || '') ? 'Đã duyệt' : /^Lập/i.test(ev.title || '') ? 'Đã lập' : 'Xong';
        changed = true;
      });
    });
    if (changed) { busy = true; try { localStorage.setItem('homeTenantEvents', JSON.stringify(all)); } finally { busy = false; } try { rerenderKeepPage(); } catch (e) {} }
  }
  var busy = false, t = 0;
  var setItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function (k) { var r = setItem.apply(this, arguments); if (!busy && /home(Contracts|TenantEvents)$/.test(k)) { clearTimeout(t); t = setTimeout(fix, 50); } return r; };
  setTimeout(fix, 0);
})();

// Tên chào ở đầu màn (cạnh nút ngôn ngữ + Thông báo): dài quá thì thu chữ nhỏ dần (tới 15px) cho đủ tên rồi mới cắt (cắt đầu tên: "..uyễn Văn Tèo")
(function () {
  var queued = false;
  function fit() {
    queued = false;
    document.querySelectorAll('.head .title').forEach(function (t) {
      if (!t.offsetParent) return;
      t.style.fontSize = '';
      var size = parseFloat(getComputedStyle(t).fontSize);
      var n = t.querySelector('.greet-name') || t;
      if (n.dataset.full && n.textContent !== n.dataset.full) n.textContent = n.dataset.full;
      // Lời chào: giữ cỡ chữ như màn chủ nhà / quản lý, chỉ cắt đầu tên bằng ".."
      if (n !== t) { if (typeof window.greetFit === 'function') window.greetFit(t); return; }
      while (n.scrollWidth > n.clientWidth && size > 15) { size -= 0.5; t.style.fontSize = size + 'px'; }
    });
  }
  function queue() { if (!queued) { queued = true; requestAnimationFrame(fit); } }
  // greetFit tự đổi chữ trong .greet-name: bỏ qua thay đổi đó, không thì chạy vòng mãi
  function inName(m) { var el = m.target.nodeType === 1 ? m.target : m.target.parentElement; return !!(el && el.closest && el.closest('.greet-name')); }
  new MutationObserver(function (list) { if (!list.every(inName)) queue(); }).observe(document.body, { childList: true, subtree: true, characterData: true });
  addEventListener('resize', queue);
  queue();
})();

// Duyệt khoản chi: hiện đủ thông tin (số tiền, tính cho đâu, ai ghi, lúc nào, ghi chú, hoá đơn, đề xuất / sửa chữa liên quan, chi tháng này của căn) để yên tâm bấm Duyệt
(function () {
  function monthOf(r) { var m = String(r.date || r.createdAt || '').match(/(\d{1,2})\/(\d{4})\s*$/); return m ? Number(m[1]) + '/' + m[2] : ''; }
  window.openExpenseReview = function (item, onOk, nextStep) {
    var records = [];
    try { records = readExpenseRecords(); } catch (e) { return false; }
    var r = records.find(function (x) { return x.id === item.target.id; });
    if (!r) return false;
    var house = r.propertyId || item.house, money = function (v) { return amountForHouse(Number(v) || 0, house); };
    var limit = 0; try { limit = expenseLimit(house); } catch (e) {}
    var req = null; try { if (r.requestId) req = readSpendRequests().find(function (q) { return q.id === r.requestId; }); } catch (e) {}
    var month = monthOf(r), spent = records.filter(function (x) { return x.status === 'Đã duyệt' && (x.propertyId || '') === (r.propertyId || '') && monthOf(x) === month; })
      .reduce(function (a, x) { return a + (Number(x.amount) || 0); }, 0);
    var peers = Array.isArray(r.peerApprovedBy) ? r.peerApprovedBy.join(', ') : (r.peerApprovedBy || '');
    appConfirm('Duyệt khoản chi?', String(nextStep || '').replace(/^\.\s*/, ''), 'Duyệt', onOk, false, {
      big: money(r.amount), sub: r.name || item.title,
      rows: [
        ['Căn', houseName(house)],
        ['Tính cho', r.room ? 'Phòng ' + r.room : (r.scope || 'Chi phí chung')],
        ['Ngày chi', r.date],
        ['Người ghi', r.createdBy ? r.createdBy + (r.createdAt ? ' · ' + ciTime(r.createdAt) : '') : ''],
        ['Ghi chú', r.note],
        r.source === 'repair' ? ['Từ sửa chữa', r.tenantConfirmedBy ? 'Khách ' + r.tenantConfirmedBy + ' đã xác nhận sửa xong' : 'Có'] : null,
        req ? ['Theo đề xuất chi', 'Đã duyệt trước · tối đa ' + money(req.maxAmount)] : null,
        ['Đã duyệt', peers],
        r.receipt ? null : ['Hoá đơn', limit && Number(r.amount) > limit ? 'Chưa có ảnh (khoản trên ' + money(limit) + ' cần ảnh)' : 'Không có ảnh'],
        ['Chi tháng ' + month + ' của căn', money(spent) + ' → ' + money(spent + (Number(r.amount) || 0))]
      ],
      photos: r.receipt ? [r.receipt] : [], photoLabel: 'Hoá đơn'
    });
    return true;
  };
})();

// Sửa chữa: Tiếp nhận thì phải hẹn ngày sửa (khách và chủ nhà thấy ngày hẹn, quá hẹn chuyển đỏ);
// mỗi bước ghi Lịch sử; việc quản lý đã nhận thì chủ nhà chỉ theo dõi, không có nút
(function () {
  var DAY = 864e5;
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function iso(ms) { var d = new Date(ms); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function findEvent(room, id) { return ((readTenantEventsSafe()[room]) || []).find(function (e) { return e.id === id; }); }
  function assetOf(e) { try { return repairAssetName(e); } catch (x) { return String(e.title || '').replace(/^Đã báo hư hỏng:\s*/, ''); } }
  function openSchedule(room, id, again) {
    var ev = findEvent(room, id);
    if (!ev) return;
    var o = document.createElement('div');
    o.className = 'modal-overlay';
    var info = window.repairInfoHtml ? window.repairInfoHtml(room, id, 'accept') : '';
    o.innerHTML = (window.repairInfoCss || '') + '<form class="modal-sheet rp-accept" novalidate style="max-height:80vh;overflow:auto"><div class="modal-head">' + (again ? 'Hẹn lại ngày sửa' : 'Tiếp nhận sửa chữa') + ' · ' + esc(room) + '</div>' + info +
      (again && ev.repairDate ? '<div class="tenant-kv"><span>Đang hẹn</span><strong>' + esc((ev.acceptedBy ? ev.acceptedBy + ' hẹn ' : '') + viDate(ev.repairDate) + (function () { var l = Math.round((dayStart() - dayStart(ev.repairDate)) / DAY); return l > 0 ? ' · quá hẹn ' + l + ' ngày' : ''; })()) + '</strong></div>' : '') +
      '<label>Ngày hẹn sửa</label><input type="date" name="day" data-req min="' + iso(Date.now()) + '" value="' + iso(ev.repairDate && ev.repairDate > Date.now() ? ev.repairDate : Date.now() + DAY) + '">' +
      '<label>Ghi chú cho khách (không bắt buộc)</label><input name="note" maxlength="200" placeholder="Ví dụ: thợ đến khoảng 9 giờ sáng" value="' + esc(ev.repairPlanNote || '') + '">' +
      '<p class="user-error" hidden></p><div class="modal-actions"><button type="button" data-close>Huỷ</button><button type="submit" class="save">' + (again ? 'Lưu ngày hẹn' : 'Tiếp nhận') + '</button></div></form>';
    (typeof appendToPhone === 'function' ? appendToPhone : function (el) { document.querySelector('.phone').appendChild(el); })(o);
    var f = o.querySelector('form');
    o.querySelector('[data-close]').onclick = function () { o.remove(); };
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!f.day.value) { var er = f.querySelector('.user-error'); er.textContent = 'Chọn ngày hẹn sửa.'; er.hidden = false; return; }
      var day = new Date(f.day.value + 'T00:00').getTime(), note = f.note.value.trim(), who = currentActorName(), now = new Date().toLocaleString('vi-VN');
      if (day < dayStart(Date.now()) || day > Date.now() + 90 * DAY) { var er2 = f.querySelector('.user-error'); er2.textContent = day < Date.now() ? 'Ngày hẹn không được trước hôm nay.' : 'Ngày hẹn tối đa 90 ngày tới.'; er2.hidden = false; return; }
      if (!again) baseAck(room, id);
      var label = '';
      updateTenantEvent(room, id, function (x) {
        label = assetOf(x);
        if (!again) x.acceptedAt = now;
        x.acceptedBy = x.acceptedBy || who;
        x.repairDate = day; x.repairPlanNote = note || undefined;
        x.detail = String(x.detail || '').replace(/ · hẹn sửa [^·]*/g, '') + ' · hẹn sửa ' + viDate(day) + (note ? ' (' + note + ')' : '');
      });
      appendRoomHistory(room, { kind: 'repair-note', repairId: id, title: (again ? 'Hẹn lại ngày sửa: ' : 'Tiếp nhận sửa: ') + label + ' · hẹn ' + viDate(day), detail: note, status: 'Đã tiếp nhận', actor: who });
      o.remove();
      try { renderManagementOverview(); } catch (x) {}
      try { renderWorkCenter(); } catch (x) {}
      try { appToast((again ? 'Đã đổi ngày hẹn: ' : 'Đã tiếp nhận, hẹn sửa ') + viDate(day) + '. Khách sẽ thấy ngày hẹn.'); } catch (x) {}
    });
  }
  window.openRepairSchedule = openSchedule;
  var baseAck = ackTenantRequest;
  ackTenantRequest = function (room, id) {
    var ev = findEvent(room, id);
    if (ev && ev.kind === 'repair' && (!ev.status || ev.status === 'Chờ xử lý')) return openSchedule(room, id, false);
    return baseAck.apply(this, arguments);
  };
  var baseCollect = collectWorkItems;
  collectWorkItems = function () {
    var items = baseCollect.apply(this, arguments), scope = workScope();
    items.forEach(function (it) {
      if (it.type !== 'repair' || !it.room) return;
      var name = String(it.title || '').split(' · ').slice(1).join(' · ').replace(/^Báo hư:\s*/, '');
      var ev = ((readTenantEventsSafe()[it.room]) || []).find(function (e) { return e.kind === 'repair' && e.status === 'Đã tiếp nhận' && (e.asset || String(e.title || '').replace(/^Đã báo hư hỏng:\s*/, '')) === name; });
      if (!ev) return;
      var late = ev.repairDate ? Math.round((dayStart() - dayStart(ev.repairDate)) / DAY) : 0;
      var plan = ev.repairDate ? (ev.acceptedBy ? ev.acceptedBy + ' hẹn sửa ' : 'Hẹn sửa ') + viDate(ev.repairDate) + (late > 0 ? ' · quá hẹn ' + late + ' ngày' : late === 0 ? ' · hôm nay' : '') : 'chưa hẹn ngày sửa';
      if (late > 0) it.urgent = true;
      var mine = !ev.acceptedBy || ev.acceptedBy === scope.name || scope.role !== 'owner' || ev.acceptedBy === ownerName();
      if (!mine) {
        it.sub = [ev.tenantName ? ev.tenantName + ' gửi' : '', plan, ev.tenantRejectReason ? 'khách báo chưa xong: ' + ev.tenantRejectReason : ''].filter(Boolean).join(' · ');
        it.actions = [];
        return;
      }
      it.sub = [ev.tenantName ? ev.tenantName + ' gửi' : '', plan, ev.tenantRejectReason ? 'khách báo chưa xong: ' + ev.tenantRejectReason : ''].filter(Boolean).join(' · ');
      var acts = (it.actions || []).filter(function (a) { return a.label !== 'Hẹn ngày sửa' && a.label !== 'Hẹn lại'; });
      if (!ev.repairDate) acts.unshift({ label: 'Hẹn ngày sửa', run: function () { openSchedule(it.room, ev.id, true); } });
      else if (late > 0) acts.push({ label: 'Hẹn lại', run: function () { openSchedule(it.room, ev.id, true); } });
      it.actions = acts;
    });
    return items;
  };
  try { renderWorkCenter(); } catch (e) {}
})();

// Màn khách dựng lại theo kiểu màn quản lý (12/11, agent phản biện + anh chốt):
// đầu trang → một dòng tiền gọn → "Việc cần làm" (số đỏ, mọi việc khách phải làm/theo dõi là một dòng) → nút Báo hư + Khác
// → dòng "Vi phạm nội quy · N lần" → "Lịch sử" chỉ việc của khách, mới nhất trên, 5 dòng + Xem tất cả (gộp biên lai, góp ý).
// Các thẻ cũ vẫn nằm trong DOM (ẩn) để giữ nguyên chức năng; nút mới bấm hộ nút cũ, thẻ cần xem thì mở trong bảng.
(function () {
  var DAY = 864e5, handlers = [], showAll = false;
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function txt(el) { return el ? String(el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim() : ''; }
  function on(fn) { handlers.push(fn); return handlers.length - 1; }
  // Không lặp: bỏ năm hiện tại, bỏ nhãn loại (chấm màu đã nói), bỏ phần dòng dưới đã có ở tiêu đề hoặc trùng nhau
  function tidy(title, sub) {
    var y = '/' + new Date().getFullYear(), seen = {};
    title = String(title || '').split(y).join('');
    var low = title.toLocaleLowerCase('vi');
    sub = String(sub || '').split(y).join('').split(' · ').filter(function (p) {
      p = p.trim(); var k = p.toLocaleLowerCase('vi');
      if (!p || seen[k] || /^(Sửa chữa|Thanh toán|Hợp đồng|Thông báo của căn)$/.test(p) || low.indexOf(k) >= 0) return false;
      seen[k] = 1; return true;
    });
    if (sub.some(function (p) { return /quá hạn \d+ ngày/i.test(p); })) sub = sub.filter(function (p) { return !/^\d{1,2}\/\d{1,2}$/.test(p.trim()); });
    sub = sub.join(' · ');
    return [title, sub];
  }
  // Bấm dòng báo hư (của mình hay người ở cùng) mở chi tiết như bên chủ nhà
  function repairOpen(room, name) { var e = (events(room) || []).filter(function (x) { return x && x.kind === 'repair' && (x.asset || String(x.title || '').replace(/^Đã báo hư hỏng:\s*/, '')) === name; })[0]; return e && window.openRepairDetail ? function () { window.openRepairDetail(room, e.id); } : null; }
  function row(dot, title, sub, btn, fn, extra) {
    var id = fn ? on(fn) : -1, clean = tidy(title, sub);
    title = clean[0]; sub = clean[1];
    return '<div class="work-row th-row' + (extra && extra.urgent ? ' urgent' : '') + '"' + (id >= 0 ? ' data-th="' + id + '" role="button" tabindex="0"' : '') + '><span class="work-dot dot-' + dot + '"></span><span class="work-main"><span class="work-title">' + esc(title) + '</span>' + (sub ? '<span class="work-sub">' + esc(sub) + '</span>' : '') + '</span>' +
      (extra && extra.amount ? '<span class="th-amount">' + esc(extra.amount) + '</span>' : '') +
      (btn ? '<button type="button" class="work-action" data-th="' + id + '">' + esc(btn) + '</button>' : (id >= 0 ? '<span class="work-chevron">›</span>' : '')) + '</div>';
  }
  // Mở một thẻ cũ trong bảng (giữ nguyên nút và sự kiện của thẻ), đóng thì trả thẻ về chỗ cũ
  function sheet(el, title) {
    if (!el) return;
    // Thẻ trong #tenantConfirmBox: nút của thẻ được bắt ở khung đó, nên đưa cả khung vào bảng và chỉ hiện thẻ này
    var pick = null, cbox = el.closest && el.closest('#tenantConfirmBox');
    if (cbox && cbox !== el) { pick = el; el = cbox; pick.classList.add('th-pick'); el.classList.add('th-only'); }
    var home = el.parentNode, next = el.nextSibling, o = document.createElement('div');
    o.className = 'modal-overlay';
    o.innerHTML = '<div class="modal-sheet th-sheet">' + (title ? '<div class="modal-head">' + esc(title) + '</div>' : '') + '<div class="th-sheet-body"></div><div class="modal-actions"><button type="button" data-th-close>Đóng</button></div></div>';
    o.querySelector('.th-sheet-body').appendChild(el);
    el.classList.add('th-in-sheet');
    var mo = null;
    function close() { if (mo) mo.disconnect(); el.classList.remove('th-in-sheet', 'th-only'); if (pick) pick.classList.remove('th-pick'); if (home && home.isConnected) home.insertBefore(el, next && next.parentNode === home ? next : null); o.remove(); }
    // Bấm xong (thẻ biến mất khỏi khung) thì tự đóng bảng
    if (pick) { mo = new MutationObserver(function () { if (!el.contains(pick)) close(); }); mo.observe(el, { childList: true, subtree: true }); }
    o.addEventListener('click', function (e) { if (e.target === o || e.target.closest('[data-th-close]')) close(); });
    (typeof appendToPhone === 'function' ? appendToPhone : function (x) { document.querySelector('.phone').appendChild(x); })(o);
  }
  function list(title, buttons) {
    var o = document.createElement('div');
    o.className = 'modal-overlay';
    o.innerHTML = '<div class="modal-sheet"><div class="modal-head">' + esc(title) + '</div><div class="work-list">' + buttons.map(function (b, i) { return '<button type="button" class="work-row rb-choose" data-k="' + i + '"><span class="work-main"><span class="work-title">' + esc(txt(b)) + '</span></span><span class="work-chevron">›</span></button>'; }).join('') + '</div><div class="modal-actions"><button type="button" data-th-close>Đóng</button></div></div>';
    o.addEventListener('click', function (e) { var k = e.target.closest('[data-k]'); if (k) { o.remove(); buttons[Number(k.dataset.k)].click(); return; } if (e.target === o || e.target.closest('[data-th-close]')) o.remove(); });
    (typeof appendToPhone === 'function' ? appendToPhone : function (x) { document.querySelector('.phone').appendChild(x); })(o);
  }
  function events(room) { try { return readTenantEventsSafe()[room] || []; } catch (e) { return []; } }
  function stamp(e) { var m = String(e && e.id || '').match(/^(\d{13})/); return m ? Number(m[1]) : 0; }
  function vt(v) { try { return parseViTime(v) || 0; } catch (e) { return 0; } }
  function nm(v) { return String(v || '').normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase(); }
  // Tab Yêu cầu của khách: nút ở thanh dưới (giữa Phòng của tôi và Hợp đồng) + trang riêng
  function reqBox(html, show) {
    var tabs = document.querySelector('.tabs'), rooms = tabs && tabs.querySelector('.tab[data-id="rooms"]');
    if (!tabs || !rooms) return;
    var tab = tabs.querySelector('.tab[data-id="requests"]');
    if (!tab) { tab = document.createElement('button'); tab.type = 'button'; tab.className = 'tab'; tab.dataset.id = 'requests'; tab.innerHTML = '<i>✎</i>Yêu cầu'; tab.addEventListener('click', function () { go('requests', tab); }); rooms.insertAdjacentElement('beforebegin', tab); }
    var page = document.getElementById('requests');
    if (!page) { page = document.createElement('section'); page.className = 'subpage'; page.id = 'requests'; page.innerHTML = '<div id="tenantReq"></div>'; document.getElementById('home').insertAdjacentElement('afterend', page); }
    document.body.classList.toggle('tr-on', !!show);
    if (!show && page.classList.contains('active')) { var h = document.querySelector('.tab[data-id="home"]'); if (h) go('home', h); }
    var box = page.querySelector('#tenantReq');
    if (box.dataset.html !== html) { box.dataset.html = html; box.innerHTML = html; }
  }
  function short(d) { var m = String(d || '').match(/(\d{1,2})\/(\d{1,2})\/\d{4}/); return m ? m[1].padStart(2, '0') + '/' + m[2].padStart(2, '0') : String(d || ''); }
  function render() {
    var portal = document.getElementById('tenantPortal'), sel = document.getElementById('accountSelect');
    if (!portal || !sel) return;
    var acct = String(sel.value || '').split('|');
    var box = document.getElementById('tenantHome2');
    if (acct[0] !== 'tenant') { if (box) box.remove(); portal.classList.remove('th2'); reqBox('', false); return; }
    var room = acct[2], c = null; try { c = getHomeContract(room); } catch (e) {}
    handlers = [];
    // Người ở cùng đã được ghi dọn đi (hoặc hợp đồng phòng đã lập cho khách khác): không còn xem được phòng
    if ((window.__tenantLeft && !c) || (window.roommateLeftEntry && window.roommateLeftEntry(acct.join('|')))) {
      var gone = '<div class="work-section th-section"><div class="work-empty">Anh/chị không còn ở phòng ' + esc(room) + '. Lịch sử thuê vẫn được giữ. Muốn xoá tài khoản thì bấm vào logo ở góc trái.</div></div>';
      if (!box) { box = document.createElement('div'); box.id = 'tenantHome2'; (portal.querySelector(':scope > .head') || portal.firstElementChild).insertAdjacentElement('afterend', box); }
      if (box.dataset.html !== gone) { box.dataset.html = gone; box.innerHTML = gone; }
      if (!portal.classList.contains('th2')) portal.classList.add('th2');
      if (!portal.classList.contains('th-gone')) portal.classList.add('th-gone');
      reqBox('', false);
      return;
    }
    if (portal.classList.contains('th-gone')) portal.classList.remove('th-gone');
    var todo = [], H = '';
    // 1) Việc cần làm
    var cb = document.getElementById('tenantConfirmBox');
    if (cb) cb.querySelectorAll('.confirm-card').forEach(function (card) {
      // Thẻ "Đã báo trả phòng": không phải việc khách bấm, là đang chờ quản lý → một dòng đang chờ, Xem để huỷ nếu cần
      if (card.querySelector('[data-moveout-cancel]')) {
        var w = window.waitingSteps ? window.waitingSteps().filter(function (o) { return o.room === room && /^Báo trả phòng/.test(o.subject); })[0] : null;
        todo.push(row('room', w ? w.subject : txt(card.querySelector('.tenant-title')), w ? w.subBy : 'Đang chờ quản lý kiểm tra phòng', 'Xem', function () { sheet(card, ''); }, { urgent: w && w.late }));
        return;
      }
      var t = card.querySelector('h4,h5,strong,.title') || card.querySelector('.tenant-title'); var tt = txt(t);
      // Người ở cùng: chỉ xác nhận việc sửa mình báo (thẻ có thể vẽ trước khi biết là người ở cùng → lọc lại ở đây)
      try {
        var mm = window.roommateEntry && window.roommateEntry(acct.join('|'));
        if (mm && !(window.isDelegateFor && window.isDelegateFor(room))) {
          card.querySelectorAll('.confirm-item').forEach(function (it) { var b = it.querySelector('[data-repair-ok]'), ev = b && (readTenantEventsSafe()[room] || []).find(function (x) { return x && String(x.id) === b.getAttribute('data-repair-ok'); }); if (b && !(ev && nm(ev.tenantName) === nm(acct[1]))) it.remove(); });
          if (card.querySelector('.tenant-asset-count')) card.querySelector('.tenant-asset-count').textContent = card.querySelectorAll('.confirm-item').length;
          if (!card.querySelector('.confirm-item') && /Cần anh\/chị xác nhận/.test(txt(card.querySelector('.tenant-title')))) { card.remove(); return; }
        }
      } catch (x) {}
      var rok = card.querySelector('[data-repair-ok]');
      if (rok) {
        // Mỗi việc sửa chờ xác nhận một dòng, dòng nào cũng có người gửi và nút Xem (tester 17/11: chỉ dòng đầu đủ)
        var pushed = 0;
        card.querySelectorAll('[data-repair-ok]').forEach(function (bt) {
          var re = null; try { re = (readTenantEventsSafe()[room] || []).find(function (x) { return x && x.id === bt.getAttribute('data-repair-ok'); }); } catch (x) {}
          if (!re) return;
          var rw = re.asset || String(re.title || '').replace(/^Đã báo hư hỏng:\s*/, ''), item = bt.closest('.confirm-item');
          todo.push(row('repair', 'Báo hư: ' + rw, [re.tenantName ? re.tenantName + ' gửi' : '', (re.fixedBy ? re.fixedBy + ' đã sửa xong' : 'Đã sửa xong') + ' · cần anh/chị xác nhận'].filter(Boolean).join(' · '), 'Xem', function () { sheet(card, ''); setTimeout(function () { try { var ov = document.querySelectorAll('.modal-overlay'), last = ov[ov.length - 1], same = last && Array.prototype.find.call(last.querySelectorAll('[data-repair-ok]'), function (b2) { return b2.getAttribute('data-repair-ok') === re.id; }); if (same) same.closest('.confirm-item').scrollIntoView({ block: 'center' }); } catch (x) {} }, 120); }, { urgent: true }));
          pushed++;
        });
        if (pushed) return;
      }
      if (/^Hoàn trả tiền cọc/.test(txt(card.querySelector('.tenant-title'))) && !card.querySelector('[data-checkout-ok]')) return; todo.push(row('handover', tt || 'Cần xác nhận', card.querySelector('[data-checkout-ok]') ? (function () { var r = null; try { r = readCheckouts()[room]; } catch (e) {} var by = r ? ((r.log && r.log[0] && r.log[0].by) || r.createdBy || '') : '', at = r ? (r.updatedAt || r.createdAt || '') : ''; return [by ? by + ' gửi' : '', 'Kiểm tra số hoàn cọc rồi xác nhận', at ? 'từ ' + String(at).split(' ')[0].slice(0, 5) + ' ' + short(String(at).split(' ').pop()) : ''].filter(Boolean).join(' · '); })() : /hư|sửa/i.test(tt) || card.querySelector('[data-repair-ok]') ? 'Đã sửa xong · cần anh/chị xác nhận' : 'Cần anh/chị xác nhận', 'Xem', function () { sheet(card, ''); })); });
    // Người ở cùng: không ký, không gia hạn, không trả phòng thay khách chính
    var mate = window.roommateEntry ? window.roommateEntry(acct.join('|')) : null;
    if (mate && window.householdMoveOutNote) { var mo2 = window.householdMoveOutNote(room); if (mo2) todo.push(row('room', mo2.title, mo2.sub, mo2.btn, mo2.run, { urgent: !!mo2.btn })); }
    if (window.householdTenantTodo) window.householdTenantTodo(room).forEach(function (x) { todo.push(row(x.kind || 'contract', x.title, x.sub, x.btn || '', x.run || null, { urgent: !!x.urgent })); });
    if (mate && mate.p.leftRequest && !mate.p.leftRequest.self) todo.push(row('room', mate.p.leftRequest.by + ' báo anh/chị đã dọn đi', 'Còn ở thì bấm Xem → Tôi vẫn ở', 'Xem', function () { window.openHousehold(room); }, { urgent: true }));
    var lease = document.getElementById('tenantLeaseChoice');
    if (!mate && lease && txt(lease)) todo.push(row('contract', txt(lease.querySelector('.tenant-title,strong')) || 'Hợp đồng sắp hết hạn', 'Chọn gia hạn hoặc trả phòng', 'Xem', function () { sheet(lease, ''); }));
    var td = document.getElementById('tenantTodo');
    if (td && !mate) {
      var steps = td.querySelectorAll('.todo-step'), now = td.querySelector('.todo-step.now'), idx = Array.prototype.indexOf.call(steps, now) + 1;
      if (now) { var tb = now.querySelector('button'); todo.push(row('contract', txt(now.querySelector('strong')), [txt(now.querySelector('small')), 'bước ' + idx + '/' + steps.length].filter(Boolean).join(' · '), tb ? txt(tb) : '', tb ? function () { tb.click(); } : null)); }
    }
    var due = document.getElementById('tenantDueCard'), amtEl = document.getElementById('tenantDueAmount');
    var amt = amtEl ? Number(String(amtEl.textContent).replace(/[^\d.]/g, '')) || 0 : 0;
    // Thẻ đang ở "Kỳ tới · Chưa có khoản cần thanh toán": số trong thẻ là dự kiến, đầu trang không ghi "Cần đóng" (tester 19/11)
    if (due && (due.hidden || /Chưa có khoản cần thanh toán/.test(due.textContent || ''))) amt = 0;
    var pay = Array.prototype.find.call(portal.querySelectorAll('.tenant-actions button'), function (b) { return /thanh toán/i.test(b.textContent); });
    var pendPay = window.tenantPendingPayment ? window.tenantPendingPayment(room) : null;
    var reported = !!pendPay || (pay && /^Đã báo thanh toán/.test(pay.textContent.trim()));
    var lastPay = (((window.readTenantEventsSafe ? window.readTenantEventsSafe() : {})[room]) || []).filter(function (e) { return e && e.kind === 'payment' && e.status !== 'Đã huỷ'; })[0];
    var rejectedPay = !reported && lastPay && lastPay.status === 'Từ chối';
    // Tiêu đề chỉ tên khoản; tiền, hạn, khoản sắp tới xuống dòng dưới (không lặp số tiền)
    var dueBits = txt(document.getElementById('tenantDueCopy')).split(' · Sắp tới: ');
    // Hợp đồng chưa ký / chưa duyệt thì chưa có khoản nào phải đóng (cọc + kỳ đầu đóng sau khi nhận phòng)
    var unsigned = c && /^(Chờ người thuê ký|Chờ chủ nhà duyệt|Từ chối)/.test(c.status || '');
    if (due && !due.hidden && amt > 0 && !unsigned) todo.push(row('payment', dueBits[0].replace(/\s*(\$[\d.,]+|[\d.,]+\s*₫)/g, '').replace(/Điện nước khoán (tháng \S+) \((điện|nước)\)/gi, function (m, a, b) { return 'Tiền ' + b.toLowerCase() + ' khoán ' + a; }) || 'Khoản cần đóng', [amtEl.textContent.trim(), reported ? (function () {
      // Ghi số đã báo, chờ ai, và phần chưa báo (khoản mới sinh sau lúc báo vẫn phải đóng) (tester 17/11)
      var rep = 0; try { rep = pendPay ? (Number(eventAmount(pendPay)) || 0) : 0; } catch (x) {}
      var mgr = ''; try { mgr = readRoomManagerAssignments()[room] || ''; } catch (x) {}
      var total = 0; try { total = Number(String(amtEl.textContent).replace(/[^\d.]/g, '')) || 0; } catch (x) {}
      var h = ''; try { h = propertyIdForRoom(room); } catch (x) {}
      return 'đã báo' + (rep ? ' ' + amountForHouse(rep, h) : '') + (pendPay && pendPay.date ? ' ' + String(pendPay.date).slice(0, 5) : '') + ' · chờ ' + (mgr ? mgr + ' ' : '') + 'xác nhận' + (rep && total > rep + 0.005 ? ' · còn ' + amountForHouse(total - rep, h) + ' chưa báo' : '');
    })() : rejectedPay ? 'bị từ chối' + (lastPay.rejectedBy ? ' bởi ' + lastPay.rejectedBy : '') + ': ' + (lastPay.rejectReason || '') : txt(due.querySelector('small')).replace(/^KHOẢN THANH TOÁN · /i, ''), dueBits[1] ? 'sắp tới: ' + dueBits[1] : ''].filter(Boolean).join(' · '), !pay || pay.hidden ? '' : reported ? 'Xem' : rejectedPay ? 'Báo lại' : 'Thanh toán', !pay ? null : function () { pay.click(); }, { urgent: !reported && due.classList.contains('late') }));
    var pa = document.getElementById('tenantPriorityAlerts');
    if (pa) pa.querySelectorAll('.tenant-priority-item').forEach(function (it) {
      var head = txt(it.querySelector('strong')), body = txt(it.querySelector('span')), repair = it.classList.contains('repair');
      var parts = body.split(' · ');
      if (repair && todo.some(function (h) { return h.indexOf('>' + esc(parts[0]) + '<') >= 0 || h.indexOf('>Báo hư: ' + esc(parts[0]) + '<') >= 0; })) return;
      if (repair && mate && !events(room).some(function (e) { return e && e.kind === 'repair' && String(e.title || '').replace(/^Đã báo hư hỏng:\s*/, '') === parts[0] && nm(e.tenantName) === nm(acct[1]); })) return; // đã có dòng cần xác nhận cùng việc
      // Việc sửa đang làm đã có ở Đang xử lý (theo dữ liệu mới nhất); khung cảnh báo cũ có thể chưa vẽ lại
      if (repair && events(room).some(function (e) { return e && e.kind === 'repair' && String(e.title || '').replace(/^Đã báo hư hỏng:\s*/, '') === parts[0] && e.status !== 'Chờ khách xác nhận'; })) return;
      if (/bàn giao/i.test(head) && todo.some(function (h) { return h.indexOf('biên bản giao phòng') >= 0; })) return; // bước Nhận phòng đã có nút xem biên bản
      var ws = repair && window.waitingSteps ? window.waitingSteps().filter(function (o) { return o.room === room && o.type === 'repair' && o.asset === parts[0] && o.show.indexOf('tenant') >= 0; })[0] : null;
      todo.push(repair ? row('repair', 'Báo hư: ' + parts[0], ws ? ws.subBy : parts.slice(1).join(' · ') || 'Đang xử lý', '', repairOpen(room, parts[0]), { urgent: ws && ws.late }) : row(it.classList.contains('expiring') ? 'contract' : 'room', head, body, '', null, { urgent: /quá hạn|trễ/i.test(head + body) }));
    });
    var vio = document.getElementById('tenantViolations'), vItems = vio ? vio.querySelectorAll('.notice-item') : [];
    var unseen = Array.prototype.filter.call(vItems, function (n) { return /Chờ khách xem/.test(n.textContent); });
    if (unseen.length && (!mate || (window.isDelegateFor && window.isDelegateFor(room)))) todo.push(row('room', 'Biên bản vi phạm mới', unseen.length + ' biên bản chưa xem', 'Xem', function () { sheet(vio, ''); }, { urgent: true }));
    var nt = document.getElementById('tenantNotices');
    // Bấm Xem ở Việc cần làm là đã xem (trước đây phải bấm thêm vào thẻ thông báo nên dòng việc còn mãi)
    if (nt) nt.querySelectorAll('.notice-item.unread').forEach(function (n) { todo.push(row('notice', txt(n.querySelector('h5,strong,b,h4')) || 'Thông báo mới', 'Thông báo của căn', 'Xem', function () {
      n.click();
      try { renderTenantNotices(); } catch (e) {}
      sheet(document.getElementById('tenantNotices') || nt, '');
    })); });
    // Khiếu nại: chủ nhà đã trả lời mà khách chưa mở xem (khiếu nại trả lời trước 13/11 coi như đã xem)
    try { readComplaints().forEach(function (cm) {
      if (cm.tenantKey !== acct.join('|') || cm.status !== 'Đã trả lời' || cm.tenantSeenAt || vt(cm.repliedAt) < new Date(2026, 10, 13).getTime()) return;
      todo.push(row('complaint', 'Chủ nhà đã trả lời góp ý', [cm.reply, cm.repliedAt ? short(String(cm.repliedAt).split(' ').pop()) : ''].filter(Boolean).join(' · '), 'Xem', function () { complaintReply(cm); }));
    }); } catch (e) {}
    // Góp ý về app khách đã gửi, chưa xong: vẫn là việc đang theo dõi (tới khi chủ nhà trả lời xong và khách đã đọc)
    if (window.appFeedbackTodo) window.appFeedbackTodo().forEach(function (f) { var a = f.actions[0]; todo.push(row('feedback', f.title, f.sub, a ? a.label : '', function () { var u = currentAppUser(); if (u) openAppFeedback(u); })); });
    // Bước đang chờ quản lý / chủ nhà làm: khách cũng thấy đang chờ ai
    if (window.waitingSteps) window.waitingSteps().forEach(function (o) {
      if (o.room !== room || o.show.indexOf('tenant') < 0) return;
      if (mate && !(o.type === 'repair' || o.type === 'complaint' || /^Báo có người ở lại/.test(o.subject))) return; // người ở cùng: chỉ theo dõi việc mình gửi (báo hư, góp ý, người ở lại), không theo dõi việc hợp đồng của khách chính
      // Góp ý / khiếu nại và báo người ở lại là việc riêng của người gửi: chỉ người gửi thấy dòng chờ (tester 17/11: khách chính thấy khiếu nại riêng của người ở cùng)
      if ((o.type === 'complaint' || /^Báo có người ở lại/.test(o.subject)) && nm(o.by) !== nm(acct[1])) return;
      if (mate && o.type === 'repair' && nm(o.by) !== nm(acct[1])) return;
      if (todo.some(function (h) { return h.indexOf(esc(tidy(o.subject, '')[0])) >= 0; })) return;
      todo.push(row(o.type === 'repair' ? 'repair' : o.type === 'room' ? 'room' : 'contract', o.subject, o.subBy, '', o.type === 'repair' && o.asset ? repairOpen(room, o.asset) : null, { urgent: o.late }));
    });
    // 2) Dòng tiền
    var rent = txt(document.getElementById('tenantRent')), dd = (txt(document.getElementById('tenantDueDay')).match(/\d+/) || [])[0];
    if (c && c.status === 'Đã ký' && rent && !(td && td.querySelector('.todo-step.now'))) {
      var nextTxt = '';
      if (dd) { var d = new Date(), n = new Date(d.getFullYear(), d.getMonth(), Number(dd)); if (n.getTime() < d.setHours(0, 0, 0, 0) + 1 || amt <= 0) n = new Date(n.getFullYear(), n.getMonth() + (n.getTime() <= Date.now() || amt <= 0 ? 1 : 0), Number(dd)); nextTxt = String(n.getDate()).padStart(2, '0') + '/' + String(n.getMonth() + 1).padStart(2, '0'); }
      var repSum = 0; try { (readTenantEventsSafe()[room] || []).forEach(function (e) { if (e && e.kind === 'payment' && (!e.status || e.status === 'Chờ xử lý')) repSum += Number(eventAmount(e)) || 0; }); } catch (x) {}
      H += '<div class="th-money"><span>Tiền thuê <b>' + esc(rent) + '</b>/tháng</span><span class="' + (amt > 0 && repSum < amt - 0.005 ? 'th-due' : 'th-ok') + '">' + (amt > 0 ? (repSum >= amt - 0.005 ? 'Đã báo ' + esc(amtEl.textContent.trim()) + ' · chờ xác nhận' : 'Cần đóng ' + esc(amtEl.textContent.trim()) + (repSum > 0.005 ? ' · đã báo ' + esc(amountForHouse(repSum, propertyIdForRoom(room))) : '')) : 'Đã đóng đủ' + (nextTxt ? ' · kỳ sau ' + nextTxt : '')) + '</span></div>';
    }
    // Góp ý: nút nhỏ cạnh tiêu đề Việc cần làm, giống chủ nhà / quản lý (không nằm trong Khác)
    var fbBtn = portal.querySelector('.tenant-actions [data-complaint-open]');
    H += '<div class="work-section th-section"><div class="work-head"><span>Việc cần làm</span><span class="work-count' + (todo.length ? ' urgent' : '') + '">' + todo.length + '</span>' +
      (fbBtn ? '<button type="button" class="notice-open app-fb-open" data-th="' + on(function () { fbBtn.click(); }) + '">Góp ý</button>' : '') + '</div>' +
      (todo.length ? '<div class="work-list">' + todo.join('') + '</div>' : '<div class="work-empty">Không có việc nào đang chờ</div>') + '</div>';
    // 3) Tab Yêu cầu (anh chốt 14/11): 4 nút lớn + các yêu cầu đang xử lý; trang chủ không còn hàng nút
    var acts = Array.prototype.slice.call(portal.querySelectorAll('.tenant-actions button')).filter(function (b) { return b !== pay && b !== fbBtn && !b.hidden && txt(b) && !b.closest('#tenantHome2') && !b.closest('#tenantReq'); });
    if (mate) acts = acts.filter(function (b) { return !/trả phòng|gia hạn|hợp đồng/i.test(b.textContent); });
    var guestBtn = acts.find(function (b) { return b.matches('[data-guest-open]'); });
    var livedIn = c && c.status === 'Đã ký' && (typeof roomRented !== 'function' || roomRented(room));
    var repairBtn = acts.find(function (b) { return /hư hỏng/i.test(b.textContent); }), outBtn = acts.find(function (b) { return /trả phòng/i.test(b.textContent); });
    var houseBtn = c && c.status === 'Đã ký' && window.householdButton ? window.householdButton(room) : null;
    var others = acts.filter(function (b) { return b !== repairBtn && b !== guestBtn && b !== outBtn && !/^Xem hợp đồng/i.test(txt(b)); });
    function big(ic, label, b, off) { return '<button type="button" aria-label="' + esc(label) + '" class="tr-btn' + (off ? ' off' : '') + '"' + (b && !off ? ' data-th="' + on(function () { b.click(); }) + '"' : ' disabled') + '><span class="tr-ic tr-' + ic + '"></span><span>' + esc(label) + '</span></button>'; }
    var R = '<div class="head tr-head"><div><div class="eyebrow">PHÒNG ' + esc(room) + '</div><div class="title">Yêu cầu</div></div></div>';
    R += '<div class="tr-grid">' + big('repair', 'Báo hư hỏng / cần sửa', repairBtn, !livedIn) + big('guest', 'Báo người ở lại', guestBtn, !livedIn) + big('mate', 'Người ở cùng', houseBtn, !houseBtn) + (mate ? '' : big('out', 'Báo trả phòng', outBtn, !outBtn)) + '</div>';
    if (!livedIn) R += '<p class="tr-note">Nhận phòng xong mới báo hư hỏng và người ở lại được.</p>';
    // Đang xử lý: sửa chữa chưa xong, người ở lại chưa xem, người ở cùng chờ duyệt, trả phòng / hoàn cọc
    var reqs = [], doneSt = ['Đã xác nhận', 'Đã hoàn tất', 'Đã sửa', 'Từ chối', 'Đã huỷ'];
    function cardFor(re) { var hit = null; if (cb) cb.querySelectorAll('.confirm-card').forEach(function (k) { if (!hit && re.test(txt(k))) hit = k; }); return hit; }
    events(room).forEach(function (e) {
      if (!e || e.kind !== 'repair' || doneSt.indexOf(e.status) >= 0) return;
      if (mate && nm(e.tenantName) !== nm(acct[1])) return; // người ở cùng: chỉ việc mình báo
      var what = String(e.title || '').replace(/^Đã báo hư hỏng:\s*/, ''), ts = stamp(e) || vt(e.date), st = e.status || 'Chờ xử lý';
      var w = window.waitingSteps ? window.waitingSteps().filter(function (o) { return o.room === room && o.type === 'repair' && o.asset === what && o.show.indexOf('tenant') >= 0; })[0] : null;
      var sub = st === 'Chờ khách xác nhận' ? 'Đã sửa xong · cần anh/chị xác nhận' : st === 'Chờ xử lý' ? (w ? w.sub : 'Đang chờ quản lý tiếp nhận') : e.repairDate ? (e.acceptedBy ? e.acceptedBy + ' hẹn sửa ' : 'Hẹn sửa ') + viDate(e.repairDate) : 'Đang sửa';
      if (e.tenantName) sub = e.tenantName + ' gửi · ' + sub;
      var card = st === 'Chờ khách xác nhận' ? cardFor(new RegExp(what.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))) : null;
      reqs.push({ ts: ts, h: row('repair', 'Báo hư: ' + what, (ts ? short(new Date(ts).toLocaleDateString('vi-VN')) + ' · ' : '') + sub, card ? 'Xem' : '', card ? function () { sheet(card, ''); } : function () { window.openRepairDetail && window.openRepairDetail(room, e.id); }, { urgent: (w && w.late) || st === 'Chờ khách xác nhận' }) });
    });
    if (window.waitingSteps) window.waitingSteps().forEach(function (o) {
      if (o.room !== room || o.type === 'repair' || !/^(Báo trả phòng|Hoàn cọc|Báo có người ở lại|Người ở cùng)/.test(o.subject)) return;
      if (mate && /^(Báo trả phòng|Hoàn cọc)/.test(o.subject)) return;
      if (/^Báo có người ở lại/.test(o.subject) && nm(o.by) !== nm(acct[1])) return; // việc riêng người gửi
      var mine = o.who === 'tenant', mo = cb && cb.querySelector('[data-moveout-cancel]'), card = /^Báo trả phòng/.test(o.subject) ? (mo ? mo.closest('.confirm-card') : null) : mine ? cardFor(/hoàn cọc/i) : null;
      // Báo người ở lại chưa được xem: người gửi huỷ được (báo nhầm, khách không tới)
      if (o.guestId && !card) { reqs.push({ ts: o.since || 0, h: row('room', o.subject, (o.since ? short(new Date(o.since).toLocaleDateString('vi-VN')) + ' · ' : '') + (o.by ? o.by + ' gửi · ' : '') + o.sub, 'Huỷ', function () { cancelGuest(room, o.guestId); }, { urgent: o.late }) }); return; }
      reqs.push({ ts: o.since || 0, h: row(/^Người ở cùng/.test(o.subject) ? 'contract' : 'room', o.subject, (o.since ? short(new Date(o.since).toLocaleDateString('vi-VN')) + ' · ' : '') + (mine ? 'Cần anh/chị xác nhận' : (o.by ? o.by + ' gửi · ' : '') + o.sub), card ? 'Xem' : '', card ? function () { sheet(card, ''); } : null, { urgent: o.late || mine }) });
    });
    reqs.sort(function (x, y) { return y.ts - x.ts; });
    R += '<div class="work-section th-section"><div class="work-head"><span>Đang xử lý</span><span class="work-count">' + reqs.length + '</span></div>' +
      (reqs.length ? '<div class="work-list">' + reqs.map(function (x) { return x.h; }).join('') + '</div>' : '<div class="work-empty">Không có yêu cầu nào đang xử lý</div>') + '</div>';
    if (others.length) R += '<div class="work-section th-section"><div class="work-head"><span>Việc khác</span></div><div class="work-list">' + others.map(function (b) { return row('room', txt(b), '', '', function () { b.click(); }); }).join('') + '</div></div>';
    reqBox(R, true);
    // 4) Vi phạm
    if (vItems.length) H += '<div class="work-list th-vio">' + row('room', 'Vi phạm nội quy · ' + vItems.length + ' lần', 'Gần nhất: ' + txt(vItems[0].querySelector('h5,strong,b')).replace(/^Lần \d+:\s*/, '') + ' · ' + short(txt(vItems[0].querySelector('small'))), '', function () { sheet(vio, ''); }) + '</div>';
    // 5) Lịch sử: chỉ việc của khách
    var hist = [], evs = events(room), rows = document.querySelectorAll('#tenantFullTimeline .tenant-event');
    // Biên lai phải có trước khi dựng lịch sử (người ở cùng mở app: dữ liệu về sau lần vẽ đầu, thẻ biên lai chưa có)
    try { renderTenantReceipts(); } catch (x) {}
    var receiptLabs = Array.prototype.map.call(document.querySelectorAll('#tenantReceipts [data-receipt]'), function (b) { var amount = txt(b.querySelector('b')), when = txt(b.querySelector('small')); return txt(b).replace(amount, '').replace(/^\s*·\s*/, '').replace(when, '').trim(); });
    var hand = null; try { hand = readHandoverRecords().filter(function (r) { return r.room === room && r.type === 'Giao phòng' && r.confirmedAt; }).pop(); } catch (e) {}
    // Dòng lịch sử dựng lúc mở trang; việc mới (vừa bấm) chưa có trên màn hình thì lấy thẳng từ dữ liệu
    function whoOf(e, title) { var w = e ? String(e.tenantName && /^(repair|payment)$/.test(e.origKind || e.kind || '') ? e.tenantName : (e.actor || e.tenantName || '')).trim() : ''; if (!w || String(title).indexOf(w) >= 0) return ''; return /^(Báo|Xin|Đề xuất|Góp ý)/.test(title) ? w + ' gửi' : w; }
    var rowData = Array.prototype.map.call(rows, function (r) { return { t: txt(r.querySelector('strong')), p: txt(r.querySelector('p')), st: txt(r.querySelector('.tenant-status')), date: txt(r.querySelector('.tenant-date')) }; });
    evs.forEach(function (x) { if (!x || !x.title || !/^(repair|repair-note|payment|checkout)$/.test(x.kind || '') || rowData.some(function (d) { return d.t === x.title; })) return; rowData.unshift({ t: x.title, p: x.detail || '', st: x.status || '', date: String(x.date || x.at || '').split(' ').pop() }); });
    var usedEv = {};
    rowData.forEach(function (d, i) {
      var t = d.t, p = d.p, st = d.st, date = d.date;
      if (/^(Lập hợp đồng|Chủ nhà duyệt hợp đồng|Khách thêm thiết bị|Chủ nhà xem xét|Tiếp nhận sửa:|Hẹn lại ngày sửa:|Gửi khách xác nhận hoàn cọc|Sửa lại số hoàn cọc|Thưởng tìm khách)/.test(t)) return;
      // Cùng tiêu đề (báo hư cùng món nhiều lần): khớp lần báo có cùng ngày với dòng, rồi mới tới lần còn lại
      var dm = function (v) { var m = String(v || '').match(/(\d{1,2})\/(\d{1,2})/); return m ? Number(m[1]) + '/' + Number(m[2]) : ''; };
      var cand = evs.filter(function (x) { return x.title === t && !usedEv[x.id]; });
      var sameDay = function (x) { var dx = dm(x.date) || (stamp(x) ? dm(new Date(stamp(x)).toLocaleDateString('vi-VN')) : ''); return dx && dx === dm(date); };
      // Cùng ngày có lần báo bị từ chối và lần được xác nhận: khớp theo trạng thái của dòng
      var sameSt = function (x) { var s0 = String(x.status || ''), s1 = String(st || ''); return !!s0 && !!s1 && (s1.indexOf(s0) >= 0 || (/từ chối/i.test(s0) && /từ chối/i.test(s1)) || (/xác nhận/i.test(s0) && /xác nhận/i.test(s1) && !/chờ/i.test(s1))); };
      var e = cand.find(function (x) { return sameDay(x) && sameSt(x); }) || cand.find(sameDay) || cand[0]; if (e) usedEv[e.id] = 1; var ts0 = 0, ts = e ? (stamp(e) || vt(e.at) || vt(e.acceptedAt) || vt(e.confirmedAt)) : 0;
      if (/xác nhận ký hợp đồng/.test(t) && c) ts = vt(c.signedAt);
      if (/^Nhận phòng/.test(t) && hand) ts = vt(hand.confirmedAt);
      if (!ts) ts = vt('12:00:00 ' + date) - i;
      if (mate && ts && ts < vt(mate.p.at)) return; // người ở cùng: không xem việc trước khi vào ở
      // Người ở lại là việc riêng của người báo: kết quả (quản lý đã biết) cũng chỉ người báo thấy
      if (/^(Đã biết người ở lại|Báo có người ở lại)/.test(t) && e && e.tenantName && nm(e.tenantName) !== nm(acct[1])) return;
      var kind = /^(Ghi nợ cho khách|Trừ tiền trả trước|Đổi tiền bồi thường|Ghi lại bồi thường|Huỷ bồi thường|Bồi thường)/i.test(t) ? 'payment' : /hư hỏng|sửa/i.test(t) ? 'repair' : /chuyển khoản|thanh toán|tiền/i.test(t) ? 'payment' : /hợp đồng/i.test(t) ? 'contract' : 'room';
      // Người ở cùng: chỉ việc của mình, tiền chung và thông báo (không thấy việc hợp đồng, trả phòng của khách chính)
      if (mate && kind !== 'payment' && (kind === 'contract' || /trả phòng|hoàn cọc|biên bản|gia hạn/i.test(t) || (e && e.tenantName && String(e.tenantName).normalize('NFC') !== String(acct[1]).normalize('NFC')))) return;
      var title = t.replace(/^Đã báo hư hỏng:\s*/, 'Báo hư: ').replace(/^Đã báo chuyển khoản:\s*/, 'Báo đã trả: ').replace(/^Người thuê xác nhận ký hợp đồng/, 'Ký hợp đồng').replace(/^Nhắc khách .+ ký hợp đồng$/, 'Nhắc ký hợp đồng').replace(/^Khách nhắc hẹn ngày giao phòng$/, 'Đã nhắc quản lý hẹn ngày giao phòng');
      // Lần báo đã xác nhận vẫn giữ dòng (ghi rõ ai xác nhận); biên lai từng khoản là dòng riêng
      if (e && (e.origKind || e.kind) === 'repair') st = e.status === 'Chờ xử lý' || !e.status ? 'Chờ quản lý tiếp nhận' : e.status === 'Đã tiếp nhận' ? (e.repairDate ? (e.acceptedBy ? e.acceptedBy + ' hẹn sửa ' : 'Hẹn sửa ') + viDate(e.repairDate) : (e.acceptedBy ? e.acceptedBy + ' đã tiếp nhận' : 'Đã tiếp nhận')) : e.status === 'Chờ khách xác nhận' ? 'Đã sửa xong, chờ anh/chị xác nhận' : /^(Đã hoàn tất|Đã sửa)$/.test(e.status) ? 'Đã sửa xong' : e.status === 'Từ chối' ? 'Không nhận sửa' : st;
      if (e && (e.origKind || e.kind) === 'repair-note') st = 'Đã gửi lại cho quản lý';
      if (e && (e.origKind || e.kind) === 'payment') st = e.status === 'Chờ xử lý' || !e.status ? 'Chờ xác nhận' : e.status === 'Từ chối' ? 'Bị từ chối' + (e.rejectReason ? ': ' + e.rejectReason : '') : e.status === 'Đã xác nhận' && (e.acceptedBy || e.confirmedBy) ? 'Đã xác nhận bởi ' + (e.acceptedBy || e.confirmedBy) : st;
      var amt = e && (e.origKind || e.kind) === 'payment' ? ((String(e.detail || '').match(/Số tiền ([^·]+)/) || [])[1] || '').trim() : '';
      // Đổi tiền bồi thường: khách thấy ngay số cũ → mới và phần trả lại vào tiền trả trước (không phải bấm vào dòng)
      if (e && /^Đổi tiền bồi thường/.test(t)) { var dd = String(e.detail || ''), mm = dd.match(/^(.+? → [^·]+)/), bb = dd.match(/trả lại [^·]+? vào tiền trả trước/); if (mm) amt = mm[1].trim(); if (bb && title.indexOf(bb[0]) < 0) title += ' · ' + bb[0]; }
      hist.push({ rid: e && e.kind === 'repair' ? e.id : '', ts: ts, t: title, sub: [short(date), whoOf(e, title), amt, st && st !== title ? st : ''].filter(Boolean).join(' · '), detail: p, kind: kind });
    });
    document.querySelectorAll('#tenantReceipts [data-receipt]').forEach(function (b) {
      var amount = txt(b.querySelector('b')), rest = txt(b).replace(amount, '').replace(/^\s*·\s*/, ''), when = txt(b.querySelector('small')), lab = rest.replace(when, '').trim();
      hist.push({ ts: vt((when.match(/\d{1,2}:\d{2}(:\d{2})? \d{1,2}\/\d{1,2}\/\d{4}/) || [])[0]), t: 'Biên lai: ' + lab, sub: short(when) + ' · ' + (when.split(' · ')[0] || ''), amount: amount, kind: 'payment', btn: b });
    });
    document.querySelectorAll('#tenantComplaints .complaint-item').forEach(function (it) {
      var sm = txt(it.querySelector('small')), body = txt(it.querySelector('p'));
      var cd = (sm.match(/\d{1,2}\/\d{1,2}\/\d{4}/) || [])[0];
      var cw = ''; try { var cx = (readComplaints() || []).find(function (k) { return String(k.text || '').replace(/\s+/g, ' ').trim() === body.trim(); }); cw = cx && cx.tenantName ? cx.tenantName + ' gửi' : ''; } catch (e) {}
      var rest = sm.replace(/\d{1,2}:\d{2}(:\d{2})?\s*/g, '').replace(/\d{1,2}\/\d{1,2}\/\d{4}/, '').split(' · ').map(function (x) { return x.trim(); }).filter(Boolean).map(function (x) { return /^Đã trả lời$/.test(x) && cx && cx.repliedBy ? cx.repliedBy + ' đã trả lời' : x; });
      hist.push({ ts: cd ? vt('23:59:00 ' + cd) : 0, t: 'Góp ý: ' + body, sub: [short(cd), cw].concat(rest).filter(Boolean).join(' · '), detail: txt(it.querySelector('.complaint-reply')), kind: 'notice' });
    });
    // Thông báo của căn đã xem: còn lại trong Lịch sử, bấm xem lại nội dung
    try { tenantNotices(acct.join('|')).forEach(function (n) {
      var seen = n.readBy && n.readBy[acct.join('|')];
      if (!seen) return;
      hist.push({ ts: vt(n.sentAt) || vt(seen), t: 'Thông báo: ' + (n.title || ''), sub: [short(n.sentAt), 'đã xem ' + short(seen)].join(' · '), detail: n.body || '', kind: 'notice' });
    }); } catch (e) {}
    hist.sort(function (a, b) { return b.ts - a.ts; });
    var shown = showAll ? hist : hist.slice(0, 5);
    H += '<div class="work-section th-section"><div class="work-head"><span>Lịch sử</span><span class="work-count">' + hist.length + '</span>' + (hist.length > 5 ? '<button type="button" class="work-more' + (showAll ? ' less' : '') + '" data-th="' + on(function () { showAll = !showAll; render(); }) + '">' + (showAll ? 'Thu gọn' : 'Xem tất cả') + '</button>' : '') + '</div>' +
      (shown.length ? '<div class="work-list">' + shown.map(function (h) {
        return row(h.kind, h.t, h.sub, '', h.btn ? function () { h.btn.click(); } : h.rid && window.openRepairDetail ? function () { window.openRepairDetail(room, h.rid); } : h.detail ? function () { appConfirmInfo(h); } : null, { amount: h.amount });
      }).join('') + '</div>' : '<div class="work-empty">Chưa có hoạt động nào</div>') + '</div>';
    if (!box) { box = document.createElement('div'); box.id = 'tenantHome2'; (portal.querySelector(':scope > .head') || portal.firstElementChild).insertAdjacentElement('afterend', box); }
    if (box.dataset.html !== H) { box.dataset.html = H; box.innerHTML = H; }
    if (!portal.classList.contains('th2')) portal.classList.add('th2');
  }
  function complaintReply(cm) {
    var o = document.createElement('div');
    o.className = 'modal-overlay';
    o.innerHTML = '<div class="modal-sheet"><div class="modal-head">Khiếu nại</div><p class="note" translate="no">“' + esc(cm.text) + '”</p><p class="confirm-text"><b>' + esc(cm.repliedBy || 'Chủ nhà') + ':</b> <span translate="no">' + esc(cm.reply) + '</span></p><div class="modal-actions"><button type="button" class="save" data-th-close>Đã xem</button></div></div>';
    o.addEventListener('click', function (e) {
      if (e.target !== o && !e.target.closest('[data-th-close]')) return;
      var list = readComplaints(), x = list.find(function (i) { return i.id === cm.id; });
      if (x) { x.tenantSeenAt = new Date().toLocaleString('vi-VN'); saveComplaints(list); }
      o.remove(); render();
    });
    (typeof appendToPhone === 'function' ? appendToPhone : function (x) { document.querySelector('.phone').appendChild(x); })(o);
  }
  function appConfirmInfo(h) {
    var o = document.createElement('div');
    o.className = 'modal-overlay';
    o.innerHTML = '<div class="modal-sheet"><div class="modal-head">' + esc(h.t) + '</div><p class="confirm-text">' + esc(h.detail) + '</p><p class="note">' + esc(h.sub) + '</p><div class="modal-actions"><button type="button" data-th-close>Đóng</button></div></div>';
    o.addEventListener('click', function (e) { if (e.target === o || e.target.closest('[data-th-close]')) o.remove(); });
    (typeof appendToPhone === 'function' ? appendToPhone : function (x) { document.querySelector('.phone').appendChild(x); })(o);
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('#tenantHome2 [data-th], #tenantReq [data-th]');
    if (!b) return;
    var fn = handlers[Number(b.dataset.th)];
    if (fn) fn();
  });
  var t = 0, busy = false;
  function soon() { if (busy) return; clearTimeout(t); t = setTimeout(function () { busy = true; try { render(); } finally { setTimeout(function () { busy = false; }, 0); } }, 120); }
  window.__th2Soon = soon;
  // Gửi lại / xác nhận trong thẻ: dữ liệu đổi mà khung khách chưa chắc đổi → vẽ lại
  document.addEventListener('click', function (ev) { if (ev.target.closest && ev.target.closest('[data-repair-send],[data-repair-ok],[data-checkout-send],[data-checkout-ok]')) setTimeout(soon, 250); }, true);
  function watch() {
    var p = document.getElementById('tenantPortal');
    if (p) new MutationObserver(function (ms) { if (ms.some(function (m) { return !(m.target.closest && m.target.closest('#tenantHome2')) && !(m.target.id === 'tenantHome2'); })) soon(); }).observe(p, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['hidden', 'class'] });
    render();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch); else watch();
})();

// Người ở cùng phòng (anh chốt 12/11, chốt lại 14/11 theo 5 phản biện):
// - Khách chính mời → quản lý phụ trách phòng duyệt (phòng chưa giao: chủ nhà). Chủ nhà / quản lý thì thêm thẳng.
// - Người không cần tài khoản (trẻ em, người không dùng điện thoại): chỉ cần tên + giấy tờ, vẫn tính người và phụ phí.
// - Nhận người ở cùng theo mã tài khoản (uuid) / số điện thoại, không theo tên.
// - Dọn đi: người ở cùng tự báo (có hiệu lực ngay); khách chính báo thì quản lý xác nhận; quản lý ghi thì ngay.
// - Hợp đồng và cọc vẫn đứng tên khách chính. Số người = số người ghi trong hợp đồng + người ở cùng đang ở.
(function () {
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function norm(s) { return String(s == null ? '' : s).normalize('NFC').replace(/\s+/g, ' ').trim(); }
  function acct() { var s = document.getElementById('accountSelect'); return s ? String(s.value || '') : ''; }
  function contracts() { try { return readHomeContracts() || {}; } catch (e) { return {}; } }
  function now() { return new Date().toLocaleString('vi-VN'); }
  function day(at) { return String(at || '').split(' ').pop(); }
  function phone(o) { (typeof appendToPhone === 'function' ? appendToPhone : function (x) { document.querySelector('.phone').appendChild(x); })(o); }
  function refresh() { ['renderManagementOverview', 'refreshTenantScreen', '__th2Soon', 'renderWorkCenter'].forEach(function (f) { try { if (typeof window[f] === 'function') window[f](); } catch (e) {} }); }
  function serverMe() { try { return JSON.parse(localStorage.getItem('homeServerUser') || 'null'); } catch (e) { return null; } }
  function house(room) { try { return propertyIdForRoom(room); } catch (e) { return ''; } }
  function signed(c) { return !!c && /^(Đã ký|Còn hiệu lực|Sắp hết hạn)$/.test(c.status || ''); }
  function ccOf(room) { try { return isCambodiaHouse(house(room)) ? '855' : '84'; } catch (e) { return '84'; } }
  function showPh(v) {
    var raw = String(v || '').trim(), d = raw.replace(/\D/g, '');
    if (!d) return raw;
    if (/^\+?855/.test(raw) && raw.charAt(0) === '+') { var r = d.slice(3).replace(/^0/, ''); return '+855 ' + r.replace(/^(\d{2})(\d{3})(\d+)$/, '$1 $2 $3'); }
    if (raw.charAt(0) === '+' && d.indexOf('84') === 0) d = '0' + d.slice(2).replace(/^0/, '');
    else if (raw.charAt(0) === '+') return raw;
    return d.length === 10 ? d.replace(/^(\d{4})(\d{3})(\d{3})$/, '$1 $2 $3') : d;
  }
  window.homeShowPhone = showPh;
  function pk(ph, room) { try { return phoneKey(ph, ccOf(room)); } catch (e) { return String(ph || '').replace(/\D/g, ''); } }
  function userByKey(key) { return (readUsers() || []).find(function (u) { return u.key === key; }) || null; }
  function all(c) { return (c && c.extraPeople) || []; }
  function mates(c) { return all(c).filter(function (p) { return !p.leftAt; }); }
  function count(p) { return Number(p.count) || 1; }
  var DAYMS = 864e5;
  function iso(t) { var d = new Date(t || Date.now()); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function today() { return iso(); }
  function vnDate(x) { return String(x || '').split('-').reverse().join('/'); }
  function dstart(t) { var d = new Date(t || Date.now()); d.setHours(0, 0, 0, 0); return d.getTime(); }
  function ageOf(birth) { if (!birth) return null; var b = new Date(birth + 'T00:00'), n = new Date(), a = n.getFullYear() - b.getFullYear(); if (n.getMonth() < b.getMonth() || (n.getMonth() === b.getMonth() && n.getDate() < b.getDate())) a--; return a; }
  // Phòng đang trả: khách chính đã báo trả phòng, hoặc đang làm hoàn cọc → không thêm người mới
  function movingOut(room) { var mo = null, r = null; try { mo = moveOutRequest(room); } catch (e) {} try { r = readCheckouts()[room]; } catch (e) {} return !!mo || !!(r && r.status && r.status !== 'Đã hoàn cọc'); }
  function delegateOf(c) { var d = c && c.delegate; return d && String(d.until || '') >= today() ? d : null; }
  // Giấy tờ / tuổi hiện trong danh sách và lúc duyệt
  function idTag(p) {
    var t = [];
    if (p.idType === 'passport') t.push('hộ chiếu' + (p.visaUntil ? ' · thị thực đến ' + vnDate(p.visaUntil) : ''));
    if (p.birth) t.push('sinh ' + vnDate(p.birth) + (p.guardian ? ' · giám hộ ' + p.guardian : ''));
    return t.join(' · ');
  }
  function idRows(v) {
    var r = [];
    if (v.idType === 'passport') r.push(['Hộ chiếu', [v.passportNo, v.visaType ? 'thị thực ' + v.visaType : '', v.visaUntil ? 'đến ' + vnDate(v.visaUntil) : ''].filter(Boolean).join(' · ')]);
    if (v.birth) r.push(['Ngày sinh', vnDate(v.birth) + (ageOf(v.birth) != null ? ' (' + ageOf(v.birth) + ' tuổi)' : '')]);
    if (v.guardian) r.push(['Người giám hộ', v.guardian]);
    if (v.consentAt) r.push(['Đồng ý lưu giấy tờ', (v.consentBy ? v.consentBy + ' xác nhận · ' : '') + day(v.consentAt)]);
    if (v.noAccountReason) r.push(['Lý do không cần tài khoản', v.noAccountReason]);
    return r;
  }
  var EXTRA_FIELDS = ['passportNo', 'visaType', 'visaUntil', 'birth', 'guardian', 'noAccountReason', 'consentAt', 'consentBy'];
  // Người này có phải tài khoản `key` không: theo mã tài khoản, số điện thoại, rồi mới tới khoá cũ (có tên)
  function same(p, key, room) {
    if (!p || !key) return false;
    if (p.account && p.account === key) return true;
    var u = userByKey(key), me = serverMe();
    var uuid = (u && u.uuid) || (me && me.key === key ? me.id : ''), ph = (u && u.phone) || (me && me.key === key ? me.phone : '');
    if (p.uuid && uuid && p.uuid === uuid) return true;
    if (p.phoneKey && ph && p.phoneKey === pk(ph, room)) return true;
    var parts = String(key).split('|');
    // Tester 20/11: chuyển phòng xong, tài khoản người ở cùng trong hợp đồng mới còn ghi phòng cũ → cùng tên trong hợp đồng phòng này là đúng người
    return !!(p.account && norm(String(p.account).split('|')[1]) === norm(parts[1]) && (String(p.account).split('|')[2] === parts[2] || !!(contracts()[room] || {}).transferredFrom));
  }
  function find(key, onlyActive) {
    var room = String(key || '').split('|')[2], c = room && contracts()[room];
    if (!c || String(key).split('|')[0] !== 'tenant') return null;
    var list = all(c).filter(function (x) { return x.account && same(x, key, room); });
    var p = list.filter(function (x) { return !x.leftAt; })[0] || (onlyActive ? null : list[list.length - 1]);
    return p ? { room: room, p: p, c: c } : null;
  }
  // Có từng là người ở cùng của hợp đồng phòng này không (kể cả đã dọn đi) — dùng để chặn quyền khách chính
  window.isRoommateKey = function (key) { return !!find(key, false); };
  window.roommateEntry = function (key) { return find(key, true); };
  // Tab Người dùng: phân biệt khách chính / người ở cùng (anh 15/11)
  window.householdRoleOf = function (user) {
    if (!user || user.role !== 'tenant') return null;
    var f = find(user.key, false);
    if (f) return { mate: true, left: !!f.p.leftAt, main: mainName(f.room, f.c) };
    var c = contracts()[user.room];
    return c && mates(c).length && norm(c.tenantName) === norm(user.fullName || user.name) ? { isMain: true } : null;
  };
  window.householdSortUsers = function (list) {
    var rank = function (u) { if (u.role !== 'tenant') return null; var r = window.householdRoleOf(u); return r && r.mate ? (r.left ? 2 : 1) : 0; };
    var others = list.filter(function (u) { return u.role !== 'tenant'; }), ts = list.filter(function (u) { return u.role === 'tenant'; });
    var order = {}; ts.forEach(function (u, i) { if (!(u.room in order)) order[u.room] = i; });
    return others.concat(ts.map(function (u, i) { return { u: u, i: i, r: rank(u) }; }).sort(function (a, b) {
      return (order[a.u.room] - order[b.u.room]) || (a.r - b.r) || (a.i - b.i);
    }).map(function (x) { return x.u; }));
  };
  window.roommateLeftEntry = function (key) { var r = find(key, false); return r && r.p.leftAt ? r : null; };
  // Tiền phòng tính theo khách chính: người ở cùng xem và báo thanh toán chung một hoá đơn
  window.householdKey = function (key) {
    var r = window.roommateEntry(key);
    if (!r) return key;
    var u = mainUser(r.room, r.c);
    // Tester 20/11: máy người ở cùng vừa chuyển phòng chưa có tài khoản khách chính ở phòng mới → dựng khoá theo hợp đồng
    if (!u && r.c && r.c.tenantName) { var mk = 'tenant|' + String(r.c.tenantName).trim() + '|' + r.room; return mk !== key ? mk : key; }
    return u && u.key !== key ? u.key : key;
  };
  function mainUser(room, c) {
    c = c || contracts()[room] || {};
    var list = (readUsers() || []).filter(function (u) { return u.role === 'tenant' && u.room === room && u.status !== 'Đã xoá' && !all(c).some(function (p) { return p.account && same(p, u.key, room); }); });
    return list.find(function (u) { return norm(u.name) === norm(c.tenantName); }) || list[0] || null;
  }
  function mainName(room, c) { var u = mainUser(room, c); return (c && c.tenantName) || (u && u.name) || ''; }
  function isMain(room) { var a = acct().split('|'); return a[0] === 'tenant' && a[2] === room && !window.isRoommateKey(acct()); }
  function isMate(room) { var a = acct().split('|'); return a[0] === 'tenant' && a[2] === room && !!window.roommateEntry(acct()); }
  // Người được duyệt / thêm thẳng: chủ nhà, quản lý phụ trách phòng (phòng chưa giao ai thì chỉ chủ nhà)
  function isStaff(room) { try { return ['owner', 'manager'].indexOf(acct().split('|')[0]) >= 0 && canManageCheckout(room); } catch (e) { return false; } }
  window.householdIsStaff = isStaff;
  function feeNote(room) {
    var fee = 0; try { fee = extraPersonMonthly(room); } catch (e) {}
    return fee > 0 ? 'Thu thêm ' + amountForHouse(fee, house(room)) + ' / người / tháng, tháng đầu tính theo số ngày ở.' : '';
  }
  function err(form, t) { var b = form.querySelector('.user-error'); b.hidden = false; b.textContent = t; b.scrollIntoView && b.scrollIntoView({ block: 'nearest' }); }
  // Lời mời còn chờ: chưa duyệt, chưa huỷ, chưa có trong danh sách người ở (hai máy cùng sửa thì lời mời đã duyệt không sống lại)
  function pending(c) { return ((c && c.roommateInvites) || []).filter(function (v) { return (!v.status || v.status === 'Chờ duyệt') && !all(c).some(function (p) { return p.inviteId === v.id; }); }); }
  function shownInvites(c) { return ((c && c.roommateInvites) || []).filter(function (v) { return v.status === 'Từ chối' || pending(c).indexOf(v) >= 0; }); }
  window.roommatePendingInvites = function (room) { return pending(contracts()[room]); };
  // Số người ở = số người ghi trong hợp đồng + người ở cùng đang ở (không cộng / trừ tay, tránh lệch khi hai máy cùng sửa)
  function base(c) {
    if (c.baseOccupants == null) c.baseOccupants = Math.max(1, (Number(c.occupants) || 1) - mates(c).reduce(function (t, p) { return t + count(p); }, 0));
    return Number(c.baseOccupants) || 1;
  }
  function recount(c) { c.occupants = base(c) + mates(c).reduce(function (t, p) { return t + count(p); }, 0); return c.occupants; }
  function occ(c) { return c ? (c.baseOccupants == null ? Number(c.occupants) || 1 : base(c) + mates(c).reduce(function (t, p) { return t + count(p); }, 0)) : 1; }
  function capOf(room) { try { return roomCapacity(room) || 0; } catch (e) { return 0; } }
  // Ở vượt số người tối đa (anh chốt 15/11): chủ nhà đồng ý cho ở thêm nhưng số người tối đa của phòng giữ nguyên;
  // muốn tăng hẳn thì chủ nhà sửa phòng. Khách đề nghị khi phòng đủ: quản lý phòng xem trước rồi mới lên chủ nhà.
  function isOwnerNow() { return acct().split('|')[0] === 'owner'; }
  function hasMgr(room) {
    try { if (readRoomManagerAssignments()[room]) return true; var m = readPropertyManagerAssignments()[propertyIdForRoom(room)]; return Array.isArray(m) ? m.length > 0 : !!m; } catch (e) { return false; }
  }
  function overOf(room, c, v) { return !!(capOf(room) && occ(c) + 1 > capOf(room)); }
  // '' = quản lý duyệt bình thường · 'mgr' = quản lý xem rồi gửi chủ nhà · 'owner' = chờ chủ nhà đồng ý cho ở thêm
  function stageOf(room, c, v) { return !overOf(room, c, v) ? '' : (v.staffAdd || v.mgrOk || !hasMgr(room)) ? 'owner' : 'mgr'; }
  function needOwner(room, c, v) { return stageOf(room, c, v) === 'owner'; }
  function waitText(room, c, v) { var st = stageOf(room, c, v); return st === 'owner' ? 'Chờ chủ nhà đồng ý cho ở thêm' : st === 'mgr' ? 'Chờ quản lý xem rồi gửi chủ nhà' : 'Chờ quản lý duyệt'; }
  function roomFull(room, c, extra) { var cap = capOf(room); return cap && occ(c) + pending(c).length + (extra || 0) > cap; }
  function openProps(room) { try { return proposals(room).filter(function (x) { return !x.closed; }).length; } catch (e) { return 0; } }
  // Số điện thoại đã có người dùng: nhân viên / người đang ở phòng khác thì chặn; khách cũ đã dọn đi hẳn thì dùng lại tài khoản
  function phoneOwner(ph, room) {
    var key = pk(ph, room);
    if (!key) return null;
    var cs0 = contracts(), hit = '';
    Object.keys(cs0).forEach(function (r0) {
      if (r0 === room || hit || !cs0[r0]) return;
      if (mates(cs0[r0]).some(function (p) { return p.phoneKey === key; }) || pending(cs0[r0]).some(function (v) { return v.phoneKey === key || (v.phone && pk(v.phone, r0) === key); })) hit = r0;
    });
    if (hit) return { block: 'Số này đang ở hoặc đang được mời vào ' + hit + '. Một số điện thoại chỉ ở một phòng.' };
    var u = (readUsers() || []).find(function (x) { return x.status !== 'Đã xoá' && x.phone && pk(x.phone, x.room || room) === key; });
    if (!u) return null;
    if (u.role !== 'tenant') return { block: 'Số này là tài khoản nhân viên, không dùng cho người ở cùng được.' };
    var cs = contracts(), r = u.room, c = r && cs[r];
    var leftHere = c && all(c).some(function (p) { return p.leftAt && same(p, u.key, r); });
    var stillMain = c && !leftHere && !all(c).some(function (p) { return same(p, u.key, r); }) && (signed(c) || ['Chờ người thuê ký', 'Chờ chủ nhà duyệt'].indexOf(c.status) >= 0) && (norm(c.tenantName) === norm(u.name) || (mainUser(r, c) || {}).key === u.key);
    var stillMate = c && all(c).some(function (p) { return !p.leftAt && same(p, u.key, r); });
    if (stillMain || stillMate) return { block: 'Số này đang thuê ' + r + '. Một số điện thoại chỉ ở một phòng.' };
    return { reuse: u };
  }

  // Danh sách người ở trong phòng
  window.openHousehold = function (room) {
    var c = contracts()[room] || {}, main = mainName(room, c), u = mainUser(room, c), me = acct();
    var staff = isStaff(room), mainMe = isMain(room), mateMe = isMate(room), meP = mateMe ? find(me, true) : null, dl = delegateOf(c);
    var rows = '<div class="user-info-row"><span>Khách chính</span><strong>' + esc(main) + (u && u.phone ? ' · ' + esc(showPh(u.phone)) : '') + '</strong></div>';
    if (base(c) > 1) rows += '<div class="user-info-row"><span>Ghi trong hợp đồng</span><strong>' + base(c) + ' người</strong></div>';
    if (dl) rows += '<div class="user-info-row"><span>Uỷ quyền tạm</span><strong>' + esc(dl.name) + ' đến ' + esc(vnDate(dl.until)) + '</strong></div>';
    mates(c).forEach(function (p) {
      var mine = p.account && same(p, me, room), lr = p.leftRequest, wait = p.mainOk && p.mainOk.status === 'Chờ';
      var tags = [showPh(p.phone), p.noAccount ? 'không cần tài khoản' : p.account && !p.accountReadyAt ? 'chưa đặt mật khẩu' : p.account ? 'có tài khoản' : '', idTag(p), 'ở từ ' + day(p.at)];
      var btn = '';
      if (lr) btn = staff ? '<button type="button" class="hh-btn" data-hh-confirm="' + esc(p.id) + '">Xác nhận đã đi</button>' : '<span class="hh-wait">' + (lr.self ? 'Đã báo dọn đi · c' : 'C') + 'hờ quản lý xác nhận</span>';
      else if (staff || mainMe) btn = '<button type="button" class="hh-btn" data-hh-left="' + esc(p.id) + '">Đã dọn đi</button>';
      else if (mine) btn = '<button type="button" class="hh-btn" data-hh-self="' + esc(p.id) + '">Tôi đã dọn đi</button>';
      if (mainMe && wait && !mainAnswered(room, p.id)) btn = '<button type="button" class="hh-btn" data-hh-mainok="' + esc(p.id) + '">Đồng ý?</button>' + btn;
      if (staff && p.account && !p.noAccount && !p.accountReadyAt) btn += '<button type="button" class="hh-btn" data-hh-account="' + esc(p.id) + '">Tạo tài khoản</button>';
      if (staff) btn += '<button type="button" class="hh-btn" data-hh-move="' + esc(p.id) + '">Chuyển phòng</button>';
      rows += '<div class="hh-row"><div><strong>' + esc(p.names) + (mine ? ' (anh/chị)' : '') + '</strong><small>' + esc(tags.filter(Boolean).join(' · ')) + '</small>' +
        (wait ? '<small class="hh-wait">Chờ khách chính đồng ý · quá 48 giờ coi như đồng ý</small>' : '') +
        (lr && mine && !lr.self ? '<small class="hh-bad">' + esc(lr.by) + ' báo anh/chị đã dọn đi</small>' : '') + '</div><div class="hh-btns">' + btn +
        (lr && mine && !lr.self ? '<button type="button" class="hh-btn" data-hh-stay="' + esc(p.id) + '">Tôi vẫn ở</button>' : '') + '</div></div>';
    });
    if (!mateMe) shownInvites(c).forEach(function (v) {
      var rej = v.status === 'Từ chối';
      rows += '<div class="hh-row"><div><strong>' + esc(v.name) + '</strong><small' + (rej ? ' class="hh-bad"' : '') + '>' + esc(rej ? (v.ownerNo ? 'Chủ nhà không đồng ý: ' : 'Không duyệt: ') + (v.reason || '') : waitText(room, c, v) + ' · ' + v.by + (v.staffAdd ? ' thêm' : '' + (v.staffAdd ? '' : v.agreedBy ? ' đề nghị, ' + v.agreedBy + ' đồng ý' : ' mời')) + ' ' + day(v.at)) + '</small></div>' +
        (mainMe || staff ? '<button type="button" class="hh-btn" data-hh-drop="' + esc(v.id) + '">' + (rej ? 'Bỏ' : v.staffAdd ? 'Huỷ' : 'Huỷ mời') + '</button>' : '') +
        (staff && !rej && (stageOf(room, c, v) === '' || (stageOf(room, c, v) === 'owner') === isOwnerNow()) ? '<button type="button" class="hh-btn" data-hh-review="' + esc(v.id) + '">' + (stageOf(room, c, v) ? 'Xem' : 'Duyệt') + '</button>' : '') + '</div>';
    });
    // Đề nghị thêm người: người ở cùng thấy đề nghị của mình; khách chính thấy đề nghị đang chờ mình
    proposals(room).forEach(function (x) {
      var st = proposalState(room, x);
      if (!st || !((meP && x.ev.personId === meP.p.id) || (mainMe && !x.closed))) return;
      var b2 = mainMe && !x.closed ? '<button type="button" class="hh-btn" data-hh-prop="' + esc(x.ev.id) + '">Xem</button>' : meP && !x.closed ? '<button type="button" class="hh-btn" data-hh-propcancel="' + esc(x.ev.id) + '">Rút</button>' : '';
      rows += '<div class="hh-row"><div><strong>' + esc(x.ev.v.name) + '</strong><small>' + esc((meP && x.ev.personId === meP.p.id ? 'Anh/chị' : x.ev.tenantName) + ' đề nghị · ' + st) + '</small></div><div class="hh-btns">' + b2 + '</div></div>';
    });
    // Người thân được ở lâu hơn số đêm cho phép
    (c.guestExceptions || []).filter(function (g) { return String(g.until || '') >= today(); }).forEach(function (g) {
      if (!(staff || mainMe || mateMe)) return;
      rows += '<div class="hh-row"><div><strong>' + esc(g.name) + '</strong><small>Khách được ở đến ' + esc(vnDate(g.until)) + ' · ' + esc(g.reason || '') + '</small></div>' + (staff ? '<button type="button" class="hh-btn" data-hh-exdrop="' + esc(g.id) + '">Bỏ</button>' : '') + '</div>';
    });
    var cap = capOf(room), moving = movingOut(room), full = cap && occ(c) + pending(c).length >= cap, ok = signed(c) && cap && !moving;
    var canAdd = (staff || mainMe) && ok, canProp = mateMe && ok && !(meP && meP.p.leftRequest);
    var why = !signed(c) ? '' : !cap ? 'Phòng chưa đặt số người tối đa, chưa thêm người được' + (acct().split('|')[0] === 'owner' ? ' (sửa phòng để đặt).' : ', nhờ chủ nhà đặt.') : moving ? 'Khách chính đã báo trả phòng, không thêm người mới.' : '';
    var swap = staff && mates(c).some(function (p) { return p.account && !p.noAccount && p.accountReadyAt && userByKey(p.account); });
    var links = [swap ? '<button type="button" class="link-btn" data-hh-swap>Đổi khách chính</button>' : '', staff ? '<button type="button" class="link-btn" data-hh-guest>Cho khách ở lâu</button>' : '',
      mainMe && mates(c).some(function (p) { return p.account && !p.noAccount; }) ? '<button type="button" class="link-btn" data-hh-deleg>' + (dl ? 'Thôi uỷ quyền' : 'Uỷ quyền tạm') + '</button>' : ''].filter(Boolean).join('');
    var o = document.createElement('div');
    o.className = 'modal-overlay';
    o.innerHTML = '<div class="modal-sheet"><div class="modal-head">Người ở cùng · ' + esc(room) + '</div>' + rows +
      '<p class="note">Đang ở ' + occ(c) + ' người' + (cap ? ' / tối đa ' + cap : '') + (cap && occ(c) > cap ? ', đang ở vượt' : cap && occ(c) >= cap ? ', phòng đã đủ người' : full ? ', tính cả người chờ duyệt là đủ' : '') + '. ' + (pending(c).length ? pending(c).length + ' người đang chờ duyệt. ' : '') + (full && !isOwnerNow() ? 'Thêm người cần chủ nhà đồng ý cho ở thêm. ' : '') + (why ? esc(why) + ' ' : '') +
      (mateMe ? 'Khách chính ' + esc(main) + ' đứng tên hợp đồng và tiền cọc. Muốn thêm người thì đề nghị, khách chính đồng ý rồi quản lý duyệt.' + (dl && meP && dl.personId === meP.p.id ? ' Anh/chị đang được uỷ quyền xác nhận sửa xong, biên bản đến ' + esc(vnDate(dl.until)) + '.' : '') : 'Người ở cùng có tài khoản riêng: báo hư, báo người ở lại, xem thông báo, xem và báo thanh toán tiền phòng. Hợp đồng và tiền cọc vẫn đứng tên khách chính.') + '</p>' +
      (links ? '<div class="hh-links">' + links + '</div>' : '') +
      '<div class="modal-actions"><button type="button" data-hh-close>Đóng</button>' + (canAdd ? '<button type="button" class="save" data-hh-add>Thêm người ở cùng</button>' : canProp ? '<button type="button" class="save" data-hh-add>Đề nghị thêm người</button>' : '') + '</div></div>';
    o.addEventListener('click', function (e) {
      var t = e.target, b;
      if (t === o || t.closest('[data-hh-close]')) return o.remove();
      if (t.closest('[data-hh-add]')) { o.remove(); return openAdd(room); }
      if (t.closest('[data-hh-swap]')) { o.remove(); return openSwap(room); }
      if (t.closest('[data-hh-guest]')) { o.remove(); return openGuestException(room); }
      if (t.closest('[data-hh-deleg]')) { o.remove(); return dl ? dropDelegate(room) : openDelegate(room); }
      if ((b = t.closest('[data-hh-mainok]'))) { o.remove(); return openMainOk(room, b.dataset.hhMainok); }
      if ((b = t.closest('[data-hh-prop]'))) { o.remove(); return reviewProposal(room, b.dataset.hhProp); }
      if ((b = t.closest('[data-hh-propcancel]'))) { o.remove(); return cancelProposal(room, b.dataset.hhPropcancel); }
      if ((b = t.closest('[data-hh-exdrop]'))) { o.remove(); dropException(room, b.dataset.hhExdrop); return window.openHousehold(room); }
      if ((b = t.closest('[data-hh-left]'))) { o.remove(); return askLeft(room, b.dataset.hhLeft); }
      if ((b = t.closest('[data-hh-self]'))) { o.remove(); return selfLeft(room, b.dataset.hhSelf); }
      if ((b = t.closest('[data-hh-confirm]'))) { o.remove(); return confirmLeft(room, b.dataset.hhConfirm); }
      if ((b = t.closest('[data-hh-stay]'))) { o.remove(); return stillHere(room, b.dataset.hhStay); }
      if ((b = t.closest('[data-hh-account]'))) { o.remove(); var p = all(contracts()[room]).find(function (x) { return x.id === b.dataset.hhAccount; }); return p && makeAccount(room, p); }
      if ((b = t.closest('[data-hh-move]'))) { o.remove(); return openMove(room, b.dataset.hhMove); }
      if ((b = t.closest('[data-hh-review]'))) { o.remove(); return reviewInvite(room, b.dataset.hhReview); }
      if ((b = t.closest('[data-hh-drop]'))) {
        var did = b.dataset.hhDrop, dv = pending(c).filter(function (x) { return x.id === did; })[0];
        if (!dv) { o.remove(); dropInvite(room, did); return window.openHousehold(room); }
        return appConfirm((dv.staffAdd ? 'Huỷ thêm ' : 'Huỷ mời ') + dv.name + '?', '', dv.staffAdd ? 'Huỷ' : 'Huỷ mời', function () { o.remove(); dropInvite(room, did); window.openHousehold(room); }, true);
      }
    });
    phone(o);
  };

  // Form thêm: khách chính gửi lời mời; chủ nhà / quản lý phụ trách thêm thẳng
  function openAdd(room) {
    var staff = isStaff(room), propose = !staff && isMate(room), cc = ccOf(room), c0 = contracts()[room] || {};
    var full0 = roomFull(room, c0, 1 + (propose ? openProps(room) : 0));
    var guards = [mainName(room, c0)].concat(mates(c0).filter(function (p) { return !p.noAccount || (ageOf(p.birth) || 0) >= 18; }).map(function (p) { return p.names; })).filter(Boolean);
    var o = document.createElement('div');
    o.className = 'modal-overlay';
    o.innerHTML = '<form class="modal-sheet"><div class="modal-head">' + (propose ? 'Đề nghị thêm người · ' : 'Thêm người ở cùng · ') + esc(room) + '</div>' +
      '<label>Họ tên</label><input name="name" data-req autocomplete="off">' +
      '<label class="hh-check"><input type="checkbox" name="noAccount"> Không cần tài khoản (trẻ em, người không dùng điện thoại)</label>' +
      '<div data-hh-phone><label>Số điện thoại (để đăng nhập)</label><div class="phone-cc-row"><select name="phoneCc" aria-label="Mã quốc gia">' + ['84', '855'].map(function (x) { return '<option value="' + x + '"' + (x === cc ? ' selected' : '') + '>' + (x === '84' ? '🇻🇳' : '🇰🇭') + ' +' + x + '</option>'; }).join('') + '</select><input name="phone" type="tel" inputmode="tel" autocomplete="off"></div></div>' +
      '<div data-hh-kid hidden><label>Ngày sinh</label><input name="birth" type="date" max="' + today() + '">' +
      '<div data-hh-guard hidden><label>Người giám hộ trong phòng</label><select name="guardian"><option value="">— Chọn —</option>' + guards.map(function (g) { return '<option>' + esc(g) + '</option>'; }).join('') + '</select></div>' +
      '<div data-hh-why hidden><label>Lý do không cần tài khoản</label><input name="noAccWhy" autocomplete="off" placeholder="Ví dụ: người già không dùng điện thoại"></div></div>' +
      '<label>Giấy tờ</label><select name="idType"><option value="cccd">CCCD / CMND</option><option value="passport">Hộ chiếu (người nước ngoài)</option><option value="birth">Giấy khai sinh (trẻ em)</option></select>' +
      '<div data-hh-pass hidden><label>Số hộ chiếu</label><input name="passportNo" autocomplete="off"><label>Loại thị thực</label><input name="visaType" autocomplete="off" placeholder="Ví dụ DN, LĐ, DL"><label>Thị thực hết hạn</label><input name="visaUntil" type="date"></div>' +
      '<label>Ảnh giấy tờ (bắt buộc mặt trước)</label>' + idSlotsHTML() +
      '<label class="user-check"><input type="checkbox" name="idConsent"><span>Người này (trẻ em thì người giám hộ) đồng ý cho lưu thông tin và ảnh giấy tờ để khai báo tạm trú và quản lý phòng.</span></label>' +
      ((staff && !(full0 && !isOwnerNow())) || (!staff && !propose) ? '<p class="note" data-hh-pwnote>' + esc(staff ? 'Lưu xong đặt mật khẩu cho người này.' : (full0 ? 'Chủ nhà đồng ý' : 'Quản lý duyệt') + ' xong sẽ tạo tài khoản, người này đăng nhập bằng số điện thoại trên.') + '</p>' : '') +
      (full0 ? '<p class="note hh-bad">' + esc('Phòng tối đa ' + capOf(room) + ' người, đã đủ. ' + (isOwnerNow() ? 'Lưu thì phòng ở ' + (occ(c0) + pending(c0).length + 1) + ' người, số người tối đa vẫn là ' + capOf(room) + '. Muốn tăng hẳn thì sửa phòng.' : staff || !hasMgr(room) ? 'Gửi xong cần chủ nhà đồng ý cho ở thêm.' : 'Quản lý xem trước, rồi chủ nhà đồng ý cho ở thêm.')) + '</p>' : '') +
      '<p class="note">' + esc([staff ? 'Khách chính được báo, có 48 giờ để không đồng ý.' : propose ? 'Khách chính ' + mainName(room, c0) + (full0 ? ' đồng ý, quản lý xem rồi chủ nhà đồng ý cho ở thêm.' : ' đồng ý rồi quản lý duyệt.') : '', feeNote(room)].filter(Boolean).join(' ')) + '</p>' +
      '<p class="user-error" hidden></p><div class="modal-actions"><button type="button" data-close>Huỷ</button><button class="save">' + (staff ? (full0 && !isOwnerNow() ? 'Gửi chủ nhà' : 'Lưu') : propose ? 'Gửi khách chính' : full0 && !hasMgr(room) ? 'Gửi chủ nhà' : full0 ? 'Gửi quản lý' : 'Gửi quản lý duyệt') + '</button></div></form>';
    phone(o);
    var form = o.querySelector('form'), ids = wireIdSlots(form), box = form.querySelector('[data-hh-phone]'), kid = form.querySelector('[data-hh-kid]'), pass = form.querySelector('[data-hh-pass]');
    var ageNow = function () { return ageOf(form.birth.value); };
    var sync = function () {
      var a = ageNow();
      box.hidden = form.noAccount.checked; kid.hidden = !form.noAccount.checked;
      form.querySelector('[data-hh-guard]').hidden = !(form.noAccount.checked && a != null && a < 18);
      form.querySelector('[data-hh-why]').hidden = !(form.noAccount.checked && a != null && a >= 16);
      pass.hidden = form.idType.value !== 'passport';
      var pw = form.querySelector('[data-hh-pwnote]'); if (pw) pw.hidden = form.noAccount.checked;
    };
    form.noAccount.addEventListener('change', function () { if (form.noAccount.checked && form.idType.value === 'cccd') form.idType.value = 'birth'; sync(); });
    form.birth.addEventListener('change', sync); form.idType.addEventListener('change', sync);
    o.querySelector('[data-close]').addEventListener('click', function () { o.remove(); });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var name = norm(form.name.value).replace(/\|/g, ''), noAcc = form.noAccount.checked, fresh = contracts()[room] || {};
      var ph = noAcc ? '' : phoneFromForm(form.phone.value, form.phoneCc.value), a = ageNow(), pass2 = form.idType.value === 'passport';
      if (ids.pending) return err(form, 'Đang xử lý ảnh, bấm lại sau giây lát.');
      if (name.length < 2) return err(form, 'Nhập họ tên người ở cùng.');
      if (!noAcc) { var pe = contractPhoneError(form.phone.value); if (pe) return err(form, pe); }
      if (noAcc && !form.birth.value) return err(form, 'Nhập ngày sinh của người không cần tài khoản.');
      if (noAcc && a < 18 && !form.guardian.value) return err(form, 'Chọn người giám hộ đang ở trong phòng cho người dưới 18 tuổi.');
      if (noAcc && a >= 16 && norm(form.noAccWhy.value).length < 3) return err(form, 'Ghi lý do người từ 16 tuổi không cần tài khoản.');
      if (pass2 && (norm(form.passportNo.value).length < 5 || !norm(form.visaType.value) || !form.visaUntil.value)) return err(form, 'Nhập số hộ chiếu, loại thị thực và ngày thị thực hết hạn.');
      if (pass2 && form.visaUntil.value < today()) return err(form, 'Thị thực đã hết hạn, chưa thêm người này được.');
      if (!ids.photos[0]) return err(form, 'Tải ảnh mặt trước giấy tờ của người này (bắt buộc).');
      if (!form.idConsent.checked) return err(form, 'Xác nhận người này đã đồng ý cho lưu thông tin và ảnh giấy tờ.');
      if (!signed(fresh)) return err(form, 'Hợp đồng phòng này chưa ký, chưa thêm người ở cùng được.');
      if (!capOf(room)) return err(form, 'Phòng chưa đặt số người tối đa, chưa thêm người được.');
      if (movingOut(room)) return err(form, 'Khách chính đã báo trả phòng, không thêm người mới.');
      var key = pk(ph, room);
      var dupHere = norm(name) === norm(fresh.tenantName) || mates(fresh).some(function (p) { return norm(p.names) === norm(name) || (key && p.phoneKey === key); }) ||
        pending(fresh).some(function (v) { return norm(v.name) === norm(name) || (key && pk(v.phone, room) === key); }) ||
        proposals(room).some(function (x) { return !x.closed && (norm(x.ev.v.name) === norm(name) || (key && x.ev.v.phoneKey === key)); });
      if (dupHere) return err(form, 'Phòng đã có người tên này hoặc số điện thoại này.');
      var owner = noAcc ? null : phoneOwner(ph, room);
      if (owner && owner.block) return err(form, owner.block);
      var over = roomFull(room, fresh, 1 + (propose ? openProps(room) : 0));
      var v = { id: 'RM' + Date.now().toString(36), name: name, phone: ph, phoneKey: key, noAccount: noAcc, idType: form.idType.value, photos: ids.list(), at: now(), by: currentActorName(), status: 'Chờ duyệt', consentAt: now(), consentBy: currentActorName() };
      if (pass2) { v.passportNo = norm(form.passportNo.value); v.visaType = norm(form.visaType.value); v.visaUntil = form.visaUntil.value; }
      if (noAcc) { v.birth = form.birth.value; if (a < 18) v.guardian = form.guardian.value; if (a >= 16) v.noAccountReason = norm(form.noAccWhy.value); }
      if (over) v.overCap = true;
      o.remove();
      if (staff && over && isOwnerNow()) {
        v.overCapOk = capOf(room);
        return addPerson(room, v, currentActorName());
      }
      if (staff && over) {
        v.staffAdd = true;
        fresh.roommateInvites = (fresh.roommateInvites || []).concat([v]);
        saveHomeContract(room, fresh);
        appendRoomHistory(room, { kind: 'contract', title: 'Xin cho ở thêm khi phòng đủ (tối đa ' + capOf(room) + '): ' + name, detail: currentActorName() + ' gửi · chờ chủ nhà đồng ý', actor: currentActorName() });
        toast('Đã gửi chủ nhà'); return refresh();
      }
      if (staff) return addPerson(room, v, currentActorName());
      if (propose) {
        var me2 = find(acct(), true); if (!me2) return;
        mateEvent(room, me2.p, 'propose', 'Đề nghị thêm người ở cùng: ' + name, { v: v, status: 'Đã gửi' });
        toast('Đã gửi ' + (mainName(room, fresh) || 'khách chính')); return refresh();
      }
      fresh.roommateInvites = (fresh.roommateInvites || []).concat([v]);
      saveHomeContract(room, fresh);
      appendRoomHistory(room, { kind: 'contract', title: 'Mời người ở cùng: ' + name, detail: [ph, currentActorName() + ' gửi · ' + (over ? (hasMgr(room) ? 'phòng đủ, chờ quản lý xem rồi chủ nhà đồng ý' : 'chờ chủ nhà đồng ý cho ở thêm') : 'chờ quản lý duyệt')].filter(Boolean).join(' · '), actor: currentActorName() });
      toast(over && !hasMgr(room) ? 'Đã gửi chủ nhà' : over ? 'Đã gửi quản lý' : 'Đã gửi quản lý duyệt');
      refresh();
    });
  }
  function dropInvite(room, id) {
    var c = contracts()[room]; if (!c) return;
    var v = (c.roommateInvites || []).find(function (x) { return x.id === id; }); if (!v) return;
    var was = v.status;
    v.status = was === 'Từ chối' ? 'Đã bỏ' : 'Đã huỷ'; v.closedAt = now(); v.closedBy = currentActorName(); if (!window.HOME_REAL) v.photos = []; // app thật: máy chủ nhà xoá file trong kho rồi mới bỏ dấu ảnh
    saveHomeContract(room, c);
    if (was !== 'Từ chối') appendRoomHistory(room, { kind: 'contract', title: 'Huỷ mời người ở cùng: ' + v.name, detail: currentActorName(), actor: currentActorName() });
    refresh();
  }

  // Quản lý xem lời mời rồi duyệt
  function reviewInvite(room, id) {
    var c = contracts()[room] || {}, v = pending(c).find(function (x) { return x.id === id; });
    if (!v) { if (typeof appToast === 'function') appToast('Lời mời này đã được xử lý'); return; }
    var cap = capOf(room), n = occ(c), st = stageOf(room, c, v), own = isOwnerNow();
    if (st === 'owner' && !own) { toast('Phòng tối đa ' + cap + ' người, cần chủ nhà đồng ý cho ở thêm'); return; }
    if (st === 'mgr' && own) { toast('Chờ quản lý xem rồi gửi chủ nhà'); return; }
    var fwd = st === 'mgr';
    appConfirm(fwd ? 'Gửi chủ nhà cho ở thêm?' : st ? 'Cho ở ' + (n + 1) + ' người?' : 'Duyệt người ở cùng?',
      (fwd ? 'Phòng tối đa ' + cap + ' người, đã đủ. Anh/chị đồng ý thì gửi chủ nhà quyết định cho ở thêm.' : (st ? 'Phòng tối đa ' + cap + ' người. Đồng ý thì phòng ở ' + (n + 1) + ' người, số người tối đa vẫn là ' + cap + '. Muốn tăng hẳn thì sửa phòng. ' : '') + (v.noAccount ? 'Người này không cần tài khoản, chỉ ghi vào danh sách người ở.' : 'Duyệt xong đặt mật khẩu, người này đăng nhập bằng số điện thoại và xem chung tiền phòng với khách chính.')),
      fwd ? 'Gửi chủ nhà' : st ? 'Đồng ý' : 'Duyệt', function () { if (fwd) forward(room, id); else approve(room, id); }, false, {
      big: v.name, sub: room + ' · khách chính ' + mainName(room, c),
      rows: [['Số điện thoại', v.noAccount ? 'Không cần tài khoản' : showPh(v.phone)]].concat(idRows(v), [[v.staffAdd ? 'Người thêm' : 'Người mời', v.by + (v.agreedBy ? ' đề nghị · ' + v.agreedBy + ' đồng ý' : '') + ' · ' + v.at]].concat(v.mgrOk ? [['Quản lý', v.mgrOk.by + ' đồng ý · ' + v.mgrOk.at]] : [], [, ['Số người ở', n + ' → ' + (n + 1) + ' người' + (cap ? ' / tối đa ' + cap : '')], ['Phụ phí', feeNote(room) || 'Căn này chưa đặt phụ phí thêm người']])),
      photos: v.photos || [], photoLabel: 'Giấy tờ', idSides: true
    });
  }
  function forward(room, id) {
    var c = contracts()[room]; if (!c) return;
    var v = pending(c).find(function (x) { return x.id === id; });
    if (!v) { if (typeof appToast === 'function') appToast('Lời mời này đã được xử lý'); return refresh(); }
    v.mgrOk = { by: currentActorName(), at: now() }; v.overCap = true;
    saveHomeContract(room, c);
    appendRoomHistory(room, { kind: 'contract', title: 'Quản lý đồng ý, gửi chủ nhà cho ở thêm: ' + v.name, detail: 'Phòng tối đa ' + capOf(room) + ' · ' + currentActorName(), actor: currentActorName() });
    toast('Đã gửi chủ nhà'); refresh();
  }
  function approve(room, id) {
    var c = contracts()[room]; if (!c) return;
    var v = pending(c).find(function (x) { return x.id === id; });
    if (!v) { if (typeof appToast === 'function') appToast('Lời mời này đã được xử lý'); return refresh(); }
    if (!signed(c)) { if (typeof appToast === 'function') appToast('Hợp đồng chưa ký, chưa duyệt được'); return; }
    if (movingOut(room)) { toast('Khách chính đã báo trả phòng, không duyệt thêm người'); return; }
    if (!capOf(room)) { toast('Phòng chưa đặt số người tối đa'); return; }
    var st = stageOf(room, c, v);
    if (st === 'mgr') return isOwnerNow() ? toast('Chờ quản lý xem rồi gửi chủ nhà') : forward(room, id);
    if (st && !isOwnerNow()) { toast('Phòng tối đa ' + capOf(room) + ' người, cần chủ nhà đồng ý cho ở thêm'); return; }
    var owner = v.noAccount ? null : phoneOwner(v.phone, room);
    if (owner && owner.block) { if (typeof appToast === 'function') appToast(owner.block); return; }
    var photos = v.photos || [], copy = Object.assign({}, v, { photos: photos }, st ? { overCapOk: capOf(room) } : {});
    v.status = 'Đã duyệt'; v.reviewedBy = currentActorName(); v.reviewedAt = now(); v.photos = [];
    saveHomeContract(room, c);
    addPerson(room, copy, currentActorName(), v.staffAdd ? '' : id);
  }
  // Ghi người ở cùng vào hợp đồng (từ lời mời đã duyệt hoặc chủ nhà / quản lý thêm thẳng), rồi tạo tài khoản nếu cần
  function addPerson(room, v, by, inviteId) {
    var c = contracts()[room]; if (!c) return;
    if (inviteId && all(c).some(function (p) { return p.inviteId === inviteId; })) return refresh();
    var cur = Date.now(); try { cur = periodBounds(roomLease(room).dueDay, dayStart()).start; } catch (e) {}
    base(c);
    var photos = v.photos || [];
    var reuse = v.noAccount ? null : (phoneOwner(v.phone, room) || {}).reuse;
    var key = v.noAccount ? '' : (reuse && reuse.room === room ? reuse.key : 'tenant|' + v.name + '|' + room);
    var p = { id: 'XP' + Date.now().toString(36), count: 1, names: v.name, phone: v.phone || '', phoneKey: v.phoneKey || (v.phone ? pk(v.phone, room) : ''), noAccount: !!v.noAccount, idType: v.idType || 'cccd', photos: photos, at: now(), by: v.by || by, approvedBy: by, fromDate: dstart(), fromPeriod: monthKeyOf(cur), residenceDeclaredAt: '', account: key, inviteId: inviteId || '' };
    EXTRA_FIELDS.forEach(function (f) { if (v[f]) p[f] = v[f]; });
    if (!inviteId && mainUser(room, c)) p.mainOk = { status: 'Chờ', at: now(), by: (v.staffAdd && v.by) || by };
    if (reuse) { p.uuid = reuse.uuid || ''; p.reused = true; }
    all(c).forEach(function (o) { if (o.toDate && p.fromDate && o.toDate > p.fromDate && ((p.phoneKey && o.phoneKey === p.phoneKey) || norm(o.names) === norm(p.names))) o.toDate = Math.max(o.fromDate || 0, p.fromDate); });
    c.extraPeople = all(c).concat([p]);
    recount(c);
    saveHomeContract(room, c);
    appendRoomHistory(room, { kind: 'contract', title: (inviteId ? 'Đã duyệt người ở cùng: ' : 'Thêm người ở cùng: ') + v.name, detail: 'Nay ' + c.occupants + ' người' + (v.overCapOk ? ' (tối đa ' + v.overCapOk + ', chủ nhà đồng ý cho ở thêm)' : '') + ' · phụ lục hợp đồng: số người ở ' + c.occupants + ' · ' + (v.staffAdd && v.by && v.by !== by ? v.by + ' thêm, ' + by + ' đồng ý' : by + (inviteId ? ' duyệt' : ' thêm')), actor: by });
    try { ensureRentCharges(); } catch (e) {}
    refresh();
    if (!v.noAccount) makeAccount(room, p);
  }
  // Tạo tài khoản: máy chủ tạo xong mới báo "Đã tạo"; lỗi thì giữ "chưa tạo xong", bấm Tạo tài khoản để làm lại
  function makeAccount(room, p) {
    var reused = p.reused && p.uuid;
    var o = document.createElement('div');
    o.className = 'modal-overlay';
    if (reused) {
      o.innerHTML = '<div class="modal-sheet"><div class="modal-head">Dùng lại tài khoản cũ</div><div class="pw-box">' + esc(p.names) + ' đã có tài khoản với số <b>' + esc(showPh(p.phone)) + '</b>. Đăng nhập bằng mật khẩu cũ, quên thì bấm "Quên mật khẩu?" ở màn đăng nhập.</div><p class="user-error" hidden></p><div class="modal-actions"><button type="button" class="save" data-ok>Gắn vào ' + esc(room) + '</button></div></div>';
      phone(o);
      o.querySelector('[data-ok]').addEventListener('click', function () {
        var btn = this; btn.disabled = true;
        link(room, p, p.uuid, function (e2) { if (e2) { btn.disabled = false; return err(o, e2); } ready(room, p.id, p.uuid); o.remove(); if (typeof appToast === 'function') appToast('Đã gắn ' + p.names + ' vào ' + room); });
      });
      return;
    }
    o.innerHTML = '<form class="modal-sheet"><div class="modal-head">Mật khẩu cho ' + esc(p.names) + '</div><p class="note" style="margin-top:0">' + esc(p.names) + ' đăng nhập bằng số ' + esc(showPh(p.phone)) + '.</p><label>Mật khẩu</label><div class="pw-row"><input name="pw" minlength="6" maxlength="40" value="' + randomPassword() + '" autocomplete="off"><button type="button" class="pw-gen" data-random>Tạo số khác</button></div><p class="user-error" hidden></p><div class="modal-actions"><button type="button" data-later>Để sau</button><button class="save">Tạo tài khoản</button></div></form>';
    phone(o);
    var form = o.querySelector('form');
    o.querySelector('[data-random]').addEventListener('click', function () { form.pw.value = randomPassword(); });
    o.querySelector('[data-later]').addEventListener('click', function () { o.remove(); if (typeof appToast === 'function') appToast('Chưa tạo tài khoản. Mở Người ở cùng → Tạo tài khoản để làm sau.'); });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var pw = String(form.pw.value || '').trim(), btn = form.querySelector('.save');
      if (pw.length < 6) return err(form, 'Mật khẩu cần ít nhất 6 ký tự.');
      btn.disabled = true; btn.textContent = 'Đang tạo…';
      var done = function () {
        form.innerHTML = '<div class="modal-head">Đã tạo tài khoản</div><div class="pw-box">Báo cho ' + esc(p.names) + ' đăng nhập bằng số <b>' + esc(showPh(p.phone)) + '</b><br>Mật khẩu <strong>' + esc(pw) + '</strong></div><p class="note">Vào app chọn tiếng, nhập số điện thoại và mật khẩu này. Đăng nhập xong nên tự đổi mật khẩu.</p><div class="modal-actions"><button type="button" class="save" data-close>Xong</button></div>';
        form.querySelector('[data-close]').addEventListener('click', function () { o.remove(); });
      };
      var fail = function (m) { btn.disabled = false; btn.textContent = 'Tạo tài khoản'; err(form, 'Chưa tạo được tài khoản: ' + m + '. Sửa rồi bấm lại.'); };
      localUser(room, p);
      if (!window.HOME_REAL || !window.HOME_DB || !window.HOME_DB.saveAccount) {
        try { setUserPassword(p.account, pw, currentActorName(), false); } catch (x) {}
        ready(room, p.id, ''); return done();
      }
      window.HOME_DB.saveAccount({ phoneKey: p.phoneKey, name: p.names, role: 'khach', password: pw, onlyNew: true, room: room, mate: true }).then(function (r) {
        if (!r || r.error) return fail((r && r.error) || 'lỗi không rõ');
        (r.da_gan ? function (a, b, c, cb) { cb(''); } : link)(room, p, r.id, function (e2) {
          if (e2) return fail(e2);
          ready(room, p.id, r.id);
          if (r.da_co) { form.innerHTML = '<div class="modal-head">Dùng lại tài khoản cũ</div><div class="pw-box">' + esc(p.names) + ' đã có tài khoản số <b>' + esc(showPh(p.phone)) + '</b>, đăng nhập bằng mật khẩu cũ.</div><div class="modal-actions"><button type="button" class="save" data-close>Xong</button></div>'; form.querySelector('[data-close]').addEventListener('click', function () { o.remove(); }); return; }
          done();
        });
      });
    });
  }
  function localUser(room, p) {
    var users = readUsers(), u = users.find(function (x) { return x.key === p.account; });
    if (!u) { u = { key: p.account, id: 'U-' + Date.now().toString(36).slice(-6), role: 'tenant', name: p.names, fullName: p.names, room: room, phone: p.phone, status: 'Đang hoạt động', history: [] }; users.push(u); }
    else { u.status = 'Đang hoạt động'; u.phone = p.phone; u.room = room; }
    if (p.uuid) u.uuid = p.uuid;
    try { logUserChange(u, 'Tài khoản người ở cùng phòng ' + room); } catch (e) {}
    saveUsers(users);
    try { refreshUserAccounts(); } catch (e) {}
  }
  function link(room, p, id, cb) {
    if (!window.HOME_REAL || !window.HOME_DB || !window.HOME_DB.linkTenantRoom) return cb('');
    window.HOME_DB.linkTenantRoom(id, room, { mate: true }).then(function (l) { cb(l && l.error ? l.error : ''); });
  }
  function ready(room, pid, uuid) {
    var c = contracts()[room], x = c && all(c).find(function (i) { return i.id === pid; }); if (!x) return;
    x.accountReadyAt = now(); if (uuid) x.uuid = uuid;
    saveHomeContract(room, c);
    var users = readUsers(), u = users.find(function (y) { return y.key === x.account; });
    if (!u) localUser(room, x); else if (uuid && !u.uuid) { u.uuid = uuid; saveUsers(users); }
    refresh();
  }
  function rejectInvite(room, id) {
    var c = contracts()[room] || {}, v = pending(c).find(function (x) { return x.id === id; }); if (!v) return;
    var ownerAsk = needOwner(room, c, v) && isOwnerNow(), noLabel = ownerAsk ? 'Không đồng ý' : 'Không duyệt';
    var o = document.createElement('div');
    o.className = 'modal-overlay';
    o.innerHTML = '<form class="modal-sheet"><div class="modal-head">' + (ownerAsk ? 'Không đồng ý cho ' + esc(v.name) + ' ở thêm?' : 'Không duyệt ' + esc(v.name) + '?') + '</div><label>Lý do (khách chính và quản lý thấy)</label><textarea name="reason" data-req rows="3"></textarea><p class="user-error" hidden></p><div class="modal-actions"><button type="button" data-close>Huỷ</button><button class="save danger">' + noLabel + '</button></div></form>';
    phone(o);
    var form = o.querySelector('form');
    o.querySelector('[data-close]').addEventListener('click', function () { o.remove(); });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var reason = form.reason.value.trim(); if (reason.length < 3) return err(form, 'Ghi lý do để khách chính biết.');
      var f = contracts()[room], x = f && pending(f).find(function (i) { return i.id === id; }); if (!x) return o.remove();
      x.status = 'Từ chối'; if (ownerAsk) x.ownerNo = true; x.reason = reason; x.reviewedBy = currentActorName(); x.reviewedAt = now(); x.photos = [];
      saveHomeContract(room, f);
      appendRoomHistory(room, { kind: 'contract', title: (ownerAsk ? 'Không đồng ý cho ở thêm: ' : 'Không duyệt người ở cùng: ') + x.name, detail: reason + ' · ' + currentActorName(), actor: currentActorName() });
      o.remove(); refresh();
    });
  }

  // Dọn đi
  function leave(room, id, by, why) {
    var f = contracts()[room], x = f && mates(f).find(function (i) { return i.id === id; }); if (!x) return;
    var next = Date.now(); try { next = periodBounds(roomLease(room).dueDay, dayStart()).next; } catch (e) {}
    base(f);
    x.leftAt = now(); x.leftBy = by; x.toPeriod = monthKeyOf(next); delete x.leftRequest;
    // Khách chính không đồng ý người quản lý thêm thẳng: không tính phụ phí người này; còn lại tính tới ngày dọn đi, ít nhất 7 ngày
    if (x.fromDate) x.toDate = x.mainOk && x.mainOk.status === 'Không đồng ý' ? x.fromDate : Math.max(dstart(), x.fromDate + 7 * DAYMS);
    if (f.delegate && f.delegate.personId === x.id) delete f.delegate;
    recount(f);
    saveHomeContract(room, f);
    try { ensureRentCharges(); } catch (e) {}
    appendRoomHistory(room, { kind: 'contract', title: 'Người ở cùng dọn đi: ' + x.names, detail: 'Nay ' + f.occupants + ' người · ' + why, actor: by });
    unlinkLeft(); refresh();
  }
  function rowsFor(room, c, p) {
    var n = occ(c), fee = feeNote(room), nextP = ''; try { nextP = monthKeyOf(periodBounds(roomLease(room).dueDay, dayStart()).next).split('-').reverse().join('/'); } catch (e) {}
    return [['Số người ở', n + ' → ' + Math.max(1, n - count(p)) + ' người']].concat(fee && nextP ? [['Phụ phí', 'Tính đến ngày xác nhận dọn đi (ít nhất 7 ngày ở)']] : []);
  }
  // Quản lý / chủ nhà ghi: có hiệu lực ngay. Khách chính ghi: chờ quản lý xác nhận (tránh ghi khống để thôi phụ phí)
  function askLeft(room, id) {
    var c = contracts()[room] || {}, p = mates(c).find(function (x) { return x.id === id; }); if (!p) return;
    if (isStaff(room)) return appConfirm('Ghi ' + p.names + ' đã dọn đi?', 'Người này không vào app xem phòng được nữa. Lịch sử vẫn giữ. Hợp đồng và tiền cọc không đổi.', 'Đã dọn đi', function () { leave(room, id, currentActorName(), currentActorName() + ' ghi'); }, true, { big: p.names, sub: room, rows: rowsFor(room, c, p) });
    appConfirm('Báo ' + p.names + ' đã dọn đi?', 'Quản lý xác nhận xong mới bớt người và thôi phụ phí.' + (p.account && !p.noAccount && p.accountReadyAt ? ' ' + p.names + ' sẽ thấy báo này.' : ''), 'Gửi quản lý', function () {
      var f = contracts()[room], x = f && mates(f).find(function (i) { return i.id === id; }); if (!x) return;
      // Bản thật: chính sự kiện này là dòng lịch sử (không ghi thêm dòng thứ hai, tester 17/11: trùng 2 dòng)
      if (window.HOME_REAL) { hhEvent(room, 'mainLeft', id, currentActorName(), 'Báo người ở cùng dọn đi: ' + x.names, { actor: currentActorName(), detail: currentActorName() + ' báo · chờ quản lý xác nhận' }); refresh(); return; }
      x.leftRequest = { by: currentActorName(), at: now() }; saveHomeContract(room, f);
      appendRoomHistory(room, { kind: 'contract', title: 'Báo người ở cùng dọn đi: ' + x.names, detail: currentActorName() + ' báo · chờ quản lý xác nhận', actor: currentActorName() });
      refresh();
    }, true, { big: p.names, sub: room, rows: rowsFor(room, c, p) });
  }
  function selfLeft(room, id) {
    var c = contracts()[room] || {}, p = mates(c).find(function (x) { return x.id === id; }); if (!p) return;
    appConfirm('Anh/chị đã dọn khỏi ' + room + '?', 'Bấm xong anh/chị không vào xem phòng này được nữa. Quản lý xác nhận rồi mới thôi phụ phí; quá 3 ngày chưa xác nhận thì tự có hiệu lực.', 'Tôi đã dọn đi', function () {
      // Người ở cùng không sửa hợp đồng được: ghi việc vào sự kiện phòng, máy quản lý ghi vào hợp đồng; tự rời phòng trên máy chủ ngay
      mateEvent(room, p, 'left', 'Người ở cùng báo đã dọn đi: ' + p.names);
      if (!window.HOME_REAL) { setMate(room, id, function (x) { x.leftRequest = { by: p.names, at: now(), self: true }; }); appendRoomHistory(room, { kind: 'contract', title: 'Người ở cùng báo đã dọn đi: ' + p.names, detail: 'Chờ quản lý xác nhận', actor: p.names }); refresh(); }
      else if (window.HOME_DB && window.HOME_DB.client) window.HOME_DB.client.rpc('khach_roi_phong', { p_ma_phong: room }).then(function () { window.__tenantLeft = true; refresh(); });
    }, true, { big: p.names, sub: room, rows: rowsFor(room, c, p) });
  }
  function confirmLeft(room, id) {
    var c = contracts()[room] || {}, p = mates(c).find(function (x) { return x.id === id; }); if (!p || !p.leftRequest) return;
    appConfirm('Xác nhận ' + p.names + ' đã dọn đi?', (p.leftRequest.self ? 'Tự báo' : p.leftRequest.by + ' báo') + ' lúc ' + p.leftRequest.at + '.', 'Xác nhận', function () { leave(room, id, currentActorName(), (p.leftRequest.self ? 'tự báo' : p.leftRequest.by + ' báo') + ' · ' + currentActorName() + ' xác nhận'); }, true, { big: p.names, sub: room, rows: rowsFor(room, c, p) });
  }
  function stillHere(room, id) {
    var f = contracts()[room], x = f && mates(f).find(function (i) { return i.id === id; }); if (!x || !x.leftRequest) return;
    if (isMate(room) && window.HOME_REAL) { mateEvent(room, x, 'stay', x.names + ' báo vẫn đang ở'); x.stayAt = now(); if (typeof appToast === 'function') appToast('Đã báo quản lý anh/chị vẫn ở'); return refresh(); }
    var by = x.leftRequest.by; delete x.leftRequest;
    saveHomeContract(room, f);
    appendRoomHistory(room, { kind: 'contract', title: x.names + ' báo vẫn đang ở', detail: 'Không đúng với báo dọn đi của ' + by, actor: x.names });
    refresh();
  }
  // Chuyển người ở cùng sang phòng khác trong căn: dọn khỏi phòng cũ, thêm vào phòng mới, giữ tài khoản
  function openMove(room, id) {
    var c = contracts()[room] || {}, p = mates(c).find(function (x) { return x.id === id; }); if (!p) return;
    var h = house(room), cs = contracts();
    var rooms = Object.keys(cs).filter(function (r) { return r !== room && cs[r] && signed(cs[r]) && house(r) === h && isStaff(r) && capOf(r) && !movingOut(r); });
    if (!rooms.length) { if (typeof appToast === 'function') appToast('Căn này chưa có phòng nào khác đang thuê mà anh/chị phụ trách'); return; }
    var o = document.createElement('div');
    o.className = 'modal-overlay';
    o.innerHTML = '<form class="modal-sheet"><div class="modal-head">Chuyển ' + esc(p.names) + '</div><label>Sang phòng</label><select name="to">' + rooms.map(function (r) { return '<option>' + esc(r) + '</option>'; }).join('') + '</select><p class="note">Giữ tài khoản và lịch sử. Phụ phí tính theo số ngày ở mỗi phòng. Khách chính phòng mới được báo, có 48 giờ để không đồng ý.</p><p class="user-error" hidden></p><div class="modal-actions"><button type="button" data-close>Huỷ</button><button class="save">Chuyển</button></div></form>';
    phone(o);
    var form = o.querySelector('form');
    o.querySelector('[data-close]').addEventListener('click', function () { o.remove(); });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var to = form.to.value, t = contracts()[to];
      if (roomFull(to, t, 1)) return err(form, to + ' đã đủ ' + capOf(to) + ' người.');
      o.remove();
      leave(room, id, currentActorName(), 'chuyển sang ' + to);
      var v = { name: p.names, phone: p.phone, phoneKey: p.phoneKey, noAccount: p.noAccount, idType: p.idType, photos: p.photos, by: currentActorName() };
      var t2 = contracts()[to]; base(t2);
      var cur = Date.now(); try { cur = periodBounds(roomLease(to).dueDay, dayStart()).start; } catch (x) {}
      var q = { id: 'XP' + Date.now().toString(36), count: 1, names: v.name, phone: v.phone, phoneKey: v.phoneKey, noAccount: v.noAccount, idType: v.idType, photos: v.photos || [], at: now(), by: v.by, approvedBy: v.by, fromDate: dstart(), fromPeriod: monthKeyOf(cur), residenceDeclaredAt: '', account: p.noAccount ? '' : 'tenant|' + p.names + '|' + to, uuid: p.uuid || '', movedFrom: room };
      EXTRA_FIELDS.forEach(function (f2) { if (p[f2]) q[f2] = p[f2]; });
      if (mainUser(to, t2)) q.mainOk = { status: 'Chờ', at: now(), by: currentActorName() };
      t2.extraPeople = all(t2).concat([q]); recount(t2); saveHomeContract(to, t2);
      appendRoomHistory(to, { kind: 'contract', title: 'Người ở cùng chuyển đến: ' + p.names, detail: 'Từ ' + room + ' · nay ' + t2.occupants + ' người · ' + currentActorName(), actor: currentActorName() });
      if (p.uuid && !p.noAccount) link(to, q, p.uuid, function (e2) { if (!e2) ready(to, q.id, p.uuid); else if (typeof appToast === 'function') appToast('Chưa gắn được vào ' + to + ': ' + e2); });
      else if (!p.noAccount) { localUser(to, q); ready(to, q.id, ''); }
      try { ensureRentCharges(); } catch (x) {}
      refresh();
    });
  }
  // Việc người ở cùng báo (dọn đi, vẫn ở, muốn thuê tiếp, đã đọc điều khoản) đi qua sự kiện phòng — khách ghi được —
  // rồi máy chủ nhà / quản lý phụ trách ghi vào hợp đồng.
  function hhEvent(room, action, personId, who, title, extra) {
    var all = {}; try { all = JSON.parse(localStorage.getItem('homeTenantEvents') || '{}'); } catch (e) {}
    var ev = Object.assign({ id: String(Date.now()) + Math.random().toString(16).slice(2), kind: 'household', action: action, personId: personId, tenantName: who, title: title, date: new Date().toLocaleDateString('vi-VN'), at: now(), status: 'Chờ xử lý' }, extra || {});
    all[room] = [ev].concat(Array.isArray(all[room]) ? all[room] : []);
    localStorage.setItem('homeTenantEvents', JSON.stringify(all));
    return ev;
  }
  function mateEvent(room, p, action, title, extra) { return hhEvent(room, action, p.id, p.names, title, extra); }
  window.householdMateEvent = function (room, action, title) { var r = window.roommateEntry(acct()); if (r && r.room === room) return mateEvent(room, r.p, action, title); };
  // Máy chủ đóng dấu người ghi (uid) vào từng việc: máy quản lý chỉ làm theo việc do đúng người đó gửi
  function fromOk(ev, uuid) { return !window.HOME_REAL || (!!uuid && ev.uid === uuid); }
  var MAIN_ACTS = { mainOk: 1, mainNo: 1, mainLeft: 1 }, RECORD_ACTS = { propose: 1, proposeNo: 1, proposeCancel: 1 };
  function applyMateEvents() {
    if (['owner', 'manager'].indexOf(acct().split('|')[0]) < 0) return;
    var evs = {}; try { evs = readTenantEventsSafe(); } catch (e) { return; }
    var done = [];
    Object.keys(evs).forEach(function (room) {
      if (!isStaff(room)) return;
      (evs[room] || []).forEach(function (ev) {
        if (!ev || ev.kind !== 'household' || ev.status !== 'Chờ xử lý' || RECORD_ACTS[ev.action]) return;
        var c = contracts()[room], p = c && all(c).find(function (x) { return x.id === ev.personId; });
        var mu = MAIN_ACTS[ev.action] ? mainUser(room, c) : null;
        if (p && !p.leftAt && fromOk(ev, MAIN_ACTS[ev.action] ? mu && mu.uuid : p.uuid)) {
          if (ev.action === 'left' && !p.leftRequest) { setMate(room, p.id, function (x) { x.leftRequest = { by: p.names, at: ev.at, self: true }; }); appendRoomHistory(room, { id: ev.id + '-h', kind: 'contract', title: 'Người ở cùng báo đã dọn đi: ' + p.names, detail: 'Chờ quản lý xác nhận', actor: p.names }); }
          if (ev.action === 'stay' && p.leftRequest && !p.leftRequest.self) { setMate(room, p.id, function (x) { delete x.leftRequest; }); appendRoomHistory(room, { id: ev.id + '-h', kind: 'contract', title: p.names + ' báo vẫn đang ở', detail: 'Không đúng với báo dọn đi của ' + p.leftRequest.by, actor: p.names }); }
          if (ev.action === 'wantStay') setMate(room, p.id, function (x) { x.wantStayAt = ev.at; });
          if (ev.action === 'rules') setMate(room, p.id, function (x) { x.rulesReadAt = ev.at; });
          // Khách chính báo người ở cùng dọn đi (máy chủ không cho khách sửa danh sách người ở trong hợp đồng → đi qua sự kiện)
          if (ev.action === 'mainLeft' && !p.leftRequest) setMate(room, p.id, function (x) { x.leftRequest = { by: ev.tenantName || 'Khách chính', at: ev.at }; });
          if (ev.action === 'mainOk' || ev.action === 'mainNo') mainAnswer(room, p.id, ev.action === 'mainOk', ev.reason, ev.at, ev.tenantName, ev.id + '-h');
        }
        done.push([room, ev.id]);
      });
    });
    housekeeping();
    if (!done.length) return;
    var fresh = readTenantEventsSafe(); // leave() vừa ghi thêm lịch sử: đọc lại rồi mới đánh dấu
    done.forEach(function (d) { var e = (fresh[d[0]] || []).find(function (x) { return x.id === d[1]; }); if (e) { e.status = 'Đã xử lý'; e.doneAt = now(); } });
    localStorage.setItem('homeTenantEvents', JSON.stringify(fresh)); refresh();
  }
  // Khách chính trả lời người ở cùng do quản lý / chủ nhà thêm thẳng
  function mainAnswered(room, pid) { return eventPending(room, pid, 'mainOk') || eventPending(room, pid, 'mainNo'); }
  function mainAnswer(room, id, ok, reason, at, who, hid) {
    var c = contracts()[room], p = c && mates(c).find(function (x) { return x.id === id; }); if (!p || !p.mainOk || p.mainOk.status !== 'Chờ') return;
    who = who || mainName(room, c);
    var by0 = p.mainOk.by;
    if (overdue(p, at)) { autoAgree(room, p); return; }
    setMate(room, id, function (x) { x.mainOk = { status: ok ? 'Đồng ý' : 'Không đồng ý', at: at || now(), by: who, reason: reason || '', addedBy: by0 }; });
    if (ok) { appendRoomHistory(room, Object.assign(hid ? { id: hid } : {}, { kind: 'contract', title: 'Khách chính đồng ý người ở cùng: ' + p.names, detail: who, actor: who })); refresh(); }
    else leave(room, id, who, 'khách chính không đồng ý' + (reason ? ': ' + reason : ''));
  }
  // Quá 48 giờ kể từ lúc thêm: coi như khách chính đồng ý (trả lời muộn cũng không tính)
  function overdue(p, at) { var t0 = p && p.mainOk && parseViTime(p.mainOk.at); return !!t0 && (parseViTime(at) || Date.now()) - t0 > 2 * DAYMS; }
  function autoAgree(room, p) {
    var m0 = p.mainOk;
    setMate(room, p.id, function (x) { x.mainOk = { status: 'Tự đồng ý', at: now(), addedBy: m0.by }; });
    appendRoomHistory(room, { id: 'auto-' + p.id, kind: 'contract', title: 'Người ở cùng ' + p.names + ': khách chính không trả lời 48 giờ, coi như đồng ý', actor: 'App' });
    refresh();
  }
  // Việc tự chạy trên máy chủ nhà / quản lý phụ trách
  function housekeeping() {
    var cs = contracts();
    Object.keys(cs).forEach(function (room) {
      var c = cs[room]; if (!c || !isStaff(room)) return;
      mates(c).forEach(function (p) {
        var lr = p.leftRequest, t0 = lr && lr.self && parseViTime(lr.at);
        if (t0 && Date.now() - t0 > 3 * DAYMS) return leave(room, p.id, 'App', 'tự báo ' + day(lr.at) + ' · quá 3 ngày chưa xác nhận');
        if (p.mainOk && p.mainOk.status === 'Chờ' && overdue(p) && !mainAnswered(room, p.id)) autoAgree(room, p);
      });
      // Khách chính huỷ báo trả phòng: bỏ "muốn thuê tiếp" của lần đó, lần báo sau người ở cùng phải bấm lại (tester 17/11)
      if (!movingOut(room) && mates(c).some(function (p) { return p.wantStayAt; })) { var fw = contracts()[room]; mates(fw).forEach(function (p) { delete p.wantStayAt; }); saveHomeContract(room, fw); }
      if (movingOut(room) && pending(contracts()[room]).length) {
        var f = contracts()[room];
        var pend = pending(f), names = pend.map(function (v) { return v.names; }).filter(Boolean).join(', ');
        pend.forEach(function (v) { v.status = 'Đã huỷ'; v.closedAt = now(); v.closedBy = 'App · khách chính báo trả phòng'; if (!window.HOME_REAL) v.photos = []; });
        saveHomeContract(room, f);
        // Mã cố định theo lời mời: nhiều máy nhân viên cùng tự huỷ thì lịch sử vẫn chỉ 1 dòng (tester 17/11: ghi 3 lần)
        appendRoomHistory(room, { id: 'auto-cancel-' + pend.map(function (v) { return v.id; }).join('-'), kind: 'contract', title: 'Tự huỷ lời mời người ở cùng' + (names ? ': ' + names : ''), detail: 'Khách chính báo trả phòng', actor: 'App' });
      }
    });
  }
  window.applyHouseholdEvents = applyMateEvents;
  setTimeout(applyMateEvents, 3000); setInterval(applyMateEvents, 30000);
  // Máy chủ nhà / quản lý: gỡ người đã dọn đi khỏi phòng trên máy chủ (dự phòng khi lúc ghi chưa gỡ được)
  var unlinking = {};
  function unlinkLeft() {
    if (!window.HOME_REAL || !window.HOME_DB || !window.HOME_DB.unlinkTenantRoom || ['owner', 'manager'].indexOf(acct().split('|')[0]) < 0) return;
    var cs = contracts(), recs = {}; try { recs = readCheckouts(); } catch (e) {}
    function idOf(room, p) { var u = (readUsers() || []).find(function (x) { return x.uuid && (x.uuid === p.uuid || same(p, x.key, room)); }); return p.uuid || (u && u.uuid); }
    // Người đó đang ở lại phòng này (quay lại, nhận chuyển hợp đồng, thành khách chính): không gỡ
    function stillIn(room, id) { var c = cs[room]; if (!c) return false; var mu = mainUser(room, c); return (mu && mu.uuid === id) || mates(c).some(function (q) { return q.uuid === id; }); }
    function go(room, p, mark) {
      if (!p.account || !p.leftAt || p.unlinkedAt || unlinking[p.id] || !isStaff(room)) return;
      var id = idOf(room, p); if (!id) return;
      if (stillIn(room, id)) return mark();
      unlinking[p.id] = 1;
      window.HOME_DB.unlinkTenantRoom(id, room).then(function (r) { delete unlinking[p.id]; if (!r.error) mark(); });
    }
    Object.keys(cs).forEach(function (room) {
      all(cs[room]).forEach(function (p) { go(room, p, function () { var f = contracts()[room], x = f && all(f).find(function (i) { return i.id === p.id; }); if (x && !x.unlinkedAt) { x.unlinkedAt = now(); saveHomeContract(room, f); } }); });
    });
    Object.keys(recs).forEach(function (room) {
      var rec = recs[room]; if (!rec || !rec.contract) return;
      (rec.contract.extraPeople || []).forEach(function (p) { go(room, p, function () { var a2 = readCheckouts(), r2 = a2[room], x = r2 && r2.contract && (r2.contract.extraPeople || []).find(function (i) { return i.id === p.id; }); if (x && !x.unlinkedAt) { x.unlinkedAt = now(); localStorage.setItem('homeCheckouts', JSON.stringify(a2)); } }); });
    });
  }
  setTimeout(unlinkLeft, 4000); setInterval(unlinkLeft, 60000);
  function checkLeft() {
    var me = serverMe();
    if (!window.HOME_REAL || !me || me.vai_tro !== 'khach') return;
    if (!window.HOME_DB) return window.addEventListener('home-db-ready', checkLeft, { once: true });
    window.HOME_DB.client.from('khach_phong').select('dang_o, ma_phong').eq('khach_id', me.id).then(function (r) {
      if (r.error || !r.data) return;
      var left = !r.data.some(function (x) { return x.dang_o; });
      // Tester 19/11: vừa được chuyển sang phòng khác → tự mở đúng phòng mới, không phải đăng nhập lại
      var cur = acct().split('|'), now = r.data.filter(function (x) { return x.dang_o; }).map(function (x) { return x.ma_phong; });
      if (cur[0] === 'tenant' && cur[2] && now.length && now.indexOf(cur[2]) < 0 && Date.now() - (Number(sessionStorage.getItem('homeRoomSwitch' + cur[2] + '>' + now[0])) || 0) > 120000) {
        try { sessionStorage.setItem('homeRoomSwitch' + cur[2] + '>' + now[0], String(Date.now())); var su = JSON.parse(localStorage.getItem('homeServerUser') || 'null'); if (su) { su.key = 'tenant|' + cur[1] + '|' + now[0]; localStorage.setItem('homeServerUser', JSON.stringify(su)); } localStorage.setItem('homeAccount', 'tenant|' + cur[1] + '|' + now[0]); } catch (e) {}
        return location.reload();
      }
      if (left !== !!window.__tenantLeft) { window.__tenantLeft = left; refresh(); }
    });
  }
  checkLeft(); setInterval(checkLeft, 60000);

  // ---- Đề nghị thêm người (người ở cùng → khách chính đồng ý → quản lý duyệt), anh chốt 15/11 ----
  function proposals(room) {
    var evs = []; try { evs = readTenantEventsSafe()[room] || []; } catch (e) {}
    var c = contracts()[room] || {}, closed = {};
    evs.forEach(function (e) { if (e && e.kind === 'household' && (e.action === 'proposeNo' || e.action === 'proposeCancel') && e.ref) closed[e.ref] = e; });
    (c.roommateInvites || []).forEach(function (v) { if (v.proposalId) closed[v.proposalId] = { action: 'invited', invite: v }; });
    var mo = movingOut(room);
    return evs.filter(function (e) { return e && e.kind === 'household' && e.action === 'propose' && e.v; }).map(function (e) { return { ev: e, closed: closed[e.id] || (mo ? { action: 'proposeCancel', auto: true } : null) }; });
  }
  function recent(at) { var t = parseViTime(at) || 0; return !!t && Date.now() - t < 7 * DAYMS; }
  function proposalState(room, x) {
    var k = x.closed, c = contracts()[room] || {};
    if (!k) return 'chờ ' + (mainName(room, c) || 'khách chính') + ' đồng ý';
    if (k.action === 'proposeCancel') return '';
    if (k.action === 'proposeNo') return recent(k.at) ? 'khách chính không đồng ý' + (k.reason ? ': ' + k.reason : '') : '';
    var v = k.invite;
    var pv = pending(c).filter(function (y) { return y.id === v.id; })[0];
    if (pv) { var st2 = stageOf(room, c, pv); return 'khách chính đồng ý · ' + (st2 === 'owner' ? 'chờ chủ nhà đồng ý cho ở thêm' : st2 === 'mgr' ? 'chờ quản lý xem rồi gửi chủ nhà' : 'chờ quản lý duyệt'); }
    if (v.status === 'Từ chối') return recent(v.reviewedAt) ? (v.ownerNo ? 'chủ nhà không đồng ý' : 'quản lý không duyệt') + (v.reason ? ': ' + v.reason : '') : '';
    if (v.status === 'Đã huỷ') return recent(v.closedAt) ? 'đã huỷ' : '';
    return '';
  }
  function infoRows(list) { return list.map(function (r) { return '<div class="user-info-row"><span>' + esc(r[0]) + '</span><strong>' + esc(r[1]) + '</strong></div>'; }).join(''); }
  var ID_NAMES = { cccd: 'CCCD / CMND', passport: 'Hộ chiếu', birth: 'Giấy khai sinh' };
  function reviewProposal(room, evId) {
    var x = proposals(room).filter(function (y) { return y.ev.id === evId; })[0];
    if (!x || x.closed) return toast('Đề nghị này đã được xử lý');
    var v = x.ev.v, c = contracts()[room] || {}, n = occ(c), cap = capOf(room);
    var o = document.createElement('div'); o.className = 'modal-overlay';
    o.innerHTML = '<div class="modal-sheet"><div class="modal-head">' + esc(x.ev.tenantName) + ' đề nghị thêm người</div>' +
      infoRows([['Họ tên', v.name], ['Số điện thoại', v.noAccount ? 'Không cần tài khoản' : showPh(v.phone)], ['Giấy tờ', ID_NAMES[v.idType] || '']].concat(idRows(v), [['Số người ở', n + ' → ' + (n + 1) + ' người' + (cap ? ' / tối đa ' + cap : '')], ['Phụ phí', feeNote(room) || 'Căn này chưa đặt phụ phí thêm người']])) +
      '<p class="note">' + (roomFull(room, c, 1) ? 'Phòng đã đủ người (tính cả người đang chờ duyệt). Anh/chị đồng ý thì quản lý xem rồi chủ nhà đồng ý cho ở thêm.' : 'Anh/chị đồng ý thì gửi quản lý duyệt.') + '</p><div data-no hidden><label>Lý do không đồng ý</label><textarea name="reason" rows="2"></textarea></div><p class="user-error" hidden></p>' +
      '<div class="modal-actions"><button type="button" data-no-btn>Không đồng ý</button><button type="button" class="save" data-ok>Đồng ý</button></div></div>';
    phone(o);
    o.addEventListener('click', function (e) {
      if (e.target === o) return o.remove();
      if (e.target.closest('[data-no-btn]')) {
        var nb = o.querySelector('[data-no]'); if (nb.hidden) { nb.hidden = false; o.querySelector('[data-no-btn]').textContent = 'Gửi không đồng ý'; return; }
        var r = norm(o.querySelector('[name=reason]').value); if (r.length < 3) return err(o, 'Ghi lý do để ' + x.ev.tenantName + ' biết.');
        hhEvent(room, 'proposeNo', x.ev.personId, currentActorName(), 'Không đồng ý thêm ' + v.name, { ref: x.ev.id, reason: r, status: 'Đã gửi' });
        o.remove(); toast('Đã báo ' + x.ev.tenantName); return refresh();
      }
      if (!e.target.closest('[data-ok]')) return;
      var fresh = contracts()[room] || {};
      if (!signed(fresh)) return err(o, 'Hợp đồng chưa ký.');
      if (!capOf(room)) return err(o, 'Phòng chưa đặt số người tối đa, nhờ chủ nhà đặt.');
      if (movingOut(room)) return err(o, 'Anh/chị đã báo trả phòng, không thêm người mới.');
      var over = roomFull(room, fresh, 1), need = 0;
      var ow = v.noAccount ? null : phoneOwner(v.phone, room); if (ow && ow.block) return err(o, ow.block);
      var inv = Object.assign({}, v, { id: 'RM' + Date.now().toString(36), at: now(), by: x.ev.tenantName, agreedBy: currentActorName(), proposalId: x.ev.id, status: 'Chờ duyệt' }, over ? { overCap: true } : {});
      fresh.roommateInvites = (fresh.roommateInvites || []).concat([inv]);
      saveHomeContract(room, fresh);
      appendRoomHistory(room, { kind: 'contract', title: 'Mời người ở cùng: ' + v.name, detail: x.ev.tenantName + ' đề nghị · ' + currentActorName() + ' đồng ý · ' + (over ? 'phòng đủ, chờ quản lý xem rồi chủ nhà đồng ý' : 'chờ quản lý duyệt'), actor: currentActorName() });
      o.remove(); toast(over && !hasMgr(room) ? 'Đã gửi chủ nhà' : 'Đã gửi quản lý'); refresh();
    });
  }
  function cancelProposal(room, evId) {
    var m = meMate(), x = proposals(room).filter(function (y) { return y.ev.id === evId; })[0]; if (!m || !x || x.closed) return;
    appConfirm('Rút đề nghị thêm ' + x.ev.v.name + '?', '', 'Rút đề nghị', function () { hhEvent(room, 'proposeCancel', m.p.id, m.p.names, 'Rút đề nghị thêm ' + x.ev.v.name, { ref: evId, status: 'Đã gửi' }); refresh(); }, true);
  }
  // Quản lý / chủ nhà thêm thẳng: khách chính đồng ý hoặc không trong 48 giờ
  function openMainOk(room, id) {
    var c = contracts()[room] || {}, p = mates(c).find(function (x) { return x.id === id; });
    if (!p || !p.mainOk || p.mainOk.status !== 'Chờ' || mainAnswered(room, id)) return toast('Việc này đã được xử lý');
    if (overdue(p)) return toast('Đã quá 48 giờ, coi như anh/chị đã đồng ý');
    var n = occ(c), cap = capOf(room);
    var o = document.createElement('div'); o.className = 'modal-overlay';
    o.innerHTML = '<div class="modal-sheet"><div class="modal-head">Người ở cùng mới · ' + esc(room) + '</div>' +
      infoRows([['Họ tên', p.names], ['Số điện thoại', p.noAccount ? 'Không cần tài khoản' : showPh(p.phone)], ['Giấy tờ', ID_NAMES[p.idType] || '']].concat(idRows(p), [['Người thêm', (p.mainOk.by || '') + ' · ' + day(p.mainOk.at)], ['Số người ở', n + ' người' + (cap ? ' / tối đa ' + cap : '')], ['Phụ phí', feeNote(room) || 'Căn này chưa đặt phụ phí thêm người']])) +
      '<p class="note">Không đồng ý thì người này được ghi dọn đi. Quá 48 giờ không trả lời thì coi như đồng ý.</p><div data-no hidden><label>Lý do không đồng ý</label><textarea name="reason" rows="2"></textarea></div><p class="user-error" hidden></p>' +
      '<div class="modal-actions"><button type="button" data-no-btn>Không đồng ý</button><button type="button" class="save" data-ok>Đồng ý</button></div></div>';
    phone(o);
    o.addEventListener('click', function (e) {
      if (e.target === o) return o.remove();
      if (e.target.closest('[data-no-btn]')) {
        var nb = o.querySelector('[data-no]'); if (nb.hidden) { nb.hidden = false; o.querySelector('[data-no-btn]').textContent = 'Gửi không đồng ý'; return; }
        var r = norm(o.querySelector('[name=reason]').value); if (r.length < 3) return err(o, 'Ghi lý do để quản lý biết.');
        o.remove(); return tenantAnswerMain(room, id, false, r);
      }
      if (e.target.closest('[data-ok]')) { o.remove(); tenantAnswerMain(room, id, true, ''); }
    });
  }
  function tenantAnswerMain(room, id, ok, reason) {
    var c = contracts()[room], p = c && mates(c).find(function (x) { return x.id === id; }); if (!p) return;
    if (window.HOME_REAL) hhEvent(room, ok ? 'mainOk' : 'mainNo', p.id, currentActorName(), (ok ? 'Đồng ý người ở cùng: ' : 'Không đồng ý người ở cùng: ') + p.names, { reason: reason || '' });
    else mainAnswer(room, id, ok, reason, now(), currentActorName());
    toast(ok ? 'Đã đồng ý' : 'Đã báo quản lý'); refresh();
  }
  // Đổi khách chính giữa kỳ: hợp đồng, tiền cọc giữ nguyên, chuyển sang tên người ở cùng; khách chính cũ thành người ở cùng
  function openSwap(room) {
    var c = contracts()[room] || {}, old = mainUser(room, c);
    var list = mates(c).filter(function (p) { return p.account && !p.noAccount && p.accountReadyAt && userByKey(p.account); });
    if (!list.length || !old) return toast('Chưa có người ở cùng nào đã đặt mật khẩu');
    var cur = mainName(room, c), o = document.createElement('div'); o.className = 'modal-overlay';
    o.innerHTML = '<form class="modal-sheet"><div class="modal-head">Đổi khách chính · ' + esc(room) + '</div>' + infoRows([['Khách chính hiện tại', cur]]) +
      '<label>Người nhận làm khách chính</label><select name="to">' + list.map(function (p) { return '<option value="' + esc(p.id) + '">' + esc(p.names) + '</option>'; }).join('') + '</select>' +
      '<label class="hh-check"><input type="checkbox" name="agree"> ' + esc(cur) + ' và người nhận đã đồng ý</label>' +
      '<p class="note">Hợp đồng, tiền thuê, thời hạn, tiền cọc giữ nguyên, chuyển sang tên người nhận. ' + esc(cur) + ' thành người ở cùng, vẫn ở phòng. Khoản chưa thu và tiền dư chuyển sang người nhận.</p>' +
      '<p class="user-error" hidden></p><div class="modal-actions"><button type="button" data-close>Huỷ</button><button class="save">Đổi</button></div></form>';
    phone(o);
    var form = o.querySelector('form');
    o.querySelector('[data-close]').addEventListener('click', function () { o.remove(); });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!form.agree.checked) return err(form, 'Hai bên phải đồng ý trước khi đổi.');
      if (movingOut(room)) return err(form, 'Phòng đang làm trả phòng, chưa đổi được.');
      var f = contracts()[room], p = f && mates(f).find(function (x) { return x.id === form.to.value; }), o0 = mainUser(room, f); if (!p || !o0) return o.remove();
      var by = currentActorName(), oldName = mainName(room, f), newKey = p.account;
      base(f);
      var st0 = (String(f.term || '').match(/\d{1,2}\/\d{1,2}\/\d{4}/) || [])[0];
      var entry = { id: 'XP' + Date.now().toString(36), count: 1, names: oldName || o0.name, phone: o0.phone || '', phoneKey: o0.phone ? pk(o0.phone, room) : '', noAccount: false, idType: 'cccd', photos: [], at: st0 ? '00:00:00 ' + st0 : now(), by: by, approvedBy: by,
        fromDate: p.fromDate || dstart(), fromPeriod: p.fromPeriod || '', account: o0.key, uuid: o0.uuid || '', accountReadyAt: now(), rulesReadAt: now(), residenceDeclaredAt: f.residenceDeclaredAt || '', wasMain: true };
      f.extraPeople = all(f).filter(function (x) { return x.id !== p.id; }).concat([entry]);
      f.mainHistory = (f.mainHistory || []).concat([{ from: oldName, to: p.names, at: now(), by: by, personId: p.id }]);
      f.tenantName = p.names; if (p.phone) f.tenantPhone = p.phone;
      delete f.delegate;
      recount(f); saveHomeContract(room, f);
      // Mọi khoản thu của phòng chuyển sang người nhận (không tạo trùng tiền thuê kỳ này); tiền dư cũng chuyển
      try { var ch = readRentCharges(); ch.forEach(function (x) { if (x.room === room && x.tenantKey === o0.key) { x.tenantKey = newKey; x.tenantName = p.names; } }); saveRentCharges(ch); } catch (x) {}
      try { var cr = readTenantCredits(), left = Number(cr[o0.key]) || 0; if (left) { delete cr[o0.key]; localStorage.setItem('homeTenantCredits', JSON.stringify(cr)); addTenantCredit(newKey, left); } } catch (x) {}
      try { ensureRentCharges(); } catch (x) {}
      appendRoomHistory(room, { kind: 'contract', title: 'Đổi khách chính: ' + oldName + ' → ' + p.names, detail: 'Hợp đồng, tiền cọc giữ nguyên, chuyển sang tên ' + p.names + ' · ' + oldName + ' thành người ở cùng · ' + by, actor: by });
      o.remove();
      if (window.HOME_REAL && window.HOME_DB && window.HOME_DB.linkTenantRoom && p.uuid) {
        window.HOME_DB.linkTenantRoom(p.uuid, room).then(function (r) {
          if (r && r.error) return toast('Chưa cập nhật máy chủ: ' + r.error);
          if (o0.uuid) window.HOME_DB.linkTenantRoom(o0.uuid, room, { mate: true });
        });
      }
      toast('Đã đổi khách chính'); refresh();
    });
  }
  // Khách chính uỷ quyền tạm cho một người ở cùng (đi vắng lâu): xác nhận sửa xong, biên bản; không ký, gia hạn, trả phòng
  function openDelegate(room) {
    var c = contracts()[room] || {}, list = mates(c).filter(function (p) { return p.account && !p.noAccount && (!window.HOME_REAL || p.uuid); });
    if (!list.length) return toast('Chưa có người ở cùng nào có tài khoản');
    var o = document.createElement('div'); o.className = 'modal-overlay';
    o.innerHTML = '<form class="modal-sheet"><div class="modal-head">Uỷ quyền tạm · ' + esc(room) + '</div><label>Người được uỷ quyền</label><select name="to">' + list.map(function (p) { return '<option value="' + esc(p.id) + '">' + esc(p.names) + '</option>'; }).join('') + '</select>' +
      '<label>Trong</label><select name="days">' + [7, 14, 30, 60, 90].map(function (d) { return '<option value="' + d + '"' + (d === 30 ? ' selected' : '') + '>' + d + ' ngày</option>'; }).join('') + '</select>' +
      '<p class="note">Người được uỷ quyền xác nhận sửa xong, biên bản bàn giao, biên bản vi phạm thay anh/chị. Không ký, gia hạn, trả phòng hay nhận hoàn cọc.</p><p class="user-error" hidden></p><div class="modal-actions"><button type="button" data-close>Huỷ</button><button class="save">Uỷ quyền</button></div></form>';
    phone(o);
    var form = o.querySelector('form');
    o.querySelector('[data-close]').addEventListener('click', function () { o.remove(); });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var f = contracts()[room], p = f && mates(f).find(function (x) { return x.id === form.to.value; }); if (!p) return o.remove();
      var until = iso(Date.now() + Number(form.days.value) * DAYMS);
      f.delegate = { personId: p.id, uuid: p.uuid || '', name: p.names, until: until, by: currentActorName(), at: now() };
      saveHomeContract(room, f);
      appendRoomHistory(room, { kind: 'contract', title: 'Uỷ quyền tạm cho ' + p.names, detail: 'Đến ' + vnDate(until) + ' · ' + currentActorName(), actor: currentActorName() });
      o.remove(); toast('Đã uỷ quyền cho ' + p.names); refresh();
    });
  }
  function dropDelegate(room) {
    var c = contracts()[room]; if (!c || !c.delegate) return;
    appConfirm('Thôi uỷ quyền cho ' + c.delegate.name + '?', '', 'Thôi uỷ quyền', function () {
      var f = contracts()[room]; if (!f || !f.delegate) return; var n = f.delegate.name; delete f.delegate; saveHomeContract(room, f);
      appendRoomHistory(room, { kind: 'contract', title: 'Huỷ uỷ quyền tạm cho ' + n, detail: currentActorName(), actor: currentActorName() }); refresh();
    }, true);
  }
  // Người thân ở lâu hơn số đêm cho phép: quản lý / chủ nhà cho ở đến một ngày
  function openGuestException(room) {
    var lim = 14; try { lim = Number(houseSettings(house(room)).guestNightLimit) || 14; } catch (e) {}
    var o = document.createElement('div'); o.className = 'modal-overlay';
    o.innerHTML = '<form class="modal-sheet"><div class="modal-head">Cho khách ở lâu · ' + esc(room) + '</div><label>Họ tên khách</label><input name="name" data-req autocomplete="off">' +
      '<label>Lý do</label><select name="rel"><option>Người thân (vợ / chồng / con / bố mẹ)</option><option>Chăm người bệnh</option><option>Khác</option></select><label>Ghi chú</label><input name="note" autocomplete="off">' +
      '<label>Ở đến ngày</label><input name="until" type="date" min="' + today() + '" max="' + iso(Date.now() + 90 * DAYMS) + '" value="' + iso(Date.now() + 30 * DAYMS) + '">' +
      '<p class="note">Bình thường khách ở quá ' + lim + ' đêm trong 30 ngày thì phải đăng ký người ở cùng. Khách này báo ở lại không bị chặn tới ngày trên (tối đa 90 ngày).</p><p class="user-error" hidden></p><div class="modal-actions"><button type="button" data-close>Huỷ</button><button class="save">Lưu</button></div></form>';
    phone(o);
    var form = o.querySelector('form');
    o.querySelector('[data-close]').addEventListener('click', function () { o.remove(); });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var name = norm(form.name.value), until = form.until.value, note = norm(form.note.value);
      if (name.length < 2) return err(form, 'Nhập họ tên khách.');
      if (!until || until < today() || until > iso(Date.now() + 90 * DAYMS)) return err(form, 'Chọn ngày trong 90 ngày tới.');
      if (form.rel.value === 'Khác' && note.length < 3) return err(form, 'Ghi rõ lý do.');
      var f = contracts()[room]; if (!f) return o.remove();
      f.guestExceptions = (f.guestExceptions || []).filter(function (g) { return norm(g.name).toLowerCase() !== name.toLowerCase(); }).concat([{ id: 'GX' + Date.now().toString(36), name: name, reason: form.rel.value + (note ? ': ' + note : ''), until: until, by: currentActorName(), at: now() }]);
      saveHomeContract(room, f);
      appendRoomHistory(room, { kind: 'room', title: 'Cho khách ở lâu: ' + name, detail: 'Đến ' + vnDate(until) + ' · ' + form.rel.value + (note ? ': ' + note : '') + ' · ' + currentActorName(), actor: currentActorName() });
      o.remove(); toast('Đã lưu'); refresh();
    });
  }
  function dropException(room, id) {
    var f = contracts()[room], g = f && (f.guestExceptions || []).find(function (x) { return x.id === id; }); if (!g) return;
    f.guestExceptions = f.guestExceptions.filter(function (x) { return x.id !== id; }); saveHomeContract(room, f);
    appendRoomHistory(room, { kind: 'room', title: 'Bỏ cho khách ở lâu: ' + g.name, detail: currentActorName(), actor: currentActorName() }); refresh();
  }
  // Việc trên trang chủ khách: khách chính đồng ý người được thêm thẳng / đề nghị; người ở cùng theo dõi đề nghị của mình
  window.householdTenantTodo = function (room) {
    var out = [], c = contracts()[room]; if (!c) return out;
    if (isMain(room)) {
      mates(c).forEach(function (p) {
        if (p.mainOk && p.mainOk.status === 'Chờ' && !mainAnswered(room, p.id) && !overdue(p)) out.push({ title: (p.mainOk.by || 'Quản lý') + ' thêm ' + p.names + ' ở cùng phòng', sub: 'Đồng ý hoặc không trong 48 giờ, quá hạn coi như đồng ý', btn: 'Xem', run: function () { openMainOk(room, p.id); }, urgent: true });
      });
      mates(c).forEach(function (p) { var mlr = p.leftRequest || (function () { try { var e = (readTenantEventsSafe()[room] || []).find(function (x) { return x && x.kind === 'household' && x.action === 'mainLeft' && x.personId === p.id && x.status === 'Chờ xử lý'; }); return e ? { by: e.tenantName, at: e.at } : null; } catch (x) { return null; } })(); if (mlr && !mlr.self) out.push({ title: 'Đã báo ' + p.names + ' dọn đi', sub: 'Chờ quản lý xác nhận', btn: '', run: null }); });
      pending(c).forEach(function (v) {
        if (v.staffAdd) return;
        out.push({ title: 'Mời ' + v.name + ' ở cùng', sub: waitText(room, c, v), btn: 'Xem', run: function () { window.openHousehold(room); } });
      });
      (c.roommateInvites || []).forEach(function (v) {
        if (v.status !== 'Từ chối' || v.staffAdd) return;
        out.push({ title: (v.ownerNo ? 'Chủ nhà không đồng ý ' : 'Quản lý không duyệt ') + v.name, sub: (v.reason ? 'Lý do: ' + v.reason : 'Không ghi lý do'), btn: 'Xem', run: function () { window.openHousehold(room); } });
      });
      proposals(room).forEach(function (x) { if (!x.closed) out.push({ title: x.ev.tenantName + ' đề nghị thêm ' + x.ev.v.name + ' ở cùng', sub: roomFull(room, c, 1) ? 'Phòng đủ người: anh/chị đồng ý thì quản lý xem rồi chủ nhà đồng ý cho ở thêm' : 'Anh/chị đồng ý thì gửi quản lý duyệt', btn: 'Xem', run: function () { reviewProposal(room, x.ev.id); }, urgent: true }); });
    }
    var m = meMate();
    if (m && m.room === room && (eventPending(room, m.p.id, 'left') || (m.p.leftRequest && m.p.leftRequest.self)))
      out.push({ title: 'Đã báo dọn đi', sub: 'Chờ quản lý xác nhận · quá 3 ngày tự xác nhận', btn: '', run: null });
    if (m && m.room === room) proposals(room).forEach(function (x) {
      if (x.ev.personId !== m.p.id) return;
      var st = proposalState(room, x); if (st) out.push({ title: 'Đề nghị thêm ' + x.ev.v.name, sub: st.charAt(0).toUpperCase() + st.slice(1), btn: 'Xem', run: function () { window.openHousehold(room); } });
    });
    return out;
  };

  // Việc cần xử lý: quản lý duyệt lời mời, xác nhận người dọn đi, tạo tài khoản còn dở
  // ---- Quyền người ở cùng trên màn khách (anh chốt 14/11) ----
  // Người ở cùng: xem / báo thanh toán, báo hư, góp ý, đọc thông báo. Không ký, gia hạn, trả phòng, xác nhận biên bản.
  function meMate() { return window.roommateEntry(acct()); }
  window.isDelegateFor = function (room) { var m = meMate(); if (!m || m.room !== room) return false; var d = delegateOf(m.c); return !!d && d.personId === m.p.id; };
  function myName() { return norm(acct().split('|')[1]); }
  function toast(t) { if (typeof appToast === 'function') appToast(t); }
  function evOf(room, id) { try { return ((readTenantEventsSafe()[room]) || []).find(function (e) { return String(e.id) === String(id); }); } catch (e) { return null; } }
  function mine(ev) { return !!ev && norm(ev.tenantName) === myName(); }
  function eventPending(room, pid, action) { try { return ((readTenantEventsSafe()[room]) || []).some(function (e) { return e && e.kind === 'household' && e.action === action && e.personId === pid && e.status === 'Chờ xử lý'; }); } catch (e) { return false; } }
  function setMate(room, pid, fn) { var f = contracts()[room], x = f && all(f).find(function (i) { return i.id === pid; }); if (!x) return; fn(x); saveHomeContract(room, f); }
  // Xác nhận sửa xong / chưa xong (và đánh giá sau đó): chỉ người báo hoặc khách chính
  ['confirmRepairByTenant', 'rejectRepairByTenant'].forEach(function (fn) {
    if (typeof window[fn] !== 'function') return;
    var b = window[fn];
    window[fn] = function (room, id) {
      if (meMate() && !mine(evOf(room, id)) && !window.isDelegateFor(room)) return toast('Chỉ người báo hoặc khách chính xác nhận việc này');
      return b.apply(this, arguments);
    };
  });
  if (typeof window.confirmRoomHandover === 'function') {
    var baseHandover = window.confirmRoomHandover;
    window.confirmRoomHandover = function () { var mm = meMate(); if (mm && !window.isDelegateFor(mm.room)) return toast('Biên bản do khách chính xác nhận'); return baseHandover.apply(this, arguments); };
  }
  if (typeof window.renderTenantConfirmations === 'function') {
    var baseConfirms = window.renderTenantConfirmations;
    window.renderTenantConfirmations = function () {
      var r = baseConfirms.apply(this, arguments), m = meMate(), box = document.getElementById('tenantConfirmBox');
      if (m && box && !window.isDelegateFor(m.room)) {
        box.querySelectorAll('.confirm-item').forEach(function (it) { var ok = it.querySelector('[data-repair-ok]'); if (ok && !mine(evOf(m.room, ok.dataset.repairOk))) it.remove(); });
        box.querySelectorAll('.confirm-card').forEach(function (card) {
          var n = card.querySelectorAll('.confirm-item').length, cnt = card.querySelector('.tenant-asset-count');
          if (card.querySelector('[data-repair-ok]') || cnt) { if (!n && !card.querySelector('[data-moveout-cancel]')) card.remove(); else if (cnt) cnt.textContent = n; }
        });
      }
      return r;
    };
  }
  // Tab Hợp đồng: người ở cùng chỉ xem thời hạn, tiền thuê và điều khoản (không thấy tiền cọc, không ký)
  function trimLease() {
    var m = meMate(), money = document.getElementById('tenantMoneyTerms'), nm = document.getElementById('tenantContractName');
    var lab = money && money.previousElementSibling, note = document.getElementById('hhLeaseNote'), btn = money && money.closest('.tenant-card') && money.closest('.tenant-card').querySelector('button.outline');
    if (lab && !lab.dataset.orig) lab.dataset.orig = lab.textContent;
    if (btn && !btn.dataset.orig) btn.dataset.orig = btn.textContent;
    if (!m) { if (lab && lab.dataset.orig) lab.textContent = lab.dataset.orig; if (btn && btn.dataset.orig) btn.textContent = btn.dataset.orig; if (note) note.remove(); return; }
    var main = mainName(m.room, m.c);
    if (money) money.innerText = String(money.innerText).split(' / ')[0] + '/tháng';
    if (lab) lab.textContent = 'Tiền thuê';
    if (nm && main) nm.innerText = main + ' (khách chính)';
    if (btn) btn.textContent = 'Xem điều khoản';
    if (!note && btn) { btn.insertAdjacentHTML('beforebegin', '<p class="note" id="hhLeaseNote"></p>'); note = document.getElementById('hhLeaseNote'); }
    if (note) note.textContent = 'Hợp đồng và tiền cọc đứng tên khách chính ' + main + '. Anh/chị ở cùng phòng, xem được thời hạn và điều khoản.';
  }
  if (typeof window.showContract === 'function') {
    var baseShow = window.showContract;
    window.showContract = function () {
      var r = baseShow.apply(this, arguments), m = meMate();
      if (!m) return r;
      var sheets = document.querySelectorAll('.modal-overlay .modal-sheet'), sh = sheets[sheets.length - 1]; if (!sh) return r;
      var head = sh.querySelector('.modal-head'); if (head) head.textContent = 'Điều khoản thuê · ' + m.room;
      sh.querySelectorAll('.tenant-kv').forEach(function (kv) { if (/^(Tiền cọc|Trạng thái)/.test(kv.textContent.trim())) kv.remove(); });
      sh.querySelectorAll('.contract-terms-body p').forEach(function (p) { if (/cọc|deposit|ប្រាក់កក់/i.test(p.textContent)) p.remove(); });
      var no = 0; sh.querySelectorAll('.contract-terms-body p').forEach(function (p) { if (/^\d+\.\s/.test(p.textContent)) { no++; p.textContent = p.textContent.replace(/^\d+\./, no + '.'); } });
      sh.querySelectorAll('.tenant-tabs-note').forEach(function (n) { if (/xác nhận|ký|hiệu lực/i.test(n.textContent) && !n.querySelector('strong')) n.remove(); });
      ['#signatureName', '#contractAgree'].forEach(function (q) { var el = sh.querySelector(q); if (!el) return; var l = el.closest('label'); if (l) l.remove(); else { if (el.previousElementSibling && el.previousElementSibling.tagName === 'LABEL') el.previousElementSibling.remove(); el.remove(); } });
      sh.querySelectorAll('.modal-actions .save').forEach(function (b) { b.remove(); });
      sh.querySelectorAll('.modal-actions button').forEach(function (b) { if (/Để sau/.test(b.textContent)) b.textContent = 'Đóng'; });
      var acts = sh.querySelector('.modal-actions');
      if (acts && !sh.querySelector('.hh-mate-note')) acts.insertAdjacentHTML('beforebegin', '<p class="note hh-mate-note">Hợp đồng và tiền cọc đứng tên khách chính ' + esc(mainName(m.room, m.c)) + '.</p>');
      return r;
    };
  }
  // Lần đầu vào app: đọc điều khoản / nội quy rồi bấm Đã đọc (ghi qua sự kiện phòng)
  var rulesAsked = {};
  function askRules() {
    var m = meMate(); if (!m || m.p.rulesReadAt || rulesAsked[m.p.id] || eventPending(m.room, m.p.id, 'rules') || document.querySelector('.modal-overlay')) return;
    try { if (sessionStorage.getItem('hhRules:' + m.p.id)) return; } catch (e) {}
    var c = m.c; if (!signed(c)) return;
    rulesAsked[m.p.id] = 1;
    try { window.showContract(); } catch (e) { return; }
    var sheets = document.querySelectorAll('.modal-overlay .modal-sheet'), sh = sheets[sheets.length - 1]; if (!sh) return;
    var head = sh.querySelector('.modal-head'); if (head) head.textContent = 'Chào ' + acct().split('|')[1] + ' · nội quy phòng ' + m.room;
    var acts = sh.querySelector('.modal-actions'); if (!acts) return;
    acts.insertAdjacentHTML('beforebegin', '<label class="hh-check"><input type="checkbox" data-hh-rules-ok> Tôi đã đọc nội quy và điều khoản</label><p class="user-error" hidden></p>');
    acts.innerHTML = '<button type="button" data-hh-rules-later>Để sau</button><button type="button" class="save" data-hh-rules>Đã đọc</button>';
    sh.addEventListener('click', function (e) {
      if (e.target.closest('[data-hh-rules-later]')) { sh.closest('.modal-overlay').remove(); return; }
      if (!e.target.closest('[data-hh-rules]')) return;
      if (!sh.querySelector('[data-hh-rules-ok]').checked) { var er = sh.querySelector('.user-error'); er.hidden = false; er.textContent = 'Đánh dấu ô đã đọc trước.'; return; }
      try { sessionStorage.setItem('hhRules:' + m.p.id, '1'); } catch (x) {}
      if (window.HOME_REAL) mateEvent(m.room, m.p, 'rules', m.p.names + ' đã đọc nội quy');
      else setMate(m.room, m.p.id, function (x) { x.rulesReadAt = now(); });
      sh.closest('.modal-overlay').remove(); toast('Cảm ơn anh/chị'); refresh();
    });
  }
  // Khách chính báo trả phòng: người ở cùng thấy và báo muốn thuê tiếp
  window.householdMoveOutNote = function (room) {
    var m = meMate(); if (!m || m.room !== room) return null;
    var mo = null; try { mo = moveOutRequest(room); } catch (e) {}
    if (!mo) return null;
    var asked = m.p.wantStayAt || eventPending(room, m.p.id, 'wantStay');
    return { title: (mainName(room, m.c) || 'Khách chính') + ' báo trả phòng ngày ' + mo.date, sub: asked ? 'Đã báo muốn thuê tiếp · chờ quản lý liên hệ' : 'Muốn ở lại thì bấm Thuê tiếp', btn: asked ? '' : 'Thuê tiếp', run: asked ? null : function () { askStay(room); } };
  };
  function askStay(room) {
    var m = meMate(); if (!m) return;
    var o = document.createElement('div'); o.className = 'modal-overlay';
    o.innerHTML = '<div class="modal-sheet"><div class="modal-head">Thuê tiếp ' + esc(room) + '</div><p class="confirm-text">Quản lý sẽ liên hệ lập hợp đồng mới đứng tên anh/chị khi ' + esc(mainName(room, m.c) || 'khách chính') + ' trả phòng. Cần đóng cọc mới; cọc cũ hoàn cho khách chính.</p><div class="modal-actions"><button type="button" data-close>Huỷ</button><button type="button" class="save" data-ok>Báo thuê tiếp</button></div></div>';
    o.addEventListener('click', function (e) {
      if (e.target === o || e.target.closest('[data-close]')) return o.remove();
      if (!e.target.closest('[data-ok]')) return;
      if (window.HOME_REAL) mateEvent(room, m.p, 'wantStay', m.p.names + ' muốn thuê tiếp');
      else { setMate(room, m.p.id, function (x) { x.wantStayAt = now(); }); appendRoomHistory(room, { kind: 'contract', title: 'Người ở cùng muốn thuê tiếp: ' + m.p.names, detail: 'Khi hoàn cọc, chọn Chuyển hợp đồng', actor: m.p.names, tenantName: m.p.names }); }
      o.remove(); toast('Đã báo quản lý'); refresh();
    });
    (typeof appendToPhone === 'function' ? appendToPhone : function (x) { document.querySelector('.phone').appendChild(x); })(o);
  }
  if (typeof window.setAccount === 'function') {
    var baseSet = window.setAccount;
    window.setAccount = function () { var r = baseSet.apply(this, arguments); try { trimLease(); } catch (e) {} setTimeout(function () { try { askRules(); } catch (e) {} }, 900); return r; };
  }
  // Xoá tài khoản người ở cùng: không cần trả phòng trước; xoá xong thì người đó coi như đã dọn đi
  if (typeof window.tenantHasActiveLease === 'function') {
    var baseLease = window.tenantHasActiveLease;
    window.tenantHasActiveLease = function (user) { if (user && window.isRoommateKey(user.key)) return false; return baseLease.apply(this, arguments); };
  }
  if (typeof window.saveUsers === 'function') {
    var baseSaveUsers = window.saveUsers;
    window.saveUsers = function (list) {
      var before = {}; try { (readUsers() || []).forEach(function (u) { before[u.key] = u.status; }); } catch (e) {}
      var r = baseSaveUsers.apply(this, arguments);
      try { (list || []).forEach(function (u) {
        if (!u || u.role !== 'tenant' || u.status !== 'Đã xoá' || before[u.key] === 'Đã xoá') return;
        var m = window.roommateEntry(u.key); if (m) leave(m.room, m.p.id, currentActorName(), 'Xoá tài khoản');
      }); } catch (e) {}
      return r;
    };
  }
  // Hoàn cọc: quản lý chọn cả phòng dọn đi hay chuyển hợp đồng cho một người ở cùng
  if (typeof window.openCheckoutForm === 'function') {
    var baseCo = window.openCheckoutForm;
    window.openCheckoutForm = function (room) {
      var r = baseCo.apply(this, arguments), c = contracts()[room], list = c ? mates(c) : [];
      var forms = document.querySelectorAll('.modal-overlay form.modal-sheet'), form = forms[forms.length - 1];
      if (!list.length || !form || form.querySelector('[name=hhMode]')) return r;
      var at = Array.prototype.find.call(form.querySelectorAll('label'), function (l) { return /^Khoản trừ vào cọc/.test(l.textContent.trim()); });
      var old = (readCheckouts()[room] || {}).household, pick = old && old.mode === 'transfer' ? 'to:' + old.to : 'all';
      var html = '<div class="hh-co"><label>Người ở cùng (' + list.length + ')</label><label class="hh-check"><input type="radio" name="hhMode" value="all"' + (pick === 'all' ? ' checked' : '') + '> Cả phòng dọn đi</label>' +
        list.map(function (p) { return '<label class="hh-check"><input type="radio" name="hhMode" value="to:' + esc(p.id) + '"' + (pick === 'to:' + p.id ? ' checked' : '') + '> Chuyển hợp đồng cho ' + esc(p.names) + (p.wantStayAt ? ' · muốn thuê tiếp' : '') + '</label>'; }).join('') +
        '<p class="note">Chuyển hợp đồng: lập hợp đồng mới đứng tên người ở lại, cọc mới; cọc cũ vẫn hoàn cho ' + esc(c.tenantName || 'khách chính') + '. Giữ tài khoản người ở lại.</p></div>';
      if (at) at.insertAdjacentHTML('beforebegin', html); else (form.querySelector('.modal-actions') || form.lastElementChild).insertAdjacentHTML('beforebegin', html);
      form.addEventListener('submit', function () {
        var v = (form.querySelector('[name=hhMode]:checked') || {}).value || 'all';
        setTimeout(function () {
          var err = form.querySelector('.user-error'); if (document.body.contains(form) && err && !err.hidden) return;
          var all2 = readCheckouts(), rec = all2[room]; if (!rec || rec.status === 'Đã hoàn cọc') return;
          var p = v.indexOf('to:') === 0 ? list.find(function (x) { return x.id === v.slice(3); }) : null;
          rec.household = p ? { mode: 'transfer', to: p.id, name: p.names, phone: p.phone || '', by: currentActorName(), at: now() } : { mode: 'all', by: currentActorName(), at: now() };
          try { checkoutLog(rec, p ? 'Chuyển hợp đồng cho người ở cùng ' + p.names : 'Cả phòng dọn đi (' + list.length + ' người ở cùng)'); } catch (e) {}
          saveCheckout(rec);
        }, 0);
      });
      return r;
    };
  }
  // Khách chính nhận hoàn cọc xong: người ở cùng dọn đi theo (trừ người nhận chuyển hợp đồng); 30 ngày sau xoá tài khoản như khách chính
  function closeHousehold() {
    if (['owner', 'manager'].indexOf(acct().split('|')[0]) < 0) return;
    var recs = readCheckouts(), changed = false, users = readUsers(), uChanged = false;
    Object.keys(recs).forEach(function (room) {
      var rec = recs[room]; if (!rec || rec.status !== 'Đã hoàn cọc' || !rec.contract || !isStaff(room)) return;
      var to = rec.household && rec.household.mode === 'transfer' ? rec.household.to : '';
      if (!rec.householdClosedAt) {
        (rec.contract.extraPeople || []).forEach(function (p) { if (p.leftAt) return; if (p.id === to) { p.transferredAt = now(); return; } p.leftAt = rec.tenantConfirmedAt || now(); p.leftBy = 'Trả phòng'; });
        rec.householdClosedAt = now(); changed = true;
        if (to) appendRoomHistory(room, { kind: 'contract', title: 'Chuyển hợp đồng cho người ở cùng: ' + rec.household.name, detail: 'Cọc cũ đã hoàn cho ' + (rec.tenantName || 'khách chính') + ' · cần lập hợp đồng mới', actor: currentActorName() });
      }
      if (rec.accountDeletedAt && !rec.mateAccountsClosedAt) {
        (rec.contract.extraPeople || []).forEach(function (p) {
          if (p.id === to || !p.account || p.noAccount) return;
          var u = users.find(function (x) { return x.key === p.account || (p.uuid && x.uuid === p.uuid); });
          if (u && u.status !== 'Đã xoá') { u.status = 'Đã xoá'; u.deletedAt = now(); try { logUserChange(u, 'Tự xoá cùng khách chính sau khi trả phòng'); } catch (e) {} uChanged = true; }
        });
        rec.mateAccountsClosedAt = now(); changed = true;
      }
    });
    if (changed) localStorage.setItem('homeCheckouts', JSON.stringify(recs));
    if (uChanged) { baseSaveUsers ? baseSaveUsers(users) : saveUsers(users); try { refreshUserAccounts(); } catch (e) {} }
  }
  setTimeout(closeHousehold, 3500); setInterval(closeHousehold, 30000);
  // Ảnh giấy tờ người ở cùng: xoá sau 1 năm kể từ ngày dọn đi; lời mời đã huỷ / không duyệt thì xoá ngay.
  // App thật: chỉ máy chủ nhà xoá file trong kho, xoá xong mới bỏ dấu ảnh khỏi hợp đồng
  var purging = {};
  function purgeMatePhotos() {
    var role = acct().split('|')[0]; if (['owner', 'manager'].indexOf(role) < 0) return;
    var me = serverMe(); if (window.HOME_REAL && (!me || me.vai_tro !== 'chu_nha' || !window.HOME_DB || !window.HOME_DB.removePhotos)) return;
    var cs = contracts();
    Object.keys(cs).forEach(function (room) {
      var c = cs[room]; if (!c) return;
      var old = function (p) { var t = parseViTime(p.leftAt) || 0; return p.leftAt && t && Date.now() - t >= 365 * 864e5 && (p.photos || []).length; };
      var dead = function (v) { return ['Đã huỷ', 'Đã bỏ', 'Từ chối'].indexOf(v.status) >= 0 && (v.photos || []).length; };
      var people = all(c).filter(old), inv = (c.roommateInvites || []).filter(dead);
      // Đề nghị của người ở cùng bị khách chính không đồng ý / đã rút: ảnh giấy tờ xoá ngay
      var gone = proposals(room).filter(function (x) { return x.closed && (x.closed.action !== 'invited' || ['Đã huỷ', 'Đã bỏ', 'Từ chối'].indexOf(x.closed.invite.status) >= 0) && (x.ev.v.photos || []).length; }).map(function (x) { return x.ev.id; });
      if (!people.length && !inv.length && !gone.length) return;
      var props = gone.map(function (id) { return ((readTenantEventsSafe()[room] || []).find(function (e) { return e && e.id === id; }) || { v: {} }).v; });
      var clear = function () {
        var f = contracts()[room];
        if (f && (people.length || inv.length)) { all(f).filter(old).forEach(function (p) { p.photos = []; p.photosPurgedAt = now(); }); (f.roommateInvites || []).filter(dead).forEach(function (v) { v.photos = []; }); saveHomeContract(room, f); }
        if (gone.length) { var evAll = readTenantEventsSafe(); (evAll[room] || []).forEach(function (e) { if (e && gone.indexOf(e.id) >= 0 && e.v) { e.v.photos = []; e.v.photosPurgedAt = now(); } }); localStorage.setItem('homeTenantEvents', JSON.stringify(evAll)); }
      };
      if (!window.HOME_REAL) return clear();
      if (purging[room]) return;
      var paths = people.concat(inv, props).reduce(function (a, p) { return a.concat(p.photos || []); }, []).map(String).filter(function (x) { return x.indexOf('sb:') === 0; }).map(function (x) { return x.slice(3); });
      purging[room] = 1;
      (paths.length ? window.HOME_DB.removePhotos(paths) : Promise.resolve(true)).then(function (ok) { delete purging[room]; if (ok) clear(); });
    });
  }
  setTimeout(purgeMatePhotos, 5000); setInterval(purgeMatePhotos, 3600000);
  function transferWaiting(room, rec) {
    var h = rec && rec.household; if (!h || h.mode !== 'transfer' || rec.status !== 'Đã hoàn cọc' || h.contractAt) return null;
    var cur = contracts()[room]; if (cur && norm(cur.tenantName) === norm(h.name)) return null;
    return h;
  }
  function openTransfer(room, h) {
    if (typeof openContractDraft !== 'function') return;
    openContractDraft(room);
    setTimeout(function () {
      var forms = document.querySelectorAll('.modal-overlay form'), f = forms[forms.length - 1]; if (!f) return;
      var n = f.querySelector('[name=tenant]'); if (n && !n.value) n.value = h.name;
      var ph = f.querySelector('[name=phone]'), cc = f.querySelector('[name=phoneCc]');
      if (ph && !ph.value && h.phone) { var sp = null; try { sp = splitPhoneCc(h.phone); } catch (e) {} if (sp) { ph.value = sp.local; if (cc && sp.cc) cc.value = sp.cc; } else ph.value = h.phone; }
    }, 60);
  }
  var baseWork2 = collectWorkItems;
  collectWorkItems = function () {
    var items = baseWork2.apply(this, arguments), scope = workScope();
    if (['owner', 'manager'].indexOf(scope.role) < 0) return items;
    var cs = contracts(), recs = readCheckouts();
    Object.keys(cs).forEach(function (room) {
      var c = cs[room], h = house(room); if (!c || !scope.houseOk(h) || !scope.roomOk(room)) return;
      var mo = null; try { mo = moveOutRequest(room); } catch (e) {}
      mates(c).forEach(function (p) {
        if (!p.wantStayAt || (!mo && !(recs[room] && recs[room].status !== 'Đã hoàn cọc'))) return;
        var ws = String(p.wantStayAt || '').match(/(\d{1,2}:\d{2})(?::\d{2})? (\d{1,2}\/\d{1,2})/);
        items.push({ type: 'contract', house: h, room: room, title: room + ': ' + p.names + ' muốn thuê tiếp', sub: p.names + ' gửi' + (ws ? ' · ' + ws[1] + ' ' + ws[2] : '') + ' · Khi hoàn cọc, chọn Chuyển hợp đồng cho ' + p.names, time: parseViTime(p.wantStayAt) || Date.now(),
          actions: isStaff(room) ? [{ label: 'Xem', run: function () { window.openHousehold(room); } }] : [], target: { type: 'room', room: room } });
      });
    });
    Object.keys(recs).forEach(function (room) {
      var tw = transferWaiting(room, recs[room]), h = house(room); if (!tw || !scope.houseOk(h) || !scope.roomOk(room)) return;
      items.push({ type: 'contract', house: h, room: room, title: room + ': Lập hợp đồng mới cho ' + tw.name, sub: 'Chuyển hợp đồng từ ' + (recs[room].tenantName || 'khách cũ') + ' · cọc mới', time: parseViTime(tw.at) || Date.now(),
        actions: isStaff(room) ? [{ label: 'Lập', run: function () { openTransfer(room, tw); } }] : [], target: { type: 'room', room: room } });
    });
    return items;
  };

  var baseWork = collectWorkItems;
  collectWorkItems = function () {
    var items = baseWork.apply(this, arguments), scope = workScope();
    if (['owner', 'manager'].indexOf(scope.role) < 0) return items;
    var cs = contracts();
    Object.keys(cs).forEach(function (room) {
      var c = cs[room]; if (!c) return;
      var h = house(room);
      if (!scope.houseOk(h) || !scope.roomOk(room)) return;
      var can = isStaff(room);
      pending(c).forEach(function (v) {
        var st = stageOf(room, c, v);
        if (st === 'mgr') {
          var mc = can && scope.role === 'manager';
          items.push({ type: 'contract', house: h, room: room, title: room + ': Xin cho ở thêm khi phòng đủ (tối đa ' + capOf(room) + ') · ' + v.name,
            sub: (mc ? v.by + (v.agreedBy ? ' đề nghị · ' + v.agreedBy + ' đồng ý' : ' mời') + ' · anh/chị xem rồi gửi chủ nhà' : 'Chờ quản lý xem rồi gửi chủ nhà · ' + v.by + (v.agreedBy ? ' đề nghị' : ' mời')), time: parseViTime(v.at) || Date.now(),
            actions: mc ? [{ label: 'Xem', run: function () { reviewInvite(room, v.id); } }, { label: 'Không duyệt', run: function () { rejectInvite(room, v.id); } }] : [], target: { type: 'room', room: room } });
          return;
        }
        if (st === 'owner') {
          var own = scope.role === 'owner';
          items.push({ type: 'contract', house: h, room: room, title: room + ': Xin cho ở thêm khi phòng đủ (tối đa ' + capOf(room) + ') · ' + v.name,
            sub: own ? v.by + (v.agreedBy ? ' đề nghị · ' + v.agreedBy + ' đồng ý' : v.staffAdd ? ' thêm' : ' mời') + (v.mgrOk ? ' · quản lý đã đồng ý' : '') : 'Chờ chủ nhà đồng ý cho ở thêm · ' + v.by + (v.staffAdd ? ' thêm' : v.agreedBy ? ' đề nghị' : ' mời'), time: parseViTime(v.at) || Date.now(),
            actions: own ? [{ label: 'Xem', run: function () { reviewInvite(room, v.id); } }, { label: 'Không đồng ý', run: function () { rejectInvite(room, v.id); } }] : [], target: { type: 'room', room: room } });
          return;
        }
        items.push({ type: 'contract', house: h, room: room, title: room + ': Duyệt người ở cùng · ' + v.name, sub: (can ? v.by + (v.agreedBy ? ' đề nghị · ' + v.agreedBy + ' đồng ý' : ' mời') + (v.phone ? ' · ' + showPh(v.phone) : ' · không cần tài khoản') : 'Chờ quản lý duyệt · ' + v.by + (v.agreedBy ? ' đề nghị' : ' mời')), time: parseViTime(v.at) || Date.now(),
          actions: can ? [{ label: 'Xem', run: function () { reviewInvite(room, v.id); } }, { label: 'Không duyệt', run: function () { rejectInvite(room, v.id); } }] : [], target: { type: 'room', room: room } });
      });
      mates(c).forEach(function (p) {
        if (p.mainOk && p.mainOk.status === 'Chờ' && !mainAnswered(room, p.id)) items.push({ type: 'contract', house: h, room: room, title: room + ': Chờ ' + (mainName(room, c) || 'khách chính') + ' đồng ý người ở cùng ' + p.names, sub: (p.mainOk.by ? p.mainOk.by + ' thêm ' : 'Thêm ') + day(p.mainOk.at) + ' · quá 48 giờ coi như đồng ý', time: parseViTime(p.mainOk.at) || Date.now(), actions: [], target: { type: 'room', room: room } });
        if (p.leftRequest) items.push({ type: 'contract', house: h, room: room, title: room + ': Xác nhận ' + p.names + ' đã dọn đi', sub: (p.leftRequest.self ? 'Tự báo · quá 3 ngày tự xác nhận' : p.leftRequest.by + ' báo') + ' · ' + day(p.leftRequest.at), time: parseViTime(p.leftRequest.at) || Date.now(),
          actions: can ? [{ label: 'Xem', run: function () { confirmLeft(room, p.id); } }] : [], target: { type: 'room', room: room } });
        if (can && p.account && !p.noAccount && !p.accountReadyAt) items.push({ type: 'contract', house: h, room: room, title: room + ': Đặt mật khẩu cho ' + p.names, sub: 'Người ở cùng chưa đăng nhập được', time: parseViTime(p.at) || Date.now(),
          actions: [{ label: 'Tạo', run: function () { makeAccount(room, p); } }], target: { type: 'room', room: room } });
      });
    });
    return items;
  };

  // Tab Người dùng → Thêm khách thuê: phần "Phòng đang thuê: thêm người ở cùng" (anh chốt 15/11)
  window.householdAddRooms = function (allHouses) {
    var cs = contracts(), house = ''; try { house = readProperty().id; } catch (e) {}
    var recs = []; try { recs = collectRoomRecords(true).records; } catch (e) {}
    return recs.filter(function (r) { return (allHouses || (r.house || propertyIdForRoom(r.code)) === house) && isStaff(r.code) && signed(cs[r.code]); })
      .map(function (r) {
        var c = cs[r.code], n = occ(c), cap = capOf(r.code), block = '', short = '';
        if (movingOut(r.code)) { block = 'Khách chính phòng ' + r.code + ' đã báo trả phòng, không thêm người mới.'; short = 'đang trả phòng'; }
        else if (!cap) { block = 'Phòng ' + r.code + ' chưa đặt số người tối đa. Vào Phòng → sửa phòng để đặt trước.'; short = 'chưa đặt số người tối đa'; }
        else if (roomFull(r.code, c, 1)) short = isOwnerNow() ? 'đủ người, vẫn cho ở thêm được' : 'đủ người, cần chủ nhà đồng ý';
        return { code: r.code, main: mainName(r.code, c), n: n, cap: cap, block: block, blockShort: short };
      }).sort(function (a, b) { return String(a.code).localeCompare(String(b.code), 'vi', { numeric: true }); });
  };
  window.openHouseholdAdd = function (room) { window.openHousehold(room); openAdd(room); };
  // Nút trong màn khách và trong chi tiết phòng: một nút "Người ở cùng" (thay nút "Thêm người ở" cũ)
  window.householdButton = function (room) {
    var b = document.createElement('button'); b.type = 'button'; b.textContent = 'Người ở cùng';
    b.addEventListener('click', function () { window.openHousehold(room); });
    return b;
  };
  new MutationObserver(function () {
    document.querySelectorAll('.phone .rp-detail, .phone .rd-sheet').forEach(function (sheet) {
      var add = sheet.querySelector('[data-occupant-add]');
      if (!add || sheet.querySelector('[data-household]')) return;
      add.hidden = true; add.style.display = 'none';
      add.insertAdjacentHTML('afterend', '<button type="button" class="link-btn" data-household="' + esc(add.dataset.occupantAdd) + '">Người ở cùng</button>');
    });
  }).observe(document.querySelector('.phone') || document.body, { childList: true, subtree: true });
  document.addEventListener('click', function (e) { var b = e.target.closest && e.target.closest('[data-household]'); if (b) window.openHousehold(b.dataset.household); });
})();

// Bước nào đang chờ ai thì mọi người liên quan đều thấy (anh chốt 12/11): dòng "Đang chờ … · đã chờ N ngày"
// nằm chung trong Việc cần xử lý / Việc cần làm, không có nút; chờ quá 2 ngày thì chuyển đỏ.
// Người phải làm vẫn thấy dòng có nút như cũ.
(function () {
  var DAY = 864e5;
  function acct() { var s = document.getElementById('accountSelect'); return String(s ? s.value : '').split('|'); }
  function t(v) { if (typeof v === 'number') return v; try { return parseViTime(v) || 0; } catch (e) { return 0; } }
  function stamp(e) { var m = String(e && e.id || '').match(/^(\d{13})/); return m ? Number(m[1]) : 0; }
  function house(room) { try { return propertyIdForRoom(room); } catch (e) { return ''; } }
  function mgr(room) { try { return readRoomManagerAssignments()[room] || ''; } catch (e) { return ''; } }
  function owner() { try { return ownerName(); } catch (e) { return 'Chủ nhà'; } }
  function mlabel(room) { var m = mgr(room); return m ? 'quản lý ' + m : 'quản lý'; }
  function money(v, h) { try { return amountForHouse(v, h); } catch (e) { return String(v); } }
  function get(k, d) { try { return JSON.parse(localStorage.getItem(k) || 'null') || d; } catch (e) { return d; } }
  function asset(e) { return String(e.title || '').replace(/^Đã báo hư hỏng:\s*/, ''); }
  function esc(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  // Mỗi bước đang chờ: ai phải làm (role + tên), ai cần thấy
  window.waitingSteps = function () {
    var out = [];
    function add(o) { o.house = o.house || house(o.room); out.push(o); }
    var evs = {}; try { evs = readTenantEventsSafe(); } catch (e) {}
    Object.keys(evs).forEach(function (room) {
      (evs[room] || []).forEach(function (e) {
        if (!e) return;
        if (e.kind === 'repair' && (!e.status || e.status === 'Chờ xử lý')) {
          var m = mgr(room);
          if (m) add({ room: room, subject: 'Báo hư: ' + asset(e), asset: asset(e), by: e.tenantName || '', match: new RegExp(esc(asset(e))), who: 'manager', whoName: m, wait: 'Đang chờ quản lý ' + m + ' tiếp nhận', since: stamp(e) || t(e.date), show: ['owner', 'tenant'], type: 'repair' });
        }
        // Đã tiếp nhận, chưa sửa xong: khách vẫn theo dõi được ai sửa, hẹn ngày nào (anh 16/11: tiếp nhận xong dòng mất thì không biết khi nào sửa)
        if (e.kind === 'repair' && e.status === 'Đã tiếp nhận') {
          var who0 = e.acceptedBy || mgr(room) || 'Quản lý', late0 = 0;
          try { late0 = e.repairDate ? Math.round((dayStart() - dayStart(e.repairDate)) / DAY) : 0; } catch (x) {}
          var plan0 = e.repairDate ? who0 + ' hẹn sửa ' + viDate(e.repairDate).slice(0, 5) + (late0 > 0 ? ' · quá hẹn ' + late0 + ' ngày' : late0 === 0 ? ' · hôm nay' : '') : who0 + ' đã tiếp nhận, chưa hẹn ngày sửa';
          add({ room: room, subject: 'Báo hư: ' + asset(e), asset: asset(e), by: e.tenantName || '', match: new RegExp(esc(asset(e))), who: 'manager', whoName: who0, wait: plan0 + (e.tenantRejectReason ? ' · sửa lại' : ''), plain: true, overdue: late0 > 0, since: t(e.acceptedAt) || stamp(e), show: ['tenant'], type: 'repair' });
        }
        if (e.kind === 'repair' && e.status === 'Chờ khách xác nhận') {
          var cost = Number(e.repairCost) || 0;
          add({ room: room, subject: 'Báo hư: ' + asset(e), asset: asset(e), match: new RegExp(esc(asset(e))), who: 'tenant', whoName: e.tenantName, wait: 'Đang chờ ' + (e.tenantName || 'khách') + ' xác nhận đã sửa xong' + (cost > 0 ? ' · chi phí ' + money(cost, house(room)) : '') + (e.fixedBy ? ' · ' + e.fixedBy + ' sửa' : ''), since: t(e.fixedAt) || stamp(e), show: ['owner', 'manager'], type: 'repair' });
        }
      });
    });
    var cs = {}; try { cs = readHomeContracts(); } catch (e) {}
    Object.keys(cs).forEach(function (room) {
      var c = cs[room]; if (!c) return;
      if (c.status === 'Chờ chủ nhà duyệt') add({ room: room, subject: 'Hợp đồng ' + (c.tenantName || ''), match: /Hợp đồng/, who: 'owner', wait: 'Đang chờ chủ nhà duyệt' + (c.createdBy ? ' · ' + c.createdBy + ' lập' : ''), since: t(c.createdAt), show: ['manager', 'tenant'], type: 'contract' });
      if (c.status === 'Chờ người thuê ký') add({ room: room, subject: 'Hợp đồng ' + (c.tenantName || ''), match: /ký hợp đồng|Hợp đồng/, who: 'tenant', whoName: c.tenantName, wait: 'Đang chờ ' + (c.tenantName || 'khách') + ' ký', since: t(c.approvedAt) || t(c.createdAt), show: ['owner', 'manager'], type: 'contract' });
      if (c.renewal && c.renewal.status === 'Chờ chủ nhà duyệt' && !(function () { try { return moveOutRequest(room) || (readCheckouts()[room] && readCheckouts()[room].status !== 'Đã hoàn cọc'); } catch (e) { return false; } })()) add({ room: room, subject: 'Gia hạn hợp đồng', by: String(c.renewal.by || '').replace(/ \(khách\)$/, ''), match: /gia hạn/i, who: 'owner', wait: 'Đang chờ chủ nhà duyệt gia hạn' + (c.renewal.end ? ' đến ' + c.renewal.end : ''), since: t(c.renewal.at), show: ['manager', 'tenant'], type: 'contract' });
    });
    // Biên bản giao phòng đã gửi, khách chưa xác nhận
    var last = {};
    (get('homeInventoryRecords', []) || []).forEach(function (r) { if (r && r.type === 'Giao phòng' && (!last[r.room] || t(r.time) >= t(last[r.room].time))) last[r.room] = r; });
    Object.keys(last).forEach(function (room) {
      var r = last[room];
      if (/Đã được khách thuê xác nhận|Đã thay bằng/.test(r.status || '') || r.confirmedAt) return;
      add({ room: room, subject: 'Biên bản giao phòng', match: /giao phòng|bàn giao/i, who: 'tenant', whoName: r.tenant, wait: 'Đang chờ ' + (r.tenant || 'khách') + ' xác nhận biên bản giao phòng', since: t(r.time), show: ['owner', 'manager'], type: 'handover' });
    });
    // Trả phòng
    var co = {}; try { co = readCheckouts(); } catch (e) {}
    Object.keys(co).forEach(function (room) {
      var r = co[room]; if (!r) return;
      if (r.status === 'Chờ khách xác nhận') add({ room: room, subject: 'Hoàn cọc', match: /hoàn cọc|trả phòng/i, who: 'tenant', whoName: r.tenantName, wait: 'Hoàn ' + money(r.refund || 0, r.house || house(room)) + (r.deductionTotal ? ' · trừ ' + money(r.deductionTotal, r.house || house(room)) : '') + ' · Đang chờ ' + (r.tenantName || 'khách') + ' xác nhận đã nhận', since: t(r.updatedAt) || t(r.createdAt), show: ['owner', 'manager'], type: 'room' });
      if (/Khách báo (chưa đúng|sai lệch)/.test(r.status || '')) add({ room: room, subject: 'Hoàn cọc', by: r.tenantName || '', match: /hoàn cọc|trả phòng/i, who: 'manager', whoName: mgr(room), wait: 'Đang chờ ' + mlabel(room) + ' xem lại số hoàn cọc', since: t(r.updatedAt), show: ['tenant'], type: 'room' });
    });
    var mo = {}; try { mo = readMoveOutRequests(); } catch (e) {}
    Object.keys(mo).forEach(function (room) {
      var q = mo[room]; if (!q || (co[room] && co[room].status !== 'Đã hoàn cọc')) return;
      add({ room: room, subject: 'Báo trả phòng ngày ' + (q.date || ''), by: q.tenantName || q.by || '', match: /trả phòng/i, who: 'manager', whoName: mgr(room), wait: 'Đang chờ ' + mlabel(room) + ' kiểm tra phòng, tính hoàn cọc', since: t(q.at || q.createdAt), show: ['tenant'], type: 'room' });
    });
    // Tiền chốt tháng gửi đi, bên nhận chưa xác nhận
    var st = {}; try { st = readSettlements(); } catch (e) {}
    Object.keys(st).forEach(function (key) {
      var r = st[key]; if (!r || !r.remits) return;
      Object.keys(r.remits).forEach(function (name) {
        var p = r.remits[name] && r.remits[name].pending; if (!p) return;
        var toOwner = r.remits[name].direction !== 'toManager', month = String(r.month || '').split('-').reverse().join('/');
        add({ room: '', house: r.houseId, subject: 'Chốt tháng ' + month + ' · ' + (toOwner ? name + ' nộp ' : 'chủ nhà trả ' + name + ' ') + money(p.amount, r.houseId), match: new RegExp('Chốt tháng|' + esc(name)), who: toOwner ? 'owner' : 'manager', whoName: toOwner ? '' : name, wait: toOwner ? 'Đang chờ chủ nhà xác nhận đã nhận' : 'Đang chờ ' + name + ' xác nhận đã nhận', since: t(p.sentAt), show: toOwner ? ['manager'] : ['owner'], onlyName: toOwner ? name : '', type: 'expense' });
      });
    });
    // Phòng mới, chi phí quản lý ghi: chờ chủ nhà duyệt
    (get('homeRoomApprovalRequests', []) || []).forEach(function (q) {
      if (!q || q.status !== 'Chờ duyệt') return;
      var name = (q.room && q.room.name) || 'Phòng mới';
      add({ room: '', house: q.propertyId, subject: name + ' · Thêm phòng mới', match: new RegExp(esc(name) + ' · Thêm phòng mới'), who: 'owner', wait: 'Đang chờ chủ nhà duyệt', since: t(q.requestedAt), show: ['manager'], onlyName: q.requestedBy, type: 'room' });
    });
    (get('homeExpenseRecords', []) || []).forEach(function (r) {
      if (!r || r.status !== 'Chờ duyệt' || r.createdByRole === 'owner') return;
      var route = ''; try { route = expenseRouteText(r); } catch (e) { route = 'chờ chủ nhà duyệt'; }
      var peer = false; try { peer = expenseStage(r) === 'peer'; } catch (e) {}
      add({ room: '', house: r.propertyId, subject: 'Chi phí: ' + r.name + ' · ' + money(r.amount, r.propertyId), match: new RegExp(esc(r.name || '')), recId: r.id, who: peer ? 'peer' : 'owner', wait: (/^chờ /.test(route) ? 'Đang ' + route : route) + ' · ' + money(r.amount, r.propertyId), since: t(r.createdAt), show: ['manager'], onlyName: r.createdBy, type: 'expense' });
    });
    // Thông báo quản lý soạn, chờ chủ nhà duyệt
    (get('homeNotices', []) || []).forEach(function (n) {
      if (!n || n.status !== 'Chờ duyệt') return;
      add({ room: '', house: n.house, subject: 'Thông báo: ' + n.title, match: new RegExp(esc(n.title || '')), who: 'owner', wait: 'Đang chờ chủ nhà duyệt', since: t(n.createdAt || n.at), show: ['manager'], onlyName: n.createdBy, type: 'notice' });
    });
    // Khiếu nại khách gửi chủ nhà: khách theo dõi tới khi chủ nhà trả lời
    (get('homeComplaints', []) || []).forEach(function (c) {
      if (!c || c.kind === 'rating' || c.status !== 'Chờ chủ nhà') return;
      var text = String(c.text || '').replace(/\s+/g, ' ');
      add({ room: c.room, house: c.house, by: c.tenantName || '', subject: 'Góp ý: ' + (text.length > 50 ? text.slice(0, 48) + '…' : text), match: /khiếu nại/i, who: 'owner', wait: 'Đang chờ chủ nhà trả lời', since: t(c.at), show: ['tenant'], type: 'complaint' });
    });
    // Khách báo có người ở lại: theo dõi tới khi quản lý bấm Đã biết
    (get('homeGuestStays', []) || []).forEach(function (g) {
      if (!g || g.seenAt || g.cancelledAt) return;
      add({ guestId: g.id, room: g.room, house: g.house, by: g.tenantName || '', subject: 'Báo có người ở lại: ' + (g.guest || ''), match: /người ở lại/i, who: 'manager', whoName: mgr(g.room), wait: 'Đang chờ ' + mlabel(g.room) + ' xem', since: t(g.at), show: ['tenant'], type: 'room' });
    });
    // Yêu cầu xoá tài khoản: người gửi theo dõi tới khi chủ nhà xử lý
    var dr = get('homeDeleteRequests', {}) || {};
    Object.keys(dr).forEach(function (key) {
      var q = dr[key]; if (!q) return;
      add({ room: q.role === 'tenant' ? q.room : '', house: q.house, subject: 'Yêu cầu xoá tài khoản', match: /xoá tài khoản/i, who: 'owner', wait: 'Đang chờ chủ nhà xử lý', since: t(q.at), show: [q.role], onlyName: q.role === 'manager' ? String(key).split('|')[1] : '', anyHouse: q.role === 'manager', type: 'user' });
    });
    out.forEach(function (o) { o.days = o.since ? Math.floor((Date.now() - o.since) / DAY) : 0; o.late = o.plain ? !!o.overdue : o.days > 2; o.sub = o.wait + (o.days > 0 && !o.plain ? ' · đã chờ ' + o.days + ' ngày' : ''); o.subT = o.sub + (!o.plain && !o.days && o.since && (new Date(o.since).getHours() || new Date(o.since).getMinutes()) ? ' · từ ' + String(new Date(o.since).getHours()).padStart(2, '0') + ':' + String(new Date(o.since).getMinutes()).padStart(2, '0') : ''); o.subBy = (o.by ? o.by + ' gửi · ' : '') + o.subT; });
    return out;
  };
  function isActor(o, role, name) { return o.who === role && (role !== 'manager' || !o.whoName || o.whoName === name); }
  var base = collectWorkItems;
  collectWorkItems = function () {
    var items = base.apply(this, arguments), scope = workScope();
    if (['owner', 'manager'].indexOf(scope.role) < 0) return items;
    window.waitingSteps().forEach(function (o) {
      if (o.show.indexOf(scope.role) < 0 || isActor(o, scope.role, scope.name)) return;
      if (o.onlyName && o.onlyName !== scope.name) return;
      if (!o.anyHouse && (!scope.houseOk(o.house) || (o.room && !scope.roomOk(o.room)))) return;
      var same = items.filter(function (it) { return !it._waitStep && (!o.room || (it.room || (it.target && it.target.room) || '') === o.room) && o.match.test(it.title || ''); });
      // Nhiều khoản cùng tên (2 khoản chi "Sửa Remote"): mỗi bước chỉ nhận dòng của đúng khoản mình, không đè số của khoản kia
      if (o.recId) { var own = same.filter(function (it) { return it.target && it.target.id === o.recId; }); same = own.length ? own : same.filter(function (it) { return !(it.target && it.target.id); }).slice(0, 1); }
      var viewOnly = function (it) { return (it.actions || []).every(function (a) { return /^(Mở|Xem)/.test(a.label || ''); }); };
      if (same.some(function (it) { return !viewOnly(it); })) return; // mình cũng có việc ở bước này
      if (same.length) { same.forEach(function (it) { it.sub = (o.by ? o.by + ' gửi · ' : '') + o.subT; it.urgent = o.late; it._waitStep = 1; }); return; }
      items.push({ _waitStep: 1, type: o.type, house: o.house, room: o.room, title: (o.room ? o.room + ' · ' : '') + o.subject, sub: (o.by ? o.by + ' gửi · ' : '') + o.subT, time: o.since || Date.now(), urgent: o.late, actions: [], target: o.room ? { type: 'room', room: o.room } : undefined });
    });
    return items;
  };
  try { renderWorkCenter(); } catch (e) {}
})();

// Khách đánh giá việc quản lý làm (anh chốt 12/11): hỏi ngay sau mỗi việc xong (sửa xong, nhận phòng, nhận hoàn cọc),
// 3 mức, bỏ qua được. Lưu chung chỗ góp ý (homeComplaints) nên máy chủ không cho quản lý đọc từng đánh giá;
// chủ nhà thấy hết, quản lý chỉ thấy tỉ lệ của mình (máy chủ nhà tính rồi lưu homeServiceScores).
// "Chưa hài lòng" hiện trong Việc cần xử lý của chủ nhà.
(function () {
  var DAYS = 90, LEVEL = { good: 'Hài lòng', ok: 'Bình thường', bad: 'Chưa hài lòng' }, REASONS = ['Đến trễ', 'Thái độ chưa tốt', 'Làm chưa kỹ', 'Khác'];
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function acct() { var s = document.getElementById('accountSelect'); return String(s ? s.value : '').split('|'); }
  function raw() { try { var v = JSON.parse(localStorage.getItem('homeComplaints') || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; } }
  function isRating(c) { return c && c.kind === 'rating'; }
  function phone(o) { (typeof appendToPhone === 'function' ? appendToPhone : function (x) { document.querySelector('.phone').appendChild(x); })(o); }
  function t(v) { try { return parseViTime(v) || 0; } catch (e) { return 0; } }
  // Đánh giá không lẫn vào danh sách góp ý; lưu góp ý thì giữ nguyên các đánh giá
  var baseRead = readComplaints, baseSave = saveComplaints;
  readComplaints = function () { return baseRead.apply(this, arguments).filter(function (c) { return !isRating(c); }); };
  saveComplaints = function (list) { var ids = {}; (list || []).forEach(function (c) { if (c) ids[c.id] = 1; }); return baseSave.call(this, (list || []).concat(raw().filter(function (c) { return isRating(c) && !ids[c.id]; }))); };
  window.readRatings = function () { return raw().filter(isRating); };
  function saveRatings(list) { localStorage.setItem('homeComplaints', JSON.stringify(raw().filter(function (c) { return !isRating(c); }).concat(list))); }
  function rated(job, id) { return window.readRatings().some(function (r) { return r.job === job && String(r.jobId) === String(id); }); }

  function ask(o) {
    if (!o.worker || rated(o.job, o.jobId) || acct()[0] !== 'tenant') return;
    var a = acct(), pick = '', why = [];
    var ov = document.createElement('div');
    ov.className = 'modal-overlay';
    ov.innerHTML = '<div class="modal-sheet rate-sheet"><div class="modal-head">' + esc(o.question) + '</div>' +
      '<div class="rate-pick">' + ['good', 'ok', 'bad'].map(function (k) { return '<button type="button" data-rate="' + k + '"><span>' + { good: '😊', ok: '😐', bad: '🙁' }[k] + '</span>' + LEVEL[k] + '</button>'; }).join('') + '</div>' +
      '<div class="rate-more" hidden><div class="rate-why">' + REASONS.map(function (r) { return '<button type="button" data-why="' + esc(r) + '">' + esc(r) + '</button>'; }).join('') + '</div><textarea name="note" rows="2" placeholder="Ghi thêm (không bắt buộc)"></textarea></div>' +
      '<p class="note">Không bắt buộc. Chỉ chủ nhà xem từng đánh giá.</p><div class="modal-actions"><button type="button" data-rate-skip>Để sau</button><button type="button" class="save" data-rate-send hidden>Gửi</button></div></div>';
    function save(level) {
      var list = window.readRatings();
      list.push({ kind: 'rating', id: 'RT' + Date.now().toString(36), room: o.room, house: (function () { try { return propertyIdForRoom(o.room); } catch (e) { return ''; } })(), tenantKey: a.join('|'), tenantName: a[1], at: new Date().toLocaleString('vi-VN'), job: o.job, jobId: o.jobId, jobTitle: o.title, worker: o.worker, level: level, reasons: why.slice(), note: (ov.querySelector('[name=note]').value || '').trim() });
      saveRatings(list);
      ov.remove();
      if (level !== 'skip' && typeof appToast === 'function') appToast('Cảm ơn anh/chị đã đánh giá');
    }
    ov.addEventListener('click', function (e) {
      var b = e.target.closest('[data-rate]');
      if (b) {
        pick = b.dataset.rate;
        ov.querySelectorAll('[data-rate]').forEach(function (x) { x.classList.toggle('on', x === b); });
        if (pick !== 'bad') return save(pick);
        ov.querySelector('.rate-more').hidden = false; ov.querySelector('[data-rate-send]').hidden = false; return;
      }
      var w = e.target.closest('[data-why]');
      if (w) { var i = why.indexOf(w.dataset.why); if (i >= 0) why.splice(i, 1); else why.push(w.dataset.why); w.classList.toggle('on', i < 0); return; }
      if (e.target.closest('[data-rate-send]')) return save(pick || 'bad');
      if (e.target.closest('[data-rate-skip]')) return save('skip');
    });
    phone(ov);
  }
  // Hỏi ngay sau khi khách xác nhận xong việc
  var baseRepair = confirmRepairByTenant;
  confirmRepairByTenant = function (room, id) {
    var r = baseRepair.apply(this, arguments);
    var ev = ((readTenantEventsSafe()[room]) || []).find(function (e) { return String(e.id) === String(id); });
    if (ev && ev.status === 'Đã hoàn tất') setTimeout(function () { ask({ room: room, job: 'repair', jobId: id, worker: ev.fixedBy || ev.acceptedBy, title: 'Sửa ' + String(ev.title || '').replace(/^Đã báo hư hỏng:\s*/, ''), question: 'Việc sửa ' + String(ev.title || '').replace(/^Đã báo hư hỏng:\s*/, '') + ' thế nào?' }); }, 400);
    return r;
  };
  var baseHand = confirmRoomHandover;
  confirmRoomHandover = function (id) {
    var r = baseHand.apply(this, arguments);
    var rec = readHandoverRecords().find(function (x) { return String(x.id) === String(id); });
    if (rec && rec.confirmedAt) setTimeout(function () { ask({ room: rec.room, job: 'handover', jobId: id, worker: rec.inspector, title: 'Giao phòng ' + rec.room, question: 'Việc giao phòng thế nào?' }); }, 400);
    return r;
  };
  var baseOut = confirmCheckoutByTenant;
  confirmCheckoutByTenant = function (room) {
    var before = readCheckouts()[room], r = baseOut.apply(this, arguments), rec = readCheckouts()[room];
    if (rec && rec.status === 'Đã hoàn cọc' && before && before.status !== 'Đã hoàn cọc') setTimeout(function () { ask({ room: room, job: 'checkout', jobId: rec.room + '|' + rec.tenantConfirmedAt, worker: rec.holder || rec.createdBy, title: 'Trả phòng, hoàn cọc ' + room, question: 'Việc trả phòng, hoàn cọc thế nào?' }); }, 400);
    return r;
  };

  // Tổng hợp theo người làm, 90 ngày gần đây
  function stats(list) {
    var since = Date.now() - DAYS * 864e5, by = {};
    list.forEach(function (r) {
      if (r.level === 'skip' || t(r.at) < since) return;
      var s = by[r.worker] = by[r.worker] || { good: 0, ok: 0, bad: 0, total: 0 };
      s[r.level] = (s[r.level] || 0) + 1; s.total++;
    });
    return by;
  }
  window.ratingLine = function (s) { return s && s.total ? s.good + '/' + s.total + ' hài lòng' + (s.bad ? ' · ' + s.bad + ' chưa hài lòng' : '') : 'Chưa có đánh giá'; };
  // Máy chủ nhà lưu tỉ lệ cho quản lý xem (không có tên khách)
  function publish() {
    if (acct()[0] !== 'owner') return;
    var by = stats(window.readRatings()), cur = {}; try { cur = JSON.parse(localStorage.getItem('homeServiceScores') || '{}') || {}; } catch (e) {}
    var next = {}; Object.keys(by).forEach(function (k) { next[k] = by[k]; });
    if (JSON.stringify(cur.byWorker || {}) !== JSON.stringify(next)) localStorage.setItem('homeServiceScores', JSON.stringify({ byWorker: next, days: DAYS, updatedAt: new Date().toLocaleString('vi-VN') }));
  }
  setTimeout(publish, 5000); setInterval(publish, 120000);

  // Chủ nhà: đánh giá chưa hài lòng → Việc cần xử lý
  var baseCollect = collectWorkItems;
  collectWorkItems = function () {
    var items = baseCollect.apply(this, arguments), scope = workScope();
    if (scope.role !== 'owner') return items;
    window.readRatings().forEach(function (r) {
      if (r.level !== 'bad' || r.seenAt) return;
      items.unshift({ type: 'complaint', house: r.house, room: r.room, title: r.room + ' · Khách chưa hài lòng: ' + r.jobTitle, sub: [r.tenantName, r.worker + ' làm', r.reasons.join(', '), r.note].filter(Boolean).join(' · '), time: t(r.at), urgent: true,
        actions: [{ label: 'Đã xem', run: function () { var l = window.readRatings(), x = l.find(function (i) { return i.id === r.id; }); if (x) { x.seenAt = new Date().toLocaleString('vi-VN'); x.seenBy = scope.name; saveRatings(l); } try { renderManagementOverview(); } catch (e) {} } }] });
    });
    return items;
  };
  setTimeout(function () { try { if (document.getElementById('workCenter')) renderWorkCenter(); } catch (e) {} }, 0);
  // Chủ nhà mở hồ sơ quản lý: thấy tỉ lệ và từng đánh giá
  function listSheet(name) {
    var list = window.readRatings().filter(function (r) { return r.worker === name && r.level !== 'skip'; }).sort(function (a, b) { return t(b.at) - t(a.at); });
    var ov = document.createElement('div');
    ov.className = 'modal-overlay';
    ov.innerHTML = '<div class="modal-sheet"><div class="modal-head">Khách đánh giá · ' + esc(name) + '</div>' + (list.length ? list.map(function (r) {
      return '<div class="hh-row"><div><strong><span class="rate-emo">' + { good: '😊', ok: '😐', bad: '🙁' }[r.level] + '</span>' + esc(LEVEL[r.level]) + ' · ' + esc(r.jobTitle) + '</strong><small>' + esc([r.tenantName, r.room, String(r.at).split(' ').pop(), r.reasons.join(', '), r.note].filter(Boolean).join(' · ')) + '</small></div></div>';
    }).join('') : '<p class="note">Chưa có đánh giá.</p>') + '<div class="modal-actions"><button type="button" data-close>Đóng</button></div></div>';
    ov.addEventListener('click', function (e) { if (e.target === ov || e.target.closest('[data-close]')) ov.remove(); });
    phone(ov);
  }
  var baseMgr = openManagerForm;
  openManagerForm = function (user) {
    var r = baseMgr.apply(this, arguments);
    if (user && acct()[0] === 'owner') {
      var form = Array.prototype.slice.call(document.querySelectorAll('.user-sheet')).pop(), head = form && form.querySelector('.modal-head');
      if (head && !form.querySelector('[data-rating-list]')) head.insertAdjacentHTML('afterend', '<button type="button" class="user-info-row rate-row" data-rating-list><span>Khách đánh giá (90 ngày)</span><strong>' + esc(window.ratingLine(stats(window.readRatings())[user.name])) + ' ›</strong></button>');
      var b = form && form.querySelector('[data-rating-list]'); if (b) b.addEventListener('click', function () { listSheet(user.name); });
    }
    return r;
  };
  // Quản lý: thấy tỉ lệ của mình trong Tài khoản của tôi
  var baseMy = openMyAccount;
  openMyAccount = function () {
    var r = baseMy.apply(this, arguments), a = acct();
    if (a[0] === 'manager') {
      var sc = {}; try { sc = (JSON.parse(localStorage.getItem('homeServiceScores') || '{}') || {}).byWorker || {}; } catch (e) {}
      var sheet = Array.prototype.slice.call(document.querySelectorAll('.modal-sheet')).pop(), rows = sheet ? sheet.querySelectorAll('.user-info-row') : [];
      if (rows.length > 1) rows[1].insertAdjacentHTML('afterend', '<div class="user-info-row"><span>Khách đánh giá (90 ngày)</span><strong>' + esc(window.ratingLine(sc[a[1]])) + '</strong></div>');
    }
    return r;
  };
})();

// Chi tiết báo hư (anh 15/11): chủ nhà / quản lý bấm Xem ở dòng báo hư thấy đủ như khách:
// thiết bị nào (ảnh lúc giao phòng, hãng), ai báo, lúc nào, mô tả, ảnh khách chụp, ai phụ trách, đang chờ ai, hẹn sửa, chi phí, diễn biến.
(function () {
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function stamp(e) { var m = String(e && e.id || '').match(/^(\d{13})/); return m ? Number(m[1]) : 0; }
  function hm(ms) { if (!ms) return ''; var d = new Date(ms), p = function (v) { return String(v).padStart(2, '0'); }; return p(d.getHours()) + ':' + p(d.getMinutes()) + ' ' + p(d.getDate()) + '/' + p(d.getMonth() + 1); }
  function vtime(v) { try { return parseViTime(v) || 0; } catch (e) { return 0; } }
  function kv(k, v) { return v ? '<div class="tenant-kv"><span>' + esc(k) + '</span><strong>' + esc(v) + '</strong></div>' : ''; }
  function money(v, room) { try { return amountForHouse(v, propertyIdForRoom(room)); } catch (e) { return String(v); } }
  function sec(t) { return '<div class="rp-sec">' + esc(t) + '</div>'; }
  function roleNow() { try { return workScope().role; } catch (x) { return ''; } }
  // Khối thông tin dùng chung: màn chi tiết (chủ nhà, quản lý, khách) và màn Tiếp nhận / Hẹn lại của quản lý
  window.repairInfoHtml = function (room, id, mode) {
    var evs = []; try { evs = readTenantEventsSafe()[room] || []; } catch (e) {}
    var e = evs.find(function (x) { return x && x.id === id; }); if (!e) return '';
    var staff = /^(owner|manager)$/.test(roleNow());
    var asset = e.asset || String(e.title || '').replace(/^Đã báo hư hỏng:\s*/, '');
    var inv = []; try { inv = readRoomInventory(room) || []; } catch (x) {}
    var hand = []; try { hand = (getConfirmedRoomHandover(room) || {}).items || []; } catch (x) {}
    var it = inv.find(function (x) { return x.name === asset; }) || {}, h = hand.find(function (x) { return x.name === asset; }) || {};
    var photo = it.photo || h.photo, brand = it.brand || h.brand, note = it.note || h.note, cond = h.condition || '';
    var desc = String(e.detail || '').split(' · ')[0];
    var mgr = ''; try { mgr = readRoomManagerAssignments()[room] || ''; } catch (x) {}
    var meName = ''; try { meName = currentActorName(); } catch (x) {}
    var st = e.status || 'Chờ xử lý', w = null;
    try { w = (window.waitingSteps ? window.waitingSteps() : []).filter(function (o) { return o.room === room && o.type === 'repair' && o.asset === asset; })[0]; } catch (x) {}
    var stText = st === 'Chờ xử lý' ? (w ? (w.whoName && w.whoName === meName ? 'Đang chờ bạn tiếp nhận' : w.wait) : mgr ? 'Đang chờ quản lý ' + mgr + ' tiếp nhận' : (roleNow() === 'owner' ? 'Đang chờ bạn tiếp nhận' : 'Đang chờ chủ nhà tiếp nhận')) : st === 'Đã tiếp nhận' ? (e.repairDate ? (e.acceptedBy ? e.acceptedBy + ' hẹn sửa ' : 'Hẹn sửa ') + viDate(e.repairDate) + (function () { var l = 0; try { l = Math.round((dayStart() - dayStart(e.repairDate)) / 864e5); } catch (x) {} return l > 0 ? ' · quá hẹn ' + l + ' ngày' : ''; })() : (e.acceptedBy ? e.acceptedBy + ' đã tiếp nhận' : 'Đã tiếp nhận')) + (e.tenantRejectReason ? ' · sửa lại' : '') : st === 'Chờ khách xác nhận' ? (e.tenantName && e.tenantName === meName ? 'Đã sửa xong, đang chờ bạn xác nhận' : 'Đã sửa xong, đang chờ ' + (e.tenantName || 'khách') + ' xác nhận') : /^(Đã hoàn tất|Đã sửa)$/.test(st) ? 'Đã sửa xong' : st === 'Từ chối' ? 'Không nhận sửa' : st;
    // Khoản nhà trả: khách không cần biết số tiền (tester 17/11)
    var costOf = function (c, pays) { if (!staff && !pays) return ''; return c != null && c !== '' ? (Number(c) > 0 ? money(c, room) + (pays ? ' · khách trả' : ' · nhà trả') : 'Không tốn tiền') : ''; };
    var cost = costOf(e.repairCost, e.tenantPays);
    // Chi phí sửa bị chủ nhà từ chối: nhân viên vẫn thấy ai từ chối, vì sao (anh 16/11: từ chối xong mất hết thông tin)
    var xr = null; if (staff) { try { xr = readExpenseRecords().find(function (r) { return r && r.id === 'repair-' + id && r.status === 'Từ chối'; }) || null; } catch (x) {} }
    var xp = null; if (staff) { try { xp = readExpenseRecords().find(function (r) { return r && r.id === 'repair-' + id && r.status === 'Chờ duyệt' && r.prevRejects && r.prevRejects.length; }) || null; } catch (x) {} }
    var phone = ''; try { var u = readUsers().find(function (x) { return x.role === 'tenant' && x.room === room && x.name === e.tenantName && x.status !== 'Đã xoá'; }); phone = u && u.phone || ''; } catch (x) {}
    // Lần sửa trước của đúng món này: hư lặp lại thì quản lý biết mà tính (thay mới, gọi bảo hành, hỏi khách)
    var before = evs.filter(function (x) { return x && x.id !== id && x.kind === 'repair' && (x.asset || String(x.title || '').replace(/^Đã báo hư hỏng:\s*/, '')) === asset && x.fixedAt; }).map(function (x) { return hm(vtime(x.fixedAt)).split(' ').pop() + ' · ' + (x.fixedBy || 'đã sửa') + (staff && costOf(x.repairCost, x.tenantPays) ? ' · ' + costOf(x.repairCost, x.tenantPays) : '') + (x.repairNote ? ' · ' + x.repairNote : ''); });
    var steps = [{ ts: stamp(e) || vtime(e.date), t: (e.tenantName || 'Khách') + ' báo hư' }];
    var t0 = stamp(e) || vtime(e.date), t1 = Infinity; evs.forEach(function (x) { if (x && x.kind === 'repair' && x.id !== id && (x.asset || String(x.title || '').replace(/^Đã báo hư hỏng:\s*/, '')) === asset) { var s = stamp(x); if (s > t0 && s < t1) t1 = s; } });
    evs.forEach(function (x) { if (!x || x.id === id) return; var t = String(x.title || ''); if (t.indexOf(asset) < 0 || !/^(Tiếp nhận sửa|Hẹn lại ngày sửa|Báo chưa sửa xong|Đã sửa|Từ chối sửa)/.test(t)) return; if (x.repairId ? x.repairId !== id : !((vtime(x.at) || stamp(x)) >= t0 - 6e4 && (vtime(x.at) || stamp(x)) < t1)) return; var tt = t.replace(': ' + asset, '').replace(/^Tiếp nhận sửa · hẹn /, 'Tiếp nhận, hẹn sửa ').replace(/^Hẹn lại ngày sửa · hẹn /, 'Hẹn lại ngày sửa: ') + (x.detail && !/chưa sửa xong/i.test(t) ? ' (' + x.detail + ')' : ''); steps.push({ ts: vtime(x.at) || stamp(x), t: (x.actor ? x.actor + ': ' + tt.charAt(0).toLocaleLowerCase('vi') + tt.slice(1) : tt) + (x.detail && /chưa sửa xong/i.test(t) ? ' – ' + x.detail : '') }); });
    (Array.isArray(e.prevFixes) ? e.prevFixes : []).forEach(function (f) { if (!f || !f.at) return; var c = costOf(f.cost, f.tenantPays); steps.push({ ts: vtime(f.at), t: (f.by || 'Quản lý') + ': đã sửa xong' + (c ? ' · ' + c : '') }); });
    // Chi phí bị từ chối rồi ghi lại: dòng "đã sửa xong" giữ số lúc đầu, số mới nằm ở dòng "ghi lại chi phí"
    var firstCost = cost; try { var xf = readExpenseRecords().find(function (r) { return r && r.id === 'repair-' + id && r.prevRejects && r.prevRejects.length; }); if (xf && xf.prevRejects[0].amount != null) firstCost = costOf(xf.prevRejects[0].amount, e.tenantPays); } catch (x) {}
    if (e.fixedBy && e.fixedAt && st !== 'Đã tiếp nhận') steps.push({ ts: vtime(e.fixedAt), t: e.fixedBy + ': đã sửa xong' + (firstCost ? ' · ' + firstCost : '') });
    if (staff) { try { var xa = readExpenseRecords().find(function (r) { return r && r.id === 'repair-' + id; }); (xa && xa.prevRejects || []).forEach(function (p) { steps.push({ ts: vtime(p.rejectedAt), t: (p.rejectedBy || 'Chủ nhà') + ': từ chối chi phí ' + money(p.amount, room) + (p.rejectReason ? ' – ' + p.rejectReason : '') }); if (p.redoAt) steps.push({ ts: vtime(p.redoAt), t: (p.redoBy || 'Quản lý') + ': ghi lại chi phí ' + money(p.newAmount, room) }); }); if (xa && xa.status === 'Đã duyệt' && (xa.prevRejects || []).length && xa.approvedAt) steps.push({ ts: vtime(xa.approvedAt), t: String(xa.approvedBy || 'Chủ nhà').split(' · ')[0] + ': duyệt chi phí ' + money(xa.amount, room) }); } catch (x) {} }
    if (xr) steps.push({ ts: vtime(xr.rejectedAt), t: (xr.rejectedBy || 'Chủ nhà') + ': từ chối chi phí' + (xr.rejectReason ? ' – ' + xr.rejectReason : '') });
    if (e.resolvedAt && /^(Đã hoàn tất|Đã sửa)$/.test(st)) steps.push({ ts: vtime(e.resolvedAt), t: (e.confirmedBy || e.tenantName || 'Khách') + ': xác nhận đã sửa xong' });
    steps.sort(function (a, b) { return a.ts - b.ts; });
    var H = '';
    // 1) Món nào: ảnh lúc giao phòng để biết đúng cái
    H += '<div class="rp-units one" style="margin:0 0 6px"><div class="rp-unit" style="cursor:default">' + (photo ? '<img src="' + esc(photo) + '" alt="">' : '<span class="rp-nophoto">Chưa có ảnh</span>') + '<span><b>' + esc(asset) + '</b><small>' + esc([brand, cond && cond !== 'Hoạt động tốt' ? cond : '', note].filter(Boolean).join(' · ') || (photo ? 'Ảnh lúc giao phòng' : (it.name || h.name) ? 'Lúc giao phòng' : 'Khách thêm khi báo, chưa có trong danh sách đồ đạc')) + '</small></span></div></div>';
    // 2) Khách báo gì
    H += sec('Khách báo') + kv('Người báo', (e.tenantName || '') + (stamp(e) ? ' · ' + hm(stamp(e)) : (e.date ? ' · ' + e.date : ''))) + (staff && phone ? '<div class="tenant-kv"><span>Điện thoại</span><strong><a href="tel:' + esc(String(phone).replace(/[^\d+]/g, '')) + '">' + esc(phone) + '</a></strong></div>' : '') + kv('Mô tả', desc) +
      (e.photo ? '<img class="rp-photo" src="' + esc(e.photo) + '" alt="">' : (mode === 'accept' ? kv('Ảnh khách chụp', 'Không có') : ''));
    // 3) Để quyết định (chỉ màn tiếp nhận / nhân viên)
    if (staff) H += sec('Món này trước đây') + (before.length ? '<div class="rp-list">' + before.map(function (b) { return '<div>' + esc(b) + '</div>'; }).join('') + '</div>' : '<div class="rp-list muted">Chưa sửa lần nào</div>');
    if (mode === 'accept') return H; // hạn mức chi chỉ nhắc ở màn Đã sửa xong (lúc nhập chi phí)
    // 4) Đang xử lý ra sao
    H += sec('Xử lý') + kv('Phụ trách', mgr ? 'Quản lý ' + mgr : 'Chủ nhà') + kv('Trạng thái', stText) + kv('Ghi chú hẹn', e.repairPlanNote) + kv('Chi phí sửa', cost) + (xr ? kv('Duyệt chi phí', 'Bị ' + (xr.rejectedBy || 'chủ nhà') + ' từ chối' + (xr.rejectReason ? ': ' + xr.rejectReason : '')) : '') + (xp ? kv('Chi phí ghi lại', money(xp.amount, room) + ' · chờ duyệt') : '') + kv('Ghi chú sửa', e.repairNote);
    if (steps.length > 1) H += sec('Diễn biến') + '<div class="rp-list">' + steps.map(function (s) { return '<div>' + esc(hm(s.ts)) + ' · ' + esc(s.t) + '</div>'; }).join('') + '</div>';
    return H;
  };
  // Bấm ảnh khách chụp để xem to, bấm lần nữa để đóng
  document.addEventListener('click', function (ev) {
    var img = ev.target && ev.target.closest && ev.target.closest('.rp-photo'); if (!img) return;
    ev.preventDefault(); ev.stopPropagation();
    var z = document.createElement('div'); z.className = 'rp-zoom'; z.innerHTML = '<img alt="">'; z.firstChild.src = img.src;
    z.addEventListener('click', function (e2) { e2.stopPropagation(); z.remove(); }); document.body.appendChild(z);
  }, true);
  window.repairInfoCss = '<style>.rp-detail .tenant-kv span,.rp-accept .tenant-kv span{white-space:nowrap;margin-right:10px}.rp-detail .tenant-kv strong,.rp-accept .tenant-kv strong{text-align:right}.rp-sec{font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#7a7f7a;margin:12px 0 4px}.rp-list{font-size:12.5px;line-height:1.55;margin:2px 0 6px}.rp-list.muted{color:#8a8f8a}.rp-detail a[href^=tel],.rp-accept a[href^=tel]{color:inherit;text-decoration:none;border-bottom:1px dashed currentColor}.rp-photo{display:block;width:100%;max-height:260px;object-fit:contain;background:#f1eee8;border-radius:12px;margin:6px 0 4px;cursor:zoom-in}.rp-zoom{position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.88);display:flex;align-items:center;justify-content:center;padding:16px;cursor:zoom-out}.rp-zoom img{max-width:100%;max-height:100%;object-fit:contain;border-radius:8px}</style>';
  window.openRepairDetail = function (room, id) {
    var evs = []; try { evs = readTenantEventsSafe()[room] || []; } catch (e) {}
    var e = evs.find(function (x) { return x && x.id === id; }); if (!e) return false;
    var asset = e.asset || String(e.title || '').replace(/^Đã báo hư hỏng:\s*/, '');
    var overlay = document.createElement('div'); overlay.className = 'modal-overlay';
    overlay.innerHTML = window.repairInfoCss + '<div class="modal-sheet rp-detail" style="max-height:78vh;overflow:auto;padding-bottom:16px"><div class="modal-head">Báo hư: ' + esc(asset) + ' · ' + esc(room) + '</div>' + window.repairInfoHtml(room, id, 'detail') +
      '<div class="modal-actions"><button type="button" data-close>Đóng</button></div></div>';
    appendToPhone(overlay);
    overlay.addEventListener('click', function (ev) { if (ev.target === overlay || ev.target.closest('[data-close]')) overlay.remove(); });
    return true;
  };
  // Dòng báo hư ở Việc cần xử lý: bấm dòng / Xem mở chi tiết
  if (typeof collectWorkItems === 'function') {
    var baseC = collectWorkItems;
    collectWorkItems = function () {
      var items = baseC.apply(this, arguments);
      try {
        var all = readTenantEventsSafe();
        items.forEach(function (it) {
          if (!it || it.type !== 'repair' || !it.room || (it.target && it.target.repairId)) return;
          var name = String(it.title || '').replace(/^.*?Báo hư:\s*/, '');
          var e = (all[it.room] || []).find(function (x) { return x && x.kind === 'repair' && (x.asset || String(x.title || '').replace(/^Đã báo hư hỏng:\s*/, '')) === name; });
          if (e) it.target = { type: 'room', room: it.room, repairId: e.id };
          var mg = ''; try { mg = readRoomManagerAssignments()[it.room] || ''; } catch (x) {}
          if (e && mg && workScope().role === 'owner') it.actions = [{ label: 'Xem', open: true }];
        });
      } catch (e) {}
      return items;
    };
  }
  if (typeof collectHistoryItems === 'function') {
    var baseH = collectHistoryItems;
    collectHistoryItems = function () {
      var items = baseH.apply(this, arguments);
      try {
        var all = readTenantEventsSafe();
        items.forEach(function (it) {
          if (!it || !it.room || (it.target && it.target.repairId)) return;
          var m = String(it.title || '').match(/ · (?:Đã sửa|Từ chối sửa|Báo hư|Báo chưa sửa xong|Tiếp nhận sửa|Hẹn lại ngày sửa): (.+?)(?: · hẹn .*)?$/); if (!m) return;
          var name = m[1], t = it.time || 0;
          var list = (all[it.room] || []).filter(function (x) { return x && x.kind === 'repair' && (x.asset || String(x.title || '').replace(/^Đã báo hư hỏng:\s*/, '')) === name; });
          if (!list.length) return;
          // lần báo gần nhất trước thời điểm dòng lịch sử
          var pick = list.filter(function (x) { return stamp(x) && stamp(x) <= (t || Infinity) + 6e4; }).sort(function (a, b) { return stamp(b) - stamp(a); })[0] || list[0];
          it.target = { type: 'room', room: it.room, repairId: pick.id };
        });
      } catch (e) {}
      return items;
    };
  }
  if (typeof openWorkTarget === 'function') {
    var baseO = openWorkTarget;
    // Người phải làm bấm dòng = bấm nút việc kế tiếp (anh chốt 16/11, cách 1); người chỉ xem thì mở chi tiết
    var NEXT = ['Hẹn lại', 'Tiếp nhận', 'Hẹn ngày sửa', 'Đã sửa xong', 'Nhập chi phí'];
    openWorkTarget = function (item) {
      var t = item && item.target;
      if (t && t.repairId) {
        var acts = (item.actions || []).filter(function (a) { return a && typeof a.run === 'function' && !a.open; }), pick = null;
        NEXT.some(function (l) { pick = acts.find(function (a) { return a.label === l; }) || null; return !!pick; });
        if (pick) { pick.run(); try { renderManagementOverview(); } catch (x) {} return; }
        if (window.openRepairDetail(t.room, t.repairId)) return;
      }
      return baseO.apply(this, arguments);
    };
  }
})();

// Chi phí bị từ chối (anh 16/11): người ghi khoản chi thấy ngay ở Việc cần xử lý, ai từ chối, lý do; bấm Đã xem thì tắt
(function () {
  if (typeof collectWorkItems !== 'function') return;
  var base = collectWorkItems;
  collectWorkItems = function () {
    var items = base.apply(this, arguments);
    try {
      var sc = workScope(); if (sc.role !== 'manager') return items;
      readExpenseRecords().forEach(function (r) {
        if (!r || r.status !== 'Từ chối' || r.rejectSeen || r.createdBy !== sc.name) return;
        var house = r.propertyId || 'HOME-001'; if (!sc.houseOk(house)) return;
        items.push({ type: r.source === 'repair' ? 'repair' : 'expense', house: house, room: r.room || '', urgent: true,
          title: 'Chi phí bị từ chối: ' + r.name,
          sub: [amountForHouse(r.amount, house), (r.rejectedBy || 'Chủ nhà') + ' từ chối' + (r.rejectReason ? ': ' + r.rejectReason : '')].join(' · '),
          time: (function () { try { return parseViTime(r.rejectedAt) || 0; } catch (x) { return 0; } })(),
          actions: (r.source === 'repair' && r.room ? [{ label: 'Ghi lại chi phí', run: function () { window.openRepairCostRedo(r.id); } }] : []).concat([{ label: 'Đã xem', run: function () {
            localStorage.setItem('homeExpenseRecords', JSON.stringify(readExpenseRecords().map(function (x) { return x.id === r.id ? Object.assign({}, x, { rejectSeen: true }) : x; })));
            try { renderManagementOverview(); } catch (x) {}
          } }]),
          target: r.source === 'repair' && r.room ? { type: 'room', room: r.room, repairId: String(r.id).replace(/^repair-/, '') } : { type: 'expense', id: r.id } });
      });
    } catch (e) {}
    return items;
  };
})();

// Cách 1 (anh chốt 16/11): chủ nhà từ chối phí sửa → khoản nợ của khách giữ nguyên; quản lý "Ghi lại chi phí" (số mới) → chờ chủ nhà duyệt lại;
// duyệt xong thì chi phí báo hư và khoản nợ bồi thường của khách đổi theo số mới (khách đã trả dư → thành tiền trả trước).
(function () {
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function saveRecs(list) { localStorage.setItem('homeExpenseRecords', JSON.stringify(list)); }
  function evOf(rec) { var id = String(rec.id).replace(/^repair-/, ''); return ((readTenantEventsSafe()[rec.room] || [])).find(function (e) { return e && e.id === id; }) || null; }
  // Duyệt xong số mới: đổi chi phí trên báo hư và khoản nợ bồi thường của khách
  function applyNewCost(rec) {
    var room = rec.room, house = rec.propertyId || propertyIdForRoom(room), eid = String(rec.id).replace(/^repair-/, ''), n = Number(rec.amount) || 0;
    var ev = evOf(rec); if (!ev) return;
    var old = Number(ev.repairCost) || 0; if (Math.abs(old - n) < 0.005) return;
    updateTenantEvent(room, eid, function (e) { e.repairCost = n; e.detail = String(e.detail || '').replace(/ · Chi phí [^·]+?(?= ·|$)/, ' · Chi phí ' + amountForHouse(n, house)); });
    if (!ev.tenantPays) return;
    var list = readRentCharges(), d = list.find(function (c) { return c.period === 'damage-' + eid; }); if (!d) return;
    var total = d.originalAmount != null ? Number(d.originalAmount) : Number(d.amount) || 0;
    // Số khách đã trả thật: bỏ phần trả bị ghi đôi do lỗi đồng bộ cũ (cùng cách trả, cùng số, cùng giờ), không quá tổng nợ
    var seenP = {}, paid = (d.parts || []).reduce(function (s, p) { var k = p.id || [p.via, p.amount, p.at].join('|'); if (seenP[k]) return s; seenP[k] = 1; return s + (Number(p.amount) || 0); }, 0) || (d.status === 'Đã thu' ? total : 0);
    paid = Math.max(0, paid - (Number(d.refunded) || 0)); if (d.status !== 'Đã huỷ') paid = Math.min(paid, total);
    var nt = roundForHouse(n, house), wasCancelled = d.status === 'Đã huỷ';
    if (wasCancelled) { delete d.cancelledAt; delete d.cancelReason; }
    d.originalAmount = nt;
    if (paid >= nt - 0.005) { d.status = 'Đã thu'; d.amount = nt; d.paidAt = d.paidAt || new Date().toLocaleString('vi-VN'); d.paidBy = d.paidBy || currentActorName(); }
    else { d.status = 'Chưa thu'; d.amount = Math.round((nt - paid) * 100) / 100; delete d.paidAt; delete d.paidBy; delete d.paidVia; }
    saveRentCharges(list);
    var back = Math.round((paid - nt) * 100) / 100;
    if (back > 0.005) addTenantCredit(d.tenantKey, back);
    appendRoomHistory(room, { id: 'adj-damage-' + eid + '-' + Math.round(nt * 100), kind: 'charge', title: (wasCancelled ? 'Ghi lại bồi thường: ' : 'Đổi tiền bồi thường: ') + String(d.title || '').replace(/^Bồi thường /, ''),
      detail: (wasCancelled ? amountForHouse(nt, house) : amountForHouse(total, house) + ' → ' + amountForHouse(nt, house)) + (back > 0.005 ? ' · trả lại ' + amountForHouse(back, house) + ' vào tiền trả trước' : '') + ' · ' + (d.tenantName || ''), actor: currentActorName(), tenantName: d.tenantName || '' });
    try { if (back <= 0.005) applyTenantCredits(); } catch (x) {}
  }
  window.openRepairCostRedo = function (recId) {
    var rec = readExpenseRecords().find(function (r) { return r.id === recId; }); if (!rec) return;
    var house = rec.propertyId || propertyIdForRoom(rec.room), ev = evOf(rec), cur = (readProperties().find(function (h) { return h.id === house; }) || {}).currency === 'VND' ? '₫' : '$';
    var ov = document.createElement('div'); ov.className = 'modal-overlay confirm-overlay';
    ov.innerHTML = '<form class="modal-sheet confirm-sheet" novalidate><div class="modal-head">Ghi lại chi phí · ' + esc(rec.name) + '</div>' +
      '<div class="tenant-kv"><span>Chi phí cũ</span><strong>' + esc(amountForHouse(rec.amount, house)) + '</strong></div>' +
      '<div class="tenant-kv"><span>' + esc('Bị ' + (rec.rejectedBy || 'Chủ nhà') + ' từ chối') + '</span><strong>' + esc(rec.rejectReason || '') + '</strong></div>' +
      (ev && ev.tenantPays ? '<p class="confirm-text">Khách trả tiền sửa: chủ nhà duyệt số mới thì khoản bồi thường của khách đổi theo.</p>' : '') +
      '<label><span>Chi phí mới</span> (' + cur + ')</label><input name="cost" type="number" min="0" step="any" inputmode="decimal" data-req>' +
      '<label>Ghi chú</label><input name="note" maxlength="160" placeholder="Ví dụ: hỏi lại thợ, bớt tiền gas">' +
      '<p class="user-error" hidden></p><div class="modal-actions"><button type="button" data-cancel>Huỷ</button><button type="submit" class="save">Gửi chủ nhà duyệt</button></div></form>';
    appendToPhone(ov);
    var f = ov.querySelector('form');
    ov.querySelector('[data-cancel]').addEventListener('click', function () { ov.remove(); });
    // Nhập 0 thì xong ngay, không gửi chủ nhà: đổi chữ nút cho đúng
    f.cost.addEventListener('input', function () { var b = f.querySelector('.save'), zero = f.cost.value !== '' && Number(f.cost.value) === 0; b.textContent = zero ? 'Lưu' : 'Gửi chủ nhà duyệt'; try { window.homeI18nApply && window.homeI18nApply(b); } catch (x) {} });
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var v = Number(f.cost.value), box = f.querySelector('.user-error');
      if (f.cost.value === '' || !Number.isFinite(v) || v < 0) { box.textContent = 'Nhập chi phí mới, từ 0 trở lên.'; box.hidden = false; return; }
      var now = new Date().toLocaleString('vi-VN'), me = currentActorName(), note = f.note.value.trim(), done = null;
      saveRecs(readExpenseRecords().map(function (r) {
        if (r.id !== recId) return r;
        var x = Object.assign({}, r, { amount: v, note: note || r.note, createdAt: now, createdBy: me, rejectSeen: true,
          prevRejects: (r.prevRejects || []).concat([{ amount: r.amount, rejectedBy: r.rejectedBy, rejectedAt: r.rejectedAt, rejectReason: r.rejectReason, redoBy: me, redoAt: now, newAmount: v }]) });
        delete x.rejectedBy; delete x.rejectedAt; delete x.rejectReason; delete x.peerApprovals; delete x.peerApprovedBy; delete x.peerApprovedAt;
        if (v > 0) x.status = 'Chờ duyệt'; else { x.status = 'Đã duyệt'; x.approvedAt = now; x.approvedBy = me + ' (không tốn tiền)'; }
        done = x; return x;
      }));
      ov.remove();
      if (done && done.status === 'Đã duyệt') applyNewCost(done);
      try { renderExpenseRecords(); } catch (x) {}
      try { renderManagementOverview(); } catch (x) {}
    });
  };
  if (typeof decideExpense === 'function') {
    var baseD = decideExpense;
    decideExpense = function (id, approve) {
      var r = baseD.apply(this, arguments);
      try {
        var rec = readExpenseRecords().find(function (x) { return x.id === id; });
        if (approve && rec && rec.source === 'repair' && rec.status === 'Đã duyệt' && rec.prevRejects && rec.prevRejects.length) { applyNewCost(rec); try { renderManagementOverview(); } catch (x) {} }
      } catch (e) {}
      return r;
    };
  }
})();

// Luật anh chốt 19/11: chủ nhà từ chối chi phí sửa → tự huỷ khoản bồi thường của khách; phần khách đã trả chuyển vào tiền trả trước.
// Quản lý "Ghi lại chi phí" và được duyệt thì khoản bồi thường ghi lại theo số mới. Chỉ một máy làm (máy trừ tiền trả trước của phòng).
(function () {
  function cancelRejectedDamages() {
    if (!window.HOME_REAL || typeof creditApplierHere !== 'function') return;
    var recs = readExpenseRecords(), list = readRentCharges(), changed = false, credits = [];
    recs.forEach(function (rec) {
      if (!rec || (rec.source !== 'repair' && rec.source !== 'lost-key') || rec.status !== 'Từ chối' || !rec.room || !creditApplierHere(rec.room)) return;
      var eid, d;
      if (rec.source === 'lost-key') {
        // Khách mất đồ (tester 20/11): khoản khách trả gắn với khoản chi bằng cùng mốc giờ; bản cũ lệch vài ms → tìm khoản mất đồ cùng phòng, cùng số, gần giờ nhất
        var ts = Number((String(rec.id).match(/^expense-(\d+)-lost$/) || [])[1]) || 0; eid = 'lost-' + ts;
        d = list.find(function (c) { return c.period === 'lost-' + ts; }) || list.filter(function (c) {
          var t = Number((String(c.period || '').match(/^lost-(\d+)$/) || [])[1]) || 0;
          return t && c.room === rec.room && Math.abs(t - ts) < 5000 && Math.abs((Number(c.originalAmount != null ? c.originalAmount : c.amount) || 0) - (Number(rec.amount) || 0)) < 0.005;
        }).sort(function (x, y) { return Math.abs(Number(x.period.slice(5)) - ts) - Math.abs(Number(y.period.slice(5)) - ts); })[0];
      } else { eid = String(rec.id).replace(/^repair-/, ''); d = list.find(function (c) { return c.period === 'damage-' + eid; }); }
      if (!d || d.status === 'Đã huỷ') return;
      var house = d.house || propertyIdForRoom(d.room), seen = {};
      var raw = (d.parts || []).reduce(function (t, q) { var k = q.id || [q.via, q.amount, q.at].join('|'); if (seen[k]) return t; seen[k] = 1; return t + (Number(q.amount) || 0); }, 0);
      var back = roundForHouse(Math.max(0, raw - (Number(d.refunded) || 0)), house), before = d.originalAmount != null ? Number(d.originalAmount) : Number(d.amount) || 0;
      d.refunded = roundForHouse((Number(d.refunded) || 0) + back, house);
      d.status = 'Đã huỷ'; d.originalAmount = 0; d.amount = 0; d.cancelledAt = new Date().toLocaleString('vi-VN'); d.cancelReason = rec.source === 'lost-key' ? 'Chủ nhà từ chối chi phí làm lại' : 'Chủ nhà từ chối chi phí sửa'; delete d.paidVia;
      changed = true;
      credits.push({ d: d, back: back, before: before, house: house, eid: eid, lost: rec.source === 'lost-key' });
    });
    if (!changed) return;
    saveRentCharges(list);
    credits.forEach(function (x) {
      if (x.back > 0.005) addTenantCredit(x.d.tenantKey, x.back);
      appendRoomHistory(x.d.room, { id: 'cancel-damage-' + x.eid + '-' + Math.round(x.before * 100), kind: 'charge', title: x.lost ? 'Huỷ khoản: ' + lcFirst(x.d.title || '') : 'Huỷ bồi thường: ' + String(x.d.title || '').replace(/^Bồi thường /, ''),
        detail: (x.lost ? 'Chủ nhà từ chối chi phí làm lại · ' : 'Chủ nhà từ chối chi phí sửa · ') + amountForHouse(x.before, x.house) + (x.back > 0.005 ? ' · trả lại ' + amountForHouse(x.back, x.house) + ' vào tiền trả trước' : '') + ' · ' + (x.d.tenantName || ''), actor: 'Tự động', tenantName: x.d.tenantName || '' });
    });
    try { applyTenantCredits(); } catch (e) {}
  }
  if (typeof ensureRentCharges === 'function') {
    var baseE = ensureRentCharges;
    ensureRentCharges = function () { var r = baseE.apply(this, arguments); try { cancelRejectedDamages(); } catch (e) {} return r; };
  }
  if (typeof decideExpense === 'function') {
    var baseD = decideExpense;
    decideExpense = function () { var r = baseD.apply(this, arguments); try { cancelRejectedDamages(); } catch (e) {} return r; };
  }
})();

// Lịch sử (tester 16/11): giữ dòng "Từ chối chi phí" của các lần trước và ghi việc quản lý ghi lại chi phí; dòng "Đổi tiền bồi thường" hiện số cũ → mới
(function () {
  if (typeof collectHistoryItems !== 'function') return;
  var base = collectHistoryItems;
  collectHistoryItems = function () {
    var items = base.apply(this, arguments);
    try {
      var sc = workScope(), tm = function (v) { try { return parseViTime(v) || 0; } catch (x) { return 0; } };
      readExpenseRecords().forEach(function (r) {
        if (!r || r.source !== 'repair' || !r.room || !(r.prevRejects || []).length) return;
        var house = r.propertyId || propertyIdForRoom(r.room); if (!sc.houseOk(house) || (sc.roomOk && !sc.roomOk(r.room))) return;
        var name = String(r.name).replace(' · ' + r.room, ''), tgt = { type: 'room', room: r.room, repairId: String(r.id).replace(/^repair-/, '') };
        r.prevRejects.forEach(function (p) {
          if (sc.role === 'manager' && p.redoBy !== sc.name && r.createdBy !== sc.name) return;
          items.push({ type: 'expense', house: house, room: r.room, title: r.room + ' · Từ chối chi phí: ' + name + (p.rejectReason ? ' – ' + p.rejectReason : ''), amountText: '', actor: p.rejectedBy || 'Chủ nhà', time: tm(p.rejectedAt), target: tgt });
          items.push({ type: 'expense', house: house, room: r.room, title: r.room + ' · Ghi lại chi phí: ' + name + (Number(p.newAmount) > 0 ? '' : ' · không tốn tiền'), amountText: amountForHouse(p.amount, house) + ' → ' + amountForHouse(p.newAmount, house), actor: p.redoBy || '', time: tm(p.redoAt), target: tgt });
        });
      });
      // Chủ nhà duyệt chi phí sửa: có dòng lịch sử như khi từ chối (tester 17/11)
      readExpenseRecords().forEach(function (r) {
        if (!r || r.source !== 'repair' || r.status !== 'Đã duyệt' || !r.room || !r.approvedAt || /^Tự động/.test(String(r.approvedBy || ''))) return;
        var house = r.propertyId || propertyIdForRoom(r.room); if (!sc.houseOk(house) || (sc.roomOk && !sc.roomOk(r.room))) return;
        var name = String(r.name).replace(' · ' + r.room, '');
        var ta = tm(r.approvedAt);
        if (items.some(function (it) { return it && it.room === r.room && /Duyệt chi phí/.test(it.title || '') && it.title.indexOf(name) >= 0 && Math.abs((Number(it.time) || 0) - ta) < 120000; })) return;
        items.push({ type: 'expense', house: house, room: r.room, title: r.room + ' · Duyệt chi phí: ' + name, amountText: amountForHouse(r.amount, house), actor: String(r.approvedBy || 'Chủ nhà').split(' · ')[0], time: ta, target: { type: 'room', room: r.room, repairId: String(r.id).replace(/^repair-/, '') } });
      });
      var ev = readTenantEventsSafe();
      items.forEach(function (it) {
        if (!it || !it.room || it.amountText || !/Đổi tiền bồi thường/.test(it.title || '')) return;
        var e = (ev[it.room] || []).filter(function (x) { return x && /^adj-damage-/.test(x.id || '') && String(it.title).indexOf(x.title) >= 0; })
          .sort(function (a, b) { return Math.abs(tm(a.at) - it.time) - Math.abs(tm(b.at) - it.time); })[0];
        var m = e && String(e.detail || '').match(/^(.+? → [^·]+)/); if (m) it.amountText = m[1].trim();
        // Khách đã trả nhiều hơn số mới: ghi rõ phần trả lại vào tiền trả trước (khách thấy tiền mình đi đâu)
        var b = e && String(e.detail || '').match(/trả lại [^·]+? vào tiền trả trước/); if (b && String(it.title).indexOf(b[0]) < 0) it.title += ' · ' + b[0];
      });
      items.sort(function (a, b) { return b.time - a.time; });
    } catch (e) {}
    return items;
  };
})();

// Báo đã trả (anh 16/11): lỗi đồng bộ cũ làm báo cáo đã được xác nhận quay về "Chờ xử lý" (còn acceptedBy/confirmedAt, khoản đã thu)
// → máy nhân viên tự sửa lại "Đã xác nhận". Dòng còn chờ thật: ghi rõ cần làm gì; bấm dòng = bấm Xác nhận.
(function () {
  function healPayments() {
    var sc; try { sc = workScope(); } catch (e) { return; }
    if (!sc || (sc.role !== 'owner' && sc.role !== 'manager')) return;
    var all; try { all = JSON.parse(localStorage.getItem('homeTenantEvents') || '{}'); } catch (e) { return; }
    var paidBy = {}; try { readRentCharges().forEach(function (c) { (c.parts || []).forEach(function (p) { if (p && p.via) paidBy[p.via] = paidBy[p.via] || p; }); }); } catch (e) {}
    var changed = false;
    Object.keys(all).forEach(function (room) {
      (Array.isArray(all[room]) ? all[room] : []).forEach(function (e) {
        if (!e || e.kind !== 'payment' || (e.status && e.status !== 'Chờ xử lý')) return;
        var part = paidBy[e.id];
        if (!e.confirmedAt && !part) return;
        e.status = 'Đã xác nhận';
        e.confirmedAt = e.confirmedAt || part.at;
        e.acceptedBy = e.acceptedBy || (part && part.by) || '';
        e.detail = String(e.detail || '').replace('Chờ quản lý xác nhận', 'Đã xác nhận bởi ' + (e.acceptedBy || 'quản lý'));
        changed = true;
      });
    });
    if (changed) localStorage.setItem('homeTenantEvents', JSON.stringify(all));
  }
  window.homeHealPayments = healPayments;
  if (typeof collectWorkItems === 'function') {
    var base = collectWorkItems;
    collectWorkItems = function () {
      try { healPayments(); } catch (e) {}
      var items = base.apply(this, arguments);
      try {
        items.forEach(function (it) {
          if (!it || it.type !== 'payment' || !/· Báo đã trả: /.test(it.title || '')) return;
          if (!(it.actions || []).some(function (a) { return a && a.label === 'Xác nhận'; })) return;
          if (!/cần xác nhận/.test(it.sub || '')) it.sub = [it.sub, 'báo đã chuyển khoản, cần xác nhận đã nhận tiền'].filter(Boolean).join(' · ');
          it.payConfirm = true;
        });
      } catch (e) {}
      return items;
    };
  }
  if (typeof openWorkTarget === 'function') {
    var baseO = openWorkTarget;
    openWorkTarget = function (item) {
      if (item && item.payConfirm) {
        var a = (item.actions || []).find(function (x) { return x && x.label === 'Xác nhận' && typeof x.run === 'function'; });
        if (a) { a.run(); return; }
      }
      return baseO.apply(this, arguments);
    };
  }
})();

// Thu chi (tester 16/11): khách đã báo chuyển khoản cho khoản khác tiền thuê / cọc (bồi thường, phụ phí, điện nước…)
// thì không còn dòng "Chưa thu" của chính khoản đó nữa (trước đây Chờ thu cộng 2 lần tới khi quản lý xác nhận).
(function () {
  if (typeof collectFinanceItems !== 'function') return;
  var base = collectFinanceItems;
  collectFinanceItems = function () {
    var items = base.apply(this, arguments);
    try {
      var rep = {}; // room → { tên khoản: số khách báo }
      Object.entries(readTenantEventsSafe()).forEach(function (kv) {
        (kv[1] || []).forEach(function (e) {
          if (!e || e.kind !== 'payment' || (e.status && e.status !== 'Chờ xử lý')) return;
          var m = rep[kv[0]] = rep[kv[0]] || {};
          // Báo trả thiếu: danh sách khoản vẫn ghi đủ số, nên chỉ tính tới đúng số khách báo (chia theo thứ tự khoản)
          var left = 0; try { left = eventAmount(e); } catch (x) { left = Number(e.amount) || 0; }
          (e.items || []).forEach(function (it) {
            if (!it || !it.title || left <= 0.005) return;
            var take = Math.min(Number(it.amount) || 0, left); left = Math.round((left - take) * 100) / 100;
            m[it.title] = (m[it.title] || 0) + take;
          });
        });
      });
      var drop = [];
      items.forEach(function (item) {
        if (!item || item.kind !== 'income' || !item.pending || !item.room || !rep[item.room]) return;
        if (!(item.actions || []).some(function (a) { return a && a.label === 'Đã thu'; })) return;
        var name = String(item.title || '').replace(item.room + ' · ', '');
        if (/^Tiền (thuê|cọc)/.test(name)) return; // phần này đã xử lý ở trên
        var a = rep[item.room][name]; if (!a) return;
        if (a >= Number(item.amount) - 0.005) { drop.push(item); rep[item.room][name] = a - Number(item.amount); }
        else { item.amount = Math.round((Number(item.amount) - a) * 100) / 100; item.sub = (item.sub || '') + ' · phần chưa có trong khoản khách báo'; rep[item.room][name] = 0; }
      });
      // Phần khách báo cho khoản đã đổi tên / đổi số (ví dụ phụ phí 3 người thành 4 người): trừ vào các khoản còn lại của phòng, cũ trước
      Object.keys(rep).forEach(function (room) {
        var gone = [], left = Object.keys(rep[room]).reduce(function (t, k) {
          var still = items.some(function (it) { return it && it.kind === 'income' && it.pending && it.room === room && String(it.title || '').replace(room + ' · ', '') === k; });
          if (!still && Number(rep[room][k]) > 0.005) gone.push(k.slice(0, 8));
          return still ? t : t + (Number(rep[room][k]) || 0);
        }, 0);
        var like = function (it) { var n = String(it.title || '').replace(room + ' · ', ''); return gone.some(function (g) { return n.indexOf(g) === 0; }) ? 0 : 1; };
        left = Math.round(left * 100) / 100; if (left <= 0.005) return;
        items.filter(function (it) { return it && it.kind === 'income' && it.pending && it.room === room && drop.indexOf(it) < 0 && !/^Tiền (thuê|cọc)/.test(String(it.title || '').replace(room + ' · ', '')) && (it.actions || []).some(function (a) { return a && a.label === 'Đã thu'; }); })
          .sort(function (x, y) { return like(x) - like(y) || (x.time || 0) - (y.time || 0); })
          .forEach(function (it) {
            if (left <= 0.005) return;
            if (left >= Number(it.amount) - 0.005) { drop.push(it); left = Math.round((left - Number(it.amount)) * 100) / 100; }
            else { it.amount = Math.round((Number(it.amount) - left) * 100) / 100; if (String(it.sub || '').indexOf('phần chưa có trong khoản khách báo') < 0) it.sub = (it.sub || '') + ' · phần chưa có trong khoản khách báo'; left = 0; }
          });
      });
      if (drop.length) items = items.filter(function (it) { return drop.indexOf(it) < 0; });
    } catch (e) {}
    return items;
  };
})();

// Hộp xác nhận: nhãn "Phòng" là một phòng (EN "Room", không phải tên tab "Rooms")
(function () {
  if (typeof confirmInfoHtml !== 'function') return;
  var base = confirmInfoHtml;
  confirmInfoHtml = function () { return String(base.apply(this, arguments)).split('<span>Phòng</span>').join('<span>Phòng⁠</span>'); };
})();

// Máy khách mở app: màn chính vẽ lần đầu có lúc trước khi app nhận ra người ở cùng thuộc hộ khách chính,
// nên khoản cần đóng của hộ không hiện ("Đã đóng đủ"). Vẽ lại một lần khi app đã sẵn (không đè cửa sổ đang mở).
(function () {
  function again(n) {
    var sel = document.getElementById('accountSelect');
    if (!sel || String(sel.value).split('|')[0] !== 'tenant' || typeof window.setAccount !== 'function') return;
    if (document.querySelector('.modal-overlay')) { if (n < 20) setTimeout(function () { again(n + 1); }, 1000); return; }
    var page = (document.querySelector('.subpage.active') || {}).id, y = window.scrollY;
    try { window.setAccount(sel.value); if (page && (document.querySelector('.subpage.active') || {}).id !== page) window.go(page); window.scrollTo(0, y); } catch (e) {}
  }
  function start() { setTimeout(function () { again(0); }, 2500); }
  if (document.readyState === 'complete') start(); else window.addEventListener('load', start, { once: true });
})();

// Nợ bồi thường (anh chốt 16/11): ghi tên khách chính (người trả tiền cho cả phòng), dù người ở cùng báo hư.
// Việc cần làm và lịch sử tiền của mọi người trong phòng đều thấy (lịch sử: dòng ghi nợ xếp vào loại tiền, không theo người báo).
(function () {
  function mainName(key) {
    var u = null; try { u = (readUsers() || []).find(function (x) { return x && x.key === key; }); } catch (e) {}
    return (u && (u.fullName || u.name)) || String(key || '').split('|')[1] || '';
  }
  window.homeMainTenantName = mainName;
  if (typeof addTenantDebt === 'function') {
    var base = addTenantDebt;
    addTenantDebt = function (room, tenantKey, tenantName) {
      var args = Array.prototype.slice.call(arguments);
      try { var k = typeof householdKey === 'function' ? householdKey(tenantKey) : tenantKey; args[1] = k; args[2] = mainName(k) || tenantName; } catch (e) {}
      return base.apply(this, args);
    };
  }
  // Dữ liệu cũ: khoản nợ đã ghi tên người ở cùng → máy nhân viên sửa thành tên khách chính
  function heal() {
    var sc; try { sc = workScope(); } catch (e) { return; }
    if (!sc || (sc.role !== 'owner' && sc.role !== 'manager')) return;
    var list = readRentCharges(), changed = false;
    list.forEach(function (c) {
      if (!c || c.extra !== 'debt' || !c.tenantKey) return;
      var n = mainName(c.tenantKey); if (n && c.tenantName !== n) { c.tenantName = n; changed = true; }
    });
    if (changed) saveRentCharges(list);
    // Tiền mặt khách trả dư (dòng "Khách trả trước (tiền mặt)"): người ở cùng đưa tiền thì vẫn ghi tên khách chính
    if (typeof readCashExtras !== 'function' || typeof householdKey !== 'function') return;
    var extras = readCashExtras(), users = readUsers() || [], moved = false;
    extras.forEach(function (x) {
      var u = x && users.find(function (y) { return y.role === 'tenant' && y.room === x.room && (y.name === x.tenantName || y.fullName === x.tenantName); });
      if (!u) return;
      var k = householdKey(u.key); if (!k || k === u.key) return;
      var n = mainName(k); if (n && n !== x.tenantName) { x.tenantName = n; moved = true; }
    });
    if (moved) localStorage.setItem('homeCashExtras', JSON.stringify(extras));
  }
  if (typeof collectFinanceItems === 'function') {
    var baseF = collectFinanceItems;
    collectFinanceItems = function () { try { heal(); } catch (e) {} return baseF.apply(this, arguments); };
  }
})();

// Hộp xác nhận mà nút chính là "Huỷ …" (huỷ báo trả phòng…): nút đóng đổi thành "Giữ lại" cho khỏi nhầm hai chữ Huỷ (tester 17/11)
(function () {
  if (typeof appConfirm !== 'function') return;
  var base = appConfirm;
  appConfirm = function (title, message, okLabel) {
    var r = base.apply(this, arguments);
    try {
      if (/^Huỷ/.test(String(okLabel || ''))) {
        var all = document.querySelectorAll('.confirm-overlay [data-confirm-cancel]'), b = all[all.length - 1];
        if (b) b.textContent = 'Giữ lại';
      }
    } catch (e) {}
    return r;
  };
})();

// Xác nhận đã nhận tiền (tester 17/11): so số khách chuyển với đúng các khoản khách đã chọn khi báo, không phải mọi khoản đang mở
// (phụ phí sinh ra sau lúc báo thì không làm hiện "Khách trả thiếu")
(function () {
  if (typeof paymentConfirmNote !== 'function') return;
  var base = paymentConfirmNote;
  paymentConfirmNote = function (room, amount) {
    try {
      var ev = (readTenantEventsSafe()[room] || []).filter(function (e) { return e && e.kind === 'payment' && (!e.status || e.status === 'Chờ xử lý'); }).pop();
      if (!ev || !Array.isArray(ev.items) || !ev.items.length) return base.apply(this, arguments);
      var house = propertyIdForRoom(room), total = 0, deposit = 0, parts = [];
      ev.items.forEach(function (it) { var a = Number(it && it.amount) || 0; total += a; if (/cọc/i.test(String(it.title || ''))) deposit += a; });
      if (deposit > 0 && amount > 0) parts.push('Trong đó tiền cọc ' + amountForHouse(Math.min(deposit, amount), house) + ' nộp chủ nhà, không tính doanh thu.');
      if (total > 0 && amount < total - 0.005) parts.push('Khách trả thiếu ' + amountForHouse(total - amount, house) + ': phần còn lại vẫn ghi nợ.');
      if (total > 0 && amount > total + 0.005) parts.push('Khách trả dư ' + amountForHouse(amount - total, house) + ': ghi là tiền trả trước, tự trừ vào kỳ sau.');
      return parts.join(' ');
    } catch (e) { return base.apply(this, arguments); }
  };
})();

// Đã sửa xong (tester 17/11): chi phí trên hạn mức luôn cần ảnh hoá đơn, kể cả khi khách trả; ảnh của lần ghi trước
// chỉ dùng lại khi số tiền không đổi (không mượn hoá đơn $20 cũ cho lần sửa $30)
(function () {
  if (typeof openRepairDoneForm !== 'function') return;
  var base = openRepairDoneForm;
  openRepairDoneForm = function (room, id) {
    var r = base.apply(this, arguments);
    try {
      var ovs = document.querySelectorAll('.modal-overlay'), ov = ovs[ovs.length - 1], form = ov && ov.querySelector('form');
      var ev = (readTenantEventsSafe()[room] || []).find(function (x) { return x && x.id === id; }) || {}, house = propertyIdForRoom(room);
      if (form && form.cost && !form.dataset.receiptGuard) {
        form.dataset.receiptGuard = '1';
        form.addEventListener('submit', function (e) {
          var v = form.free && form.free.checked ? 0 : Number(form.cost.value), lim = expenseLimit(house);
          var fresh = form.receiptFile && form.receiptFile.files && form.receiptFile.files.length;
          var oldOk = ev.repairReceipt && Number(ev.repairCost) === v;
          if (v > lim && !fresh && !oldOk) {
            e.preventDefault(); e.stopImmediatePropagation();
            var box = form.querySelector('.user-error'); if (box) { box.textContent = 'Chi phí trên ' + amountForHouse(lim, house) + ' cần ảnh hoá đơn.'; box.hidden = false; }
          }
        }, true);
      }
    } catch (x) {}
    return r;
  };
})();

// Thẻ "Cần anh/chị xác nhận" của khách: việc sửa nhà trả thì bỏ số tiền; việc khách trả ghi rõ khách sẽ trả khoản này
(function () {
  if (typeof window.renderTenantConfirmations !== 'function') return;
  var base = window.renderTenantConfirmations;
  window.renderTenantConfirmations = function () {
    var r = base.apply(this, arguments);
    try {
      var box = document.getElementById('tenantConfirmBox'), room = (document.getElementById('accountSelect').value || '').split('|')[2];
      if (box) box.querySelectorAll('.confirm-item').forEach(function (it) {
        var b = it.querySelector('[data-repair-ok]'), sm = it.querySelector('small'); if (!b || !sm) return;
        var ev = (readTenantEventsSafe()[room] || []).find(function (x) { return x && String(x.id) === b.getAttribute('data-repair-ok'); }); if (!ev) return;
        if (!ev.tenantPays) sm.textContent = sm.textContent.replace(/ · Chi phí [^·]+/, '');
        else if (Number(ev.repairCost) > 0 && sm.textContent.indexOf('anh/chị trả') < 0) sm.textContent = sm.textContent.replace(/ · Chi phí ([^·]+)/, ' · Chi phí $1 · anh/chị trả khoản này');
      });
    } catch (e) {}
    return r;
  };
})();

// Báo có người ở lại (tester 17/11): tiêu đề ghi tên khách ở lại như Lịch sử, dòng dưới ghi ai gửi;
// phòng có quản lý thì chủ nhà chỉ thấy đang chờ quản lý xem (không có nút); bấm "Đã biết" thì có dòng lịch sử ai biết, lúc nào
(function () {
  if (typeof collectWorkItems !== 'function') return;
  var base = collectWorkItems;
  collectWorkItems = function () {
    var items = base.apply(this, arguments), sc; try { sc = workScope(); } catch (e) { return items; }
    try {
      items.forEach(function (it) {
        if (!it || !/ · Báo có người ở lại: /.test(it.title || '') || !it.actions || !it.actions[0] || it.actions[0].label !== 'Đã biết' || it._guestFixed) return;
        it._guestFixed = 1;
        var who = it.title.split(' · Báo có người ở lại: ')[1], bits = String(it.sub || '').split(' · '), guest = bits.shift();
        it.title = it.room + ' · Báo có người ở lại: ' + guest;
        it.sub = [who + ' gửi'].concat(bits).join(' · ');
        var mgr = ''; try { mgr = readRoomManagerAssignments()[it.room] || ''; } catch (e) {}
        if (sc.role === 'owner' && mgr) { it.actions = []; it.sub += ' · Đang chờ quản lý ' + mgr + ' xem'; return; }
        var run = it.actions[0].run, room = it.room;
        it.actions[0].run = function () {
          run.apply(this, arguments);
          try { appendRoomHistory(room, { kind: 'room', title: 'Đã biết người ở lại: ' + guest, detail: who + ' báo', actor: currentActorName(), tenantName: who }); } catch (e) {}
          try { renderManagementOverview(); } catch (e) {}
        };
      });
    } catch (e) {}
    return items;
  };
})();

// Khách huỷ báo người ở lại khi quản lý chưa xem (tester 17/11: báo nhầm không gỡ được)
function cancelGuest(room, id) {
  var list = []; try { list = JSON.parse(localStorage.getItem('homeGuestStays') || '[]') || []; } catch (e) {}
  var g = list.find(function (x) { return x && x.id === id; }); if (!g || g.seenAt || g.cancelledAt) return;
  appConfirm('Huỷ báo người ở lại?', g.guest + ' · từ ' + g.from + ' · ' + g.nights + ' đêm', 'Huỷ báo', function () {
    var l = []; try { l = JSON.parse(localStorage.getItem('homeGuestStays') || '[]') || []; } catch (e) {}
    var x = l.find(function (i) { return i && i.id === id; }); if (!x) return;
    x.cancelledAt = new Date().toLocaleString('vi-VN'); x.cancelledBy = currentActorName();
    localStorage.setItem('homeGuestStays', JSON.stringify(l));
    try { appendRoomHistory(room, { kind: 'room', title: 'Huỷ báo người ở lại: ' + x.guest, detail: 'Từ ' + x.from + ' · ' + x.nights + ' đêm', tenantName: x.tenantName }); } catch (e) {}
    try { refreshTenantScreen('Đã huỷ báo người ở lại.'); } catch (e) {}
  }, true);
}

// Tester 19/11: chuyển phòng (chủ nhà hay quản lý làm) → máy chủ gắn khách chính và người ở cùng vào phòng mới rồi mới gỡ khỏi phòng cũ.
// Trước đây chỉ máy chủ nhà gửi phần này nên quản lý chuyển phòng xong thì khách mất phòng. Việc chưa gửi được thì giữ lại, thử lại sau.
(function () {
  if (typeof transferTenant !== 'function') return;
  var KEY = 'homeTransferLinks', busy = false;
  function readQ() { try { return JSON.parse(localStorage.getItem(KEY) || '[]') || []; } catch (e) { return []; } }
  function saveQ(q) { localStorage.setItem(KEY, JSON.stringify(q)); }
  function uuidOf(p, users) { if (p.uuid) return p.uuid; var u = users.find(function (x) { return x.uuid && (x.key === p.account || x.key === p.key); }); return u && u.uuid; }
  function run() {
    if (busy || !window.HOME_REAL || !window.HOME_DB || !window.HOME_DB.linkTenantRoom) return;
    var q = readQ(); if (!q.length) return;
    busy = true;
    var job = q[0], db = window.HOME_DB;
    var claim = db.claimMyRooms ? db.claimMyRooms() : Promise.resolve({});
    claim.then(function () {
      return job.people.reduce(function (pr, x) {
        return pr.then(function (err) {
          if (err) return err;
          return db.linkTenantRoom(x.id, job.to, x.mate ? { mate: true } : {}).then(function (r) {
            if (r && r.error) return r.error;
            return db.unlinkTenantRoom(x.id, job.from).then(function (u) { return u && u.error ? u.error : ''; });
          });
        });
      }, Promise.resolve(''));
    }).then(function (err) {
      busy = false;
      var now = readQ();
      if (err) { job.tries = (job.tries || 0) + 1; job.error = err; saveQ(now.map(function (j) { return j.id === job.id ? job : j; })); if (job.tries === 1 && typeof toast === 'function') toast('Chưa chuyển được khách sang ' + job.to + ' trên máy chủ, app sẽ thử lại: ' + err); return; }
      saveQ(now.filter(function (j) { return j.id !== job.id; }));
      setTimeout(run, 300);
    }, function () { busy = false; });
  }
  var base = transferTenant;
  transferTenant = function (from, to) {
    var users0 = []; try { users0 = readUsers() || []; } catch (e) {}
    var main = null; try { main = roomTenantUser(from); } catch (e) {}
    var r = base.apply(this, arguments);
    try {
      if (!r && window.HOME_REAL) {
        var users = readUsers() || [], c = (readHomeContracts() || {})[to] || {}, people = [];
        var mid = main && (main.uuid || uuidOf(main, users0));
        if (mid) people.push({ id: mid });
        (c.extraPeople || []).forEach(function (p) { if (!p.account || p.leftAt) return; var id = uuidOf(p, users.concat(users0)); if (id && id !== mid) people.push({ id: id, mate: true }); });
        if (people.length) { var q = readQ(); q.push({ id: 'tl-' + Date.now().toString(36), from: from, to: to, people: people, at: new Date().toLocaleString('vi-VN') }); saveQ(q); setTimeout(run, 1500); }
      }
    } catch (e) {}
    return r;
  };
  setTimeout(run, 5000); setInterval(run, 60000);
})();

// Tester 19/11: khách bấm "Đã nhận đủ tiền cọc" trên app thật thì máy khách không xoá hợp đồng (máy chủ không cho khách sửa hợp đồng,
// cả lần gửi bị từ chối). Máy chủ nhà / quản lý thấy khách đã xác nhận thì xoá hợp đồng của phòng và bỏ quản lý phòng.
(function () {
  if (typeof confirmCheckoutByTenant !== 'function') return;
  var base = confirmCheckoutByTenant;
  confirmCheckoutByTenant = function (room) {
    var me = null; try { me = JSON.parse(localStorage.getItem('homeServerUser') || 'null'); } catch (e) {}
    if (!window.HOME_REAL || !me || me.vai_tro !== 'khach') return base.apply(this, arguments);
    var keep = localStorage.getItem('homeContracts'), had = !!((readCheckouts() || {})[room] || {}).contract;
    var r = base.apply(this, arguments);
    if (keep != null && localStorage.getItem('homeContracts') !== keep) localStorage.setItem('homeContracts', keep);
    // Hợp đồng có ảnh giấy tờ của người khác: máy chủ không cho khách ghi → máy nhân viên chép vào hồ sơ trả phòng
    if (!had) { var all = readCheckouts() || {}; if (all[room] && all[room].contract) { delete all[room].contract; localStorage.setItem('homeCheckouts', JSON.stringify(all)); } }
    return r;
  };
  function same(a, b) { return a && b && (a.number && b.number ? a.number === b.number : a.createdAt === b.createdAt); }
  function finish() {
    if (!window.HOME_REAL) return;
    if (!staffDevice()) return;
    var recs = {}; try { recs = readCheckouts() || {}; } catch (e) { return; }
    var cs = readHomeContracts() || {}, gone = [];
    Object.keys(recs).forEach(function (room) {
      var rec = recs[room], c = cs[room]; if (!rec || rec.status !== 'Đã hoàn cọc' || !c) return;
      if (rec.contract ? !same(c, rec.contract) : (rec.contractClosedAt || String(c.tenantName || '').trim() !== String(rec.tenantName || '').trim())) return;
      try { if (!canManageCheckout(room)) return; } catch (e) { return; }
      if (!rec.contract) { rec.contract = c; rec.contractClosedAt = new Date().toLocaleString('vi-VN'); }
      delete cs[room]; gone.push(room);
    });
    if (!gone.length) return;
    localStorage.setItem('homeCheckouts', JSON.stringify(recs));
    localStorage.setItem('homeContracts', JSON.stringify(cs));
    gone.forEach(function (room) { try { clearRoomTenant(room); } catch (e) {} try { saveRoomManager(room, ''); } catch (e) {} try { markVacatedProfiles(); } catch (e) {} });
    try { renderManagementOverview(); } catch (e) {}
  }
  setTimeout(finish, 4500); setInterval(finish, 30000);
})();

// Tester 19/11: máy chưa kịp tải việc chuyển phòng có thể tạo khoản thu kỳ mới cho phòng cũ (đã trống) đứng tên tài khoản đã chuyển đi.
// Khoản chưa thu, chưa trả phần nào của tài khoản đã chuyển phòng, ở phòng không còn hợp đồng / không còn khách → bỏ.
(function () {
  if (typeof ensureRentCharges !== 'function') return;
  var base = ensureRentCharges;
  ensureRentCharges = function () {
    var r = base.apply(this, arguments);
    try {
      if (!window.HOME_REAL || !staffDevice()) return r;
      var users = readUsers() || [], moved = {}, cs = readHomeContracts() || {};
      users.forEach(function (u) { if (u.movedTo && u.key && !users.some(function (x) { return x !== u && x.key === u.key && !x.movedTo && x.status !== 'Đã xoá'; })) moved[u.key] = 1; });
      var list = readRentCharges(), keep = list.filter(function (c) {
        if (c && c.status === 'Chưa thu' && !(c.parts && c.parts.length) && c.kind !== 'deposit' && typeof roomClosedForCharges === 'function' && roomClosedForCharges(c.room)) {
          var rec = readCheckouts()[c.room], made = parseViTime(c.createdAt) || 0, done = rec && parseViTime(rec.tenantConfirmedAt) || 0;
          if (made && done && made > done) return false; // sinh ra sau khi khách đã nhận hoàn cọc
        }
        return !(c && c.status === 'Chưa thu' && moved[c.tenantKey] && !(c.parts && c.parts.length) && c.kind !== 'deposit' && c.room === String(c.tenantKey).split('|')[2] && !cs[c.room] && !roomTenantUser(c.room));
      });
      if (keep.length !== list.length) saveRentCharges(keep);
    } catch (e) {}
    return r;
  };
})();

// Tester 19/11: máy chủ nhà gỡ quản lý khỏi phòng đã trống sau trả phòng / chuyển phòng (máy quản lý không gỡ được trên máy chủ).
// Sổ thu chi: khoản bồi thường đã huỷ không hiện là "Đã thu $0".
(function () {
  function clearEmpty() {
    if (!window.HOME_REAL || !staffDevice('owner')) return;
    var mgrs = {}, cs = {}, recs = {}, users = [], done = {};
    try { mgrs = readRoomManagerAssignments() || {}; cs = readHomeContracts() || {}; recs = readCheckouts() || {}; users = readUsers() || []; done = JSON.parse(localStorage.getItem('homeEmptyRoomCleared') || '{}') || {}; } catch (e) { return; }
    var changed = false;
    Object.keys(mgrs).forEach(function (room) {
      if (!mgrs[room] || cs[room] || roomTenantUser(room)) return;
      var rec = recs[room], tag = '';
      if (rec && rec.status === 'Đã hoàn cọc' && rec.contractClosedAt) tag = 'co|' + room + '|' + rec.contractClosedAt;
      else { var u = users.filter(function (x) { return x.movedTo && x.room === room && x.deletedAt; }).pop(); if (u) tag = 'mv|' + room + '|' + u.deletedAt; }
      // Anh chốt 21/11: chuyển khách đi thì phòng cũ tự gỡ quản lý. Máy chủ nhà không có bản ghi người dùng cũ (movedTo) → nhận ra qua hợp đồng phòng mới (transferredFrom / stays)
      if (!tag) { var last = 0; Object.keys(cs).forEach(function (r2) { var c2 = cs[r2]; if (!c2 || r2 === room) return; if (c2.transferredFrom === room) last = Math.max(last, parseViTime(c2.transferredAt) || 1); (c2.stays || []).forEach(function (st) { if (st && st.room === room) last = Math.max(last, Number(st.to) || 1); }); }); if (last) tag = 'tr|' + room + '|' + last; }
      if (!tag || (done[tag] && Date.now() - done[tag] > 10 * 60000)) return;
      if (!done[tag]) done[tag] = Date.now();
      changed = true;
      try { saveRoomManager(room, ''); } catch (e) {}
    });
    if (changed) localStorage.setItem('homeEmptyRoomCleared', JSON.stringify(done));
  }
  setTimeout(clearEmpty, 6000); setInterval(clearEmpty, 15000); // kiểm trong máy, nhẹ: 15 giây một lần cho phòng cũ gỡ quản lý sớm (tester 21/11)
  if (typeof collectFinanceItems === 'function') {
    var base = collectFinanceItems;
    collectFinanceItems = function () {
      var items = base.apply(this, arguments);
      try {
        var gone = {}; readRentCharges().forEach(function (c) { if (c && c.status === 'Đã huỷ') gone[c.room + ' · ' + c.title] = 1; });
        items = items.filter(function (it) { return !(it && it.kind === 'income' && gone[it.title] && !(Number(it.amount) > 0.005)); });
      } catch (e) {}
      return items;
    };
  }
})();

// Máy nhân viên: tính lại khoản thu định kỳ (trả lại tiền trả trước lúc trả phòng, dọn khoản sinh nhầm) dù không mở trang nào
(function () {
  setInterval(function () { try { if (window.HOME_REAL && staffDevice() && !document.querySelector('.modal-overlay')) ensureRentCharges(); } catch (e) {} }, 45000);
})();

// Tester 19/11: ô phòng (Phòng, Tổng quan) chỉ đọc trạng thái lúc mở app; máy khác chuyển phòng / trả phòng thì vẽ lại theo dữ liệu vừa tải
window.syncRoomCards = function () {
  var st = {}; try { st = JSON.parse(localStorage.getItem('homeRoomStatuses') || '{}') || {}; } catch (e) { return; }
  var touched = false;
  Object.keys(st).forEach(function (room) {
    var s = st[room], card = s && s.status && cardForRoom(room); if (!card) return;
    var badge = card.querySelector('.badge');
    if (badge && badge.innerText.trim() !== s.status) {
      badge.innerText = s.status;
      badge.style.color = s.status === 'Sửa chữa' ? '#b83d39' : s.status === 'Trống' ? '#bd6d23' : '';
      badge.style.background = s.status === 'Sửa chữa' ? '#fae9e7' : s.status === 'Trống' ? '#fbefe1' : '';
      touched = true;
    }
    var sub = card.querySelector('.roomsub');
    if (sub && s.tenantName && sub.innerText.trim() !== s.tenantName) { sub.innerText = s.tenantName; touched = true; }
  });
  if (touched) try { updateRoomCounts(); } catch (e) {}
};

// Tester 19/11: khách đã trả phòng xong (hợp đồng đã đóng, không chuyển hợp đồng cho người ở cùng) mà tiền trả trước còn số:
// số đó đã trả lại cùng tiền hoàn cọc → ghi về 0. Tự làm lại tới khi máy chủ có số 0 (trước đây đánh dấu xong rồi số không lên máy chủ thì kẹt).
(function () {
  function heal() {
    if (!window.HOME_REAL || !staffDevice() || document.querySelector('.modal-overlay')) return;
    var recs = {}, cr = {}, cs = {}; try { recs = readCheckouts() || {}; cr = readTenantCredits() || {}; cs = readHomeContracts() || {}; } catch (e) { return; }
    var dirty = false;
    Object.keys(recs).forEach(function (room) {
      var r = recs[room]; if (!r || r.status !== 'Đã hoàn cọc' || !(r.prepaidRefund > 0) || !r.contractClosedAt || (r.household && r.household.mode === 'transfer')) return;
      var c = cs[room]; if (c && String(c.tenantName || '').trim() === String(r.tenantName || '').trim()) return; // hợp đồng chưa đóng
      [checkoutCreditKey(r), r.tenantKey].forEach(function (k) {
        if (!k || !(Number(cr[k]) > 0.005)) return;
        var kc = cs[String(k).split('|')[2]]; if (kc && String(kc.tenantName || '').trim() === String(k).split('|')[1].trim()) return; // vẫn đang thuê (thuê lại)
        cr[k] = 0; dirty = true;
      });
    });
    if (dirty) localStorage.setItem('homeTenantCredits', JSON.stringify(cr));
  }
  setTimeout(heal, 8000); setInterval(heal, 45000);
})();

// Tester 20/11: chuyển sang phòng cọc thấp hơn → người làm chuyển phòng có việc "trả khách cọc dư" (nút Đã trả); chủ nhà thấy dòng chờ.
// Quỹ / Sổ chỉ trừ khoản này khi đã bấm Đã trả; bấm xong khách thấy dòng trong lịch sử của mình.
(function () {
  if (typeof collectWorkItems !== 'function') return;
  var base = collectWorkItems;
  collectWorkItems = function () {
    var items = base.apply(this, arguments);
    try {
      var sc = workScope(); if (!sc || (sc.role !== 'owner' && sc.role !== 'manager')) return items;
      var owner = ownerName();
      readRentCharges().forEach(function (c) {
        var t = c && c.transferRefund; if (!t || c.kind !== 'deposit' || !(Number(t.amount) > 0) || t.paidAt) return;
        if (!sc.houseOk(c.house) || (sc.roomOk && !sc.roomOk(c.room))) return;
        var who = t.by || owner, mine = who === sc.name || (sc.role === 'owner' && who === owner), amt = amountForHouse(t.amount, c.house);
        var title = c.room + ': trả khách ' + (c.tenantName || '') + ' ' + amt + ' cọc dư khi chuyển phòng', target = { type: 'room', room: c.room };
        if (mine) items.push({ type: 'payment', house: c.house, room: c.room, title: title, sub: (t.from || '') + ' → ' + (t.to || c.room) + ' · cọc phòng mới thấp hơn · bấm sau khi đã trả', time: parseViTime(t.at), target: target,
          actions: [{ label: 'Đã trả', run: function () {
            appConfirm('Đã trả khách cọc dư?', 'Bấm sau khi đã đưa tiền cho ' + (c.tenantName || 'khách') + '.', 'Đã trả', function () {
              var list = readRentCharges(), x = list.find(function (y) { return y.id === c.id; }); if (!x || !x.transferRefund || x.transferRefund.paidAt) return;
              x.transferRefund.paidAt = new Date().toLocaleString('vi-VN'); x.transferRefund.paidBy = currentActorName(); saveRentCharges(list);
              appendRoomHistory(c.room, { id: 'transfer-refund-' + c.id, kind: 'charge', title: 'Trả lại khách ' + amt + ' cọc dư khi chuyển phòng', detail: 'Số tiền ' + amt + ' · ' + (t.from || '') + ' → ' + (t.to || c.room) + ' · ' + (c.tenantName || ''), actor: currentActorName(), amount: Number(t.amount), refund: true, tenantName: c.tenantName || '' });
              try { renderManagementOverview(); } catch (e) {}
            }, false, { big: amt, sub: 'Trả ' + (c.tenantName || 'khách'), rows: [['Chuyển', (t.from || '') + ' → ' + (t.to || c.room)], ['Cọc dư', amt]] });
          } }] });
        else if (sc.role === 'owner') items.push({ type: 'payment', house: c.house, room: c.room, title: c.room + ': chờ ' + who + ' trả khách ' + amt + ' cọc dư', sub: (c.tenantName || '') + ' · ' + (t.from || '') + ' → ' + (t.to || c.room), time: parseViTime(t.at), actions: [], target: target });
      });
    } catch (e) {}
    return items;
  };
})();

// Tester 20/11: chốt tháng chia theo phòng sai sau khi chuyển phòng (phòng cũ 0 ngày, phòng mới tính từ ngày ký hợp đồng gốc).
// Mỗi lần chuyển, hợp đồng ghi lại chặng đã ở (stays: phòng, từ, đến) và mốc vào phòng hiện tại (stayFrom); số ngày ở của phòng tính theo các chặng.
(function () {
  if (typeof transferTenant !== 'function' || typeof roomOccupiedDays !== 'function') return;
  var DAY = 86400000;
  function d0(t) { return new Date(t).setHours(0, 0, 0, 0); }
  var baseT = transferTenant;
  transferTenant = function (from, to, date) {
    var before = null; try { before = JSON.parse(JSON.stringify(getHomeContract(from) || null)); } catch (e) {}
    var res = baseT.apply(this, arguments);
    try {
      if (res || !before) return res;
      var all = readHomeContracts(), c = all[to]; if (!c) return res;
      var start = Number(before.stayFrom) || parseViTime(before.startDate) || parseViTime(before.createdAt) || 0, at = Number(date) || Date.now();
      if (d0(at) === d0(Date.now())) at = Date.now();
      c.stays = (before.stays || []).concat([{ room: from, from: start, to: at }]);
      c.stayFrom = at;
      localStorage.setItem('homeContracts', JSON.stringify(all));
      // Tester 20/11: máy khách chỉ tải lịch sử phòng đang ở → chép các dòng của khách (và người ở cùng) ở phòng cũ sang phòng mới, ghi tên phòng cũ.
      try {
        var evAll = JSON.parse(localStorage.getItem('homeTenantEvents') || '{}'), src = evAll[from] || [], dst = evAll[to] || [], names = [before.tenantName].concat((before.extraPeople || []).map(function (p) { return p && p.name; })).filter(Boolean).map(function (n) { return String(n).trim(); });
        var have = {}; dst.forEach(function (e) { if (e && e.id) have[e.id] = 1; if (e && e.origId) have[e.origId] = 1; });
        var tsOf = function (i) { var v = (/^\d{13}/.test(String(i.id || '')) ? Number(String(i.id).slice(0, 13)) : 0) || Math.min.apply(null, [i.createdAt, i.at, i.time].map(function (x) { return parseViTime(x) || Infinity; })); return Number.isFinite(v) ? v : 0; };
        var hStart = Number(before.stayFrom) || Math.min(parseViTime(before.createdAt) || Infinity, parseViTime(before.startDate) || Infinity, start || Infinity); if (!Number.isFinite(hStart)) hStart = 0;
        var add = [];
        src.forEach(function (e, n) {
          if (!e || e.origRoom === to || have[e.origId || e.id]) return;
          if (/notice|announce/i.test(String(e.kind || ''))) return;
          if (!e.mateMove && /chuyển (từ|sang) phòng/.test(String(e.title || ''))) return; // dòng chuyển phòng của khách chính đã có ở phòng mới; dòng của người ở cùng thì chép (không thêm tên phòng)
          var ts = e.origTs || tsOf(e); if (ts && (ts < hStart - 1000 || ts > at - 3000)) return; if (!ts) return;
          add.push(Object.assign({}, e, { id: String(ts) + '-moved-' + to + '-' + n, origId: e.origId || e.id, origRoom: e.origRoom || from, origTs: ts, kind: e.kind === 'charge' || e.kind === 'contract' ? e.kind : 'moved', origKind: e.origKind || e.kind, status: e.kind === 'household' ? '' : e.status, title: String(e.title || '') + (e.origRoom || e.mateMove ? '' : ' (' + from + ')') }));
        });
        if (add.length) { evAll[to] = dst.concat(add); localStorage.setItem('homeTenantEvents', JSON.stringify(evAll)); }
      } catch (e) {}
      // Anh chốt 21/11: người ở cùng cũng có dòng chuyển phòng trong lịch sử của mình
      try {
        (before.extraPeople || []).forEach(function (p) {
          var nm = p && !p.leftAt && String(p.names || p.name || '').trim(); if (!nm) return;
          appendRoomHistory(to, { id: 'mate-move-' + to + '-' + at + '-' + nm, kind: 'contract', title: nm + ' chuyển từ phòng ' + from, detail: 'Cùng ' + (before.tenantName || '') + ' · từ ' + new Date(at).toLocaleDateString('vi-VN'), actor: currentActorName(), tenantName: nm, mateMove: true });
        });
      } catch (e) {}
    } catch (e) {}
    return res;
  };
  var baseO = roomOccupiedDays;
  roomOccupiedDays = function (room, month) {
    var r = baseO.apply(this, arguments);
    try {
      var p = month.split('-').map(Number), total = new Date(p[0], p[1], 0).getDate(), first = new Date(p[0], p[1] - 1, 1).getTime(), last = new Date(p[0], p[1] - 1, total).getTime();
      var code = room.code, cks = readCheckouts(), contracts = Object.values(readHomeContracts()).concat(Object.values(cks).map(function (x) { return x && x.contract; })).filter(Boolean);
      var mine = getHomeContract(code) || (cks[code] && cks[code].contract), touched = contracts.some(function (c) { return (c.stays || []).some(function (s) { return s.room === code; }); });
      if (!touched && !(mine && mine.stayFrom)) return r;
      var days = 0, span = function (s, e) { s = Math.max(d0(s), first); e = Math.min(d0(e), last); return e < s ? 0 : Math.floor((e - s) / DAY) + 1; };
      if (mine && mine.stayFrom) {
        var ck = cks[code], left = ck && ck.status === 'Đã hoàn cọc' ? parseViTime(ck.tenantConfirmedAt) : 0;
        days += room.status === 'Đang thuê' ? span(mine.stayFrom, last) : left ? span(mine.stayFrom, left) : 0;
      } else days += r.days || 0;
      var seen = {};
      contracts.forEach(function (c) { (c.stays || []).forEach(function (s) {
        var k = [s.room, s.from, s.to].join('|'); if (seen[k] || s.room !== code) return; seen[k] = 1;
        if (d0(s.to) > d0(s.from)) days += span(s.from, d0(s.to) - DAY);
      }); });
      return { days: Math.min(days, total), total: total };
    } catch (e) { return r; }
  };
})();

// Tester 19–20/11: khoản "Tiền cọc bổ sung khi chuyển sang …" chưa thu không có dòng trong Sổ, Chờ thu ghi $0.
// Thêm dòng Chưa thu (nút Đã thu) tới khi khách báo đã chuyển (lúc đó dòng khách báo thay thế, không đếm trùng).
(function () {
  if (typeof collectFinanceItems !== 'function') return;
  var base = collectFinanceItems;
  collectFinanceItems = function () {
    var items = base.apply(this, arguments);
    try {
      var sc = workScope(), pid = readProperty().id || 'HOME-001', ev = readTenantEventsSafe();
      readRentCharges().forEach(function (c) {
        if (c.house !== pid || c.kind !== 'deposit' || c.status !== 'Chưa thu' || !/^Tiền cọc bổ sung/.test(c.title || '') || !(Number(c.amount) > 0) || !sc.roomOk(c.room)) return;
        if ((ev[c.room] || []).some(function (e) { return e && e.kind === 'payment' && (!e.status || e.status === 'Chờ xử lý'); })) return;
        if (items.some(function (it) { return it && it.chargeId === c.id; })) return;
        items.push({ kind: 'income', chargeId: c.id, house: pid, room: c.room, title: c.room + ' · ' + c.title, sub: ['Chưa thu · hạn ' + viDate(c.due), c.tenantName, 'không tính doanh thu'].join(' · '), amount: Number(c.amount), done: false, pending: true, time: c.due,
          actions: [{ label: 'Đã thu', run: function () { askChargePaid(c.id); } }], target: { type: 'room', room: c.room } });
      });
    } catch (e) {}
    return items;
  };
})();

// Tester 20/11: phòng có chuyển (hợp đồng có stays) thì các dòng phòng cũ đã được chép sang phòng hiện tại lúc chuyển, không lấy thêm (tránh trùng).
(function () {
  if (typeof priorRoomEvents !== 'function') return;
  var base = priorRoomEvents;
  priorRoomEvents = function (room, name, depth) {
    try { var c = getHomeContract(room); if (!depth && c && (c.stays || []).length) return []; } catch (e) {}
    return base.apply(this, arguments);
  };
})();

// Tester 20/11: máy vừa mở (bộ nhớ trống) chạy tự tạo khoản thu khi mới có phòng + người dùng mà chưa có hợp đồng / khoản thu
// → sinh "Tiền thuê tháng 11" theo giá niêm yết, trùng khoản đã thu. Chưa tải đủ dữ liệu một lần thì không tự tạo gì.
(function () {
  if (typeof ensureRentCharges !== 'function') return;
  function ready() {
    if (!window.HOME_REAL || window.__homeDataPulled) return true;
    try {
      var me = JSON.parse(localStorage.getItem('homeServerUser') || 'null'), id = me && String(me.id).slice(0, 8);
      // vừa đăng nhập: trang đăng nhập đã tải đủ rồi mới mở lại
      return !!(id && sessionStorage.getItem('homeRealReloadAt') && localStorage.getItem('real:' + id + ':homeContracts') != null && localStorage.getItem('real:' + id + ':homeRentCharges') != null);
    } catch (e) { return false; }
  }
  var base = ensureRentCharges;
  ensureRentCharges = function () {
    if (!ready()) { try { return readRentCharges(); } catch (e) { return []; } }
    if (!window.HOME_REAL) return base.apply(this, arguments);
    // Tester 21/11: ngay sau chuyển phòng, máy chủ nhà có lúc còn thấy phòng cũ "Đang thuê" mà hợp đồng đã chuyển đi → sinh khoản theo giá niêm yết.
    // Dữ liệu thật: không có hợp đồng thì không tự tạo khoản thu.
    var had = {}; try { readRentCharges().forEach(function (c) { if (c && c.id) had[c.id] = 1; }); } catch (e) {}
    var r = base.apply(this, arguments);
    try {
      var list = readRentCharges(), nm = function (c) { return String(c && (c.tenantName || String(c.tenantKey || '').split('|')[1]) || '').trim().toLowerCase(); };
      // Tester 21/11: máy mới đăng nhập sau nhiều lần chuyển phòng tạo thêm "Tiền thuê tháng 11" ở phòng mới dù tháng 11 đã có khoản (ở phòng cũ, đã thu).
      // Khoản tiền thuê / cọc vừa sinh mà cùng khách đã có khoản cùng loại, cùng kỳ (ở bất kỳ phòng nào) → bỏ.
      // Tester 21/11: máy chủ nhà tải giữa lúc máy quản lý đang gửi việc chuyển phòng (hợp đồng phòng cũ chưa gỡ, hợp đồng phòng mới đã có) → khoản cho phòng cũ. Khách đã có hợp đồng ở phòng khác chuyển từ phòng này → bỏ.
      var csAll = readHomeContracts() || {}, movedAway = function (c) { return Object.keys(csAll).some(function (r2) { var x = csAll[r2]; return r2 !== c.room && x && x.transferredFrom === c.room && String(x.tenantName || '').trim().toLowerCase() === nm(c); }); };
      var dupOf = function (c) { return list.some(function (x) { return x && x !== c && had[x.id] && x.status !== 'Đã huỷ' && x.kind === c.kind && !x.extra && nm(x) === nm(c) && (c.kind === 'deposit' ? !/bổ sung/i.test(String(x.title || '')) : x.period === c.period); }); };
      var keep = list.filter(function (c) { if (!c || had[c.id] || c.status !== 'Chưa thu' || (c.parts && c.parts.length)) return true; if (!getHomeContract(c.room)) return false; if (movedAway(c)) return false; var hc = getHomeContract(c.room) || {}; if ((hc.transferredFrom || (hc.stays || []).length) && (c.kind === 'rent' || c.kind === 'deposit') && !c.extra && dupOf(c)) return false; /* chỉ với hợp đồng đã chuyển phòng */ return true; });
      if (keep.length !== list.length) { saveRentCharges(keep); return keep; }
    } catch (e) {}
    return r;
  };
})();
