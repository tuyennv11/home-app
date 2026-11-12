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
    window.HOME_DB.saveAccount({ phoneKey: phoneKey(phone, '84'), name: user.name, role: vaiTro, password: pw }).then(function (r) {
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
    try { if (Date.now() - (Number(sessionStorage.getItem('homeRealReloadAt')) || 0) < 20000) return; } catch (e) {}
    var snapshot = function () { return ['homeRealHouses', 'homeRealRooms', 'homeUsers', 'homePropertyManagers', 'homeRoomManagers'].map(function (k) { return localStorage.getItem(k) || ''; }).join('|'); };
    var before = snapshot();
    window.HOME_DB.pullAll().then(function (p) {
      if (p.error) return;
      if (snapshot() === before && !p.changed) return;
      // Chỉ mở lại khi đã qua 1 phút kể từ lần trước, không để app tự tải lại liên tục
      var last = 0; try { last = Number(sessionStorage.getItem('homeRealReloadAt')) || 0; } catch (e) {}
      if (document.querySelector('.modal-overlay')) return;
      if (Date.now() - last < 60000) {
        // Vừa mở lại chưa tới 1 phút: không tải lại trang, chỉ vẽ lại với dữ liệu mới, giữ đúng trang đang xem
        var sel = document.getElementById('accountSelect'), page = (document.querySelector('.subpage.active') || {}).id, y = window.scrollY;
        try { if (sel && typeof window.setAccount === 'function') window.setAccount(sel.value); if (page && (document.querySelector('.subpage.active') || {}).id !== page) window.go(page); window.scrollTo(0, y); } catch (e) {}
        return;
      }
      try { sessionStorage.setItem('homeRealReloadAt', String(Date.now())); } catch (e) {}
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
    var dep = first.filter(function (x) { return x.kind === 'deposit'; })[0];
    if (signed && (!moved || dep)) {
      var step = function (done, now, title, sub, btn) {
        return '<div class="todo-step' + (done ? ' done' : now ? ' now' : '') + '"><span class="todo-dot">' + (done ? '✓' : '') + '</span><div><strong>' + title + '</strong>' + (sub ? '<small>' + sub + '</small>' : '') + '</div>' + (btn || '') + '</div>';
      };
      // Khách trả trước khi nhận phòng, quản lý đã xác nhận: bước đóng cọc tính xong (anh chốt 12/11)
      var paidEv = !moved && !dep ? ((get('homeTenantEvents', {})[room]) || []).filter(function (e) { return e && e.kind === 'payment' && e.status === 'Đã xác nhận' && (!e.tenantName || e.tenantName === name); }) : [];
      var prepaid = paidEv.length ? (function () { var sum = paidEv.reduce(function (a, e) { return a + (Number(e.amount) || 0); }, 0); try { return amountForHouse(sum, propertyIdForRoom(room)); } catch (x) { return String(sum); } })() : '';
      var reported = dep && (dep.status === 'Đã báo thanh toán' || Array.prototype.some.call(portal.querySelectorAll('.tenant-actions button'), function (x) { return /^Đã báo thanh toán/.test(x.textContent.trim()); }));
      html = '<div class="todo-head">Việc cần làm</div>' +
        step(true, false, 'Ký hợp đồng', esc(c.number)) +
        step(moved, !moved, 'Nhận phòng', moved ? '' : pendingHand ? 'Quản lý đã gửi biên bản giao phòng' : 'Quản lý sẽ hẹn ngày giao phòng',
          pendingHand ? '<button type="button" class="todo-btn" data-todo="hand" data-id="' + esc(pendingHand.id) + '">Xem và xác nhận</button>' : '') +
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
    vi: ['1. Bên cho thuê giao phòng {phong} cho {khach} sử dụng để ở, thời hạn {thoi_han}.', '2. Tiền thuê {tien_thue}/tháng, đóng {han_dong}. Điện nước: {dien_nuoc}.', '3. Tiền cọc {coc}, hoàn lại khi trả phòng sau khi trừ tiền còn nợ và hư hỏng do người thuê gây ra (nếu có).', '4. Người thuê giữ gìn phòng và tài sản theo biên bản giao phòng; hư hỏng do người thuê gây ra thì người thuê chịu chi phí sửa.', '5. Không tự ý sửa chữa, cải tạo, cho người khác thuê lại; có người ở lại qua đêm thì báo trong app.', '6. Đóng tiền trễ quá 7 ngày, bên cho thuê được nhắc và tính phí theo thoả thuận của căn.', '7. Muốn trả phòng trước hạn, báo trước ít nhất 30 ngày; trả phòng trước hạn không báo có thể mất cọc.', '8. Hai bên xác nhận hợp đồng bằng cách ký trong app Home♡.'],
    en: ['1. The landlord lets room {phong} to {khach} for living, for the term {thoi_han}.', '2. Rent {tien_thue}/month, due {han_dong}. Utilities: {dien_nuoc}.', '3. Deposit {coc}, refunded at move-out after deducting any unpaid amounts and damage caused by the tenant.', '4. The tenant takes care of the room and items listed in the handover record and pays for damage they cause.', '5. No repairs, alterations or subletting without permission; report overnight guests in the app.', '6. If payment is more than 7 days late, the landlord may send reminders and charge fees as agreed for the house.', '7. To leave before the end date, give at least 30 days notice; leaving early without notice may forfeit the deposit.', '8. Both parties confirm this contract by signing in the Home♡ app.'],
    km: ['1. ម្ចាស់ផ្ទះប្រគល់បន្ទប់ {phong} ឱ្យ {khach} ស្នាក់នៅ រយៈពេល {thoi_han}។', '2. ថ្លៃជួល {tien_thue}/ខែ បង់ {han_dong}។ ទឹកភ្លើង៖ {dien_nuoc}។', '3. ប្រាក់កក់ {coc} នឹងប្រគល់វិញពេលចេញ ក្រោយកាត់ប្រាក់ជំពាក់ និងការខូចខាតដោយអ្នកជួល (ប្រសិនបើមាន)។', '4. អ្នកជួលថែរក្សាបន្ទប់ និងទ្រព្យតាមកំណត់ត្រាប្រគល់ ហើយចេញថ្លៃជួសជុលការខូចខាតដែលខ្លួនបង្ក។', '5. មិនត្រូវជួសជុល កែប្រែ ឬជួលបន្តដោយគ្មានការអនុញ្ញាត។ មានភ្ញៀវស្នាក់យប់ សូមរាយការណ៍ក្នុងកម្មវិធី។', '6. បង់យឺតលើស 7 ថ្ងៃ ម្ចាស់ផ្ទះអាចរំលឹក និងគិតថ្លៃតាមការព្រមព្រៀងរបស់ផ្ទះ។', '7. ចង់ចេញមុនកំណត់ ត្រូវជូនដំណឹងយ៉ាងហោចណាស់ 30 ថ្ងៃ។ ចេញមុនដោយមិនជូនដំណឹងអាចបាត់ប្រាក់កក់។', '8. ភាគីទាំងពីរបញ្ជាក់កិច្ចសន្យានេះដោយចុះហត្ថលេខាក្នុងកម្មវិធី Home♡។']
  };
  function lang() { try { var l = localStorage.getItem('homeLang'); return l === 'en' || l === 'km' ? l : 'vi'; } catch (e) { return 'vi'; } }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function role() { var s = document.getElementById('accountSelect'); return s ? String(s.value).split('|')[0] : ''; }
  function me() { var s = document.getElementById('accountSelect'); return s ? String(s.value).split('|')[1] || '' : ''; }
  function settings(id) { try { return (typeof houseSettings === 'function' ? houseSettings(id) : {}) || {}; } catch (e) { return {}; } }
  function houseOf(room) { try { return typeof propertyIdForRoom === 'function' ? propertyIdForRoom(room) : ''; } catch (e) { return ''; } }
  function houseName(id) { try { return ((readProperties() || []).find(function (h) { return h.id === id; }) || {}).name || ''; } catch (e) { return ''; } }
  window.contractTermsTemplate = function (house) { var own = settings(house).contractTerms; return own && String(own).trim() ? String(own) : DEFAULT[lang()].join('\n'); };
  function fill(text, room, c) {
    var m = function (v) { try { return money(Number(v) || 0); } catch (e) { return String(v || ''); } };
    var L = lang(), W = { vi: ['điện', 'nước', 'theo đồng hồ', 'cố định', '/tháng', 'chưa nhập giá'], en: ['electricity', 'water', 'metered', 'flat', '/month', 'price not set'], km: ['ភ្លើង', 'ទឹក', 'តាមកុងទ័រ', 'ថេរ', '/ខែ', 'មិនទាន់កំណត់តម្លៃ'] }[L], u = '';
    try {
      var b = c.utilityBilling || getUtilityBillingForRoom(room);
      u = ['electricity', 'water'].map(function (sv, i) {
        var it = (b && b[sv]) || {}, fixed = it.method === 'fixed', v = fixed ? it.fixedMonthly : it.unitRate;
        return W[i] + ' ' + (v == null ? W[5] : fixed ? W[3] + ' ' + m(v) + W[4] : W[2] + ' ' + m(v) + (sv === 'electricity' ? '/kWh' : '/m³'));
      }).join(', ');
    } catch (e) {}
    var d = (String(c.dueDay || '').match(/\d+/) || [])[0], due = d ? { vi: 'ngày ' + d + ' hằng tháng', en: 'on day ' + d + ' of each month', km: 'ថ្ងៃទី ' + d + ' រៀងរាល់ខែ' }[L] : String(c.dueDay || '');
    var map = { phong: room, khach: c.tenantName || '', thoi_han: c.term || '', tien_thue: m(c.rent), coc: m(c.deposit), han_dong: due, dien_nuoc: u };
    return String(text).replace(/\{(\w+)\}/g, function (all, k) { return k in map ? map[k] : all; });
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
          var text = c.termsText || fill(window.contractTermsTemplate(houseOf(room)), room, c);
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
        if (text && all[room] && all[room].status === 'Đã ký' && !all[room].termsText) { all[room].termsText = text.trim(); localStorage.setItem('homeContracts', JSON.stringify(all)); }
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
    var o = document.createElement('div');
    o.className = 'modal-overlay';
    o.innerHTML = '<div class="modal-sheet"><div class="modal-head">Điều khoản hợp đồng</div><small class="note">{phong} {khach} {thoi_han} {tien_thue} {coc} {han_dong} {dien_nuoc}: app tự điền khi khách xem.</small><textarea rows="14" class="terms-edit" translate="no"></textarea><div class="modal-actions"><button type="button" class="save" data-terms-save>Lưu</button><button type="button" data-terms-reset>Mẫu sẵn</button><button type="button" data-terms-close>Huỷ</button></div></div>';
    o.querySelector('textarea').value = window.contractTermsTemplate(id);
    (document.querySelector('.phone') || document.body).appendChild(o);
    o.addEventListener('click', function (e) {
      if (e.target.closest('[data-terms-close]')) o.remove();
      else if (e.target.closest('[data-terms-reset]')) o.querySelector('textarea').value = DEFAULT[lang()].join('\n');
      else if (e.target.closest('[data-terms-save]')) {
        var v = o.querySelector('textarea').value.trim(), old = settings(id).contractTerms || '';
        var same = v === DEFAULT[lang()].join('\n') ? '' : v;
        if (same !== old) { saveHouseSettings(id, { contractTerms: same }); logChange(id, ['Điều khoản hợp đồng']); }
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
          var choice = form.querySelector('[name=propertyChoice]'), id = function () { return choice && choice.value || ''; };
          var before = id() ? snap(id()) : null;
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

// Tên chào ở đầu màn (cạnh nút ngôn ngữ + Thông báo): dài quá thì thu chữ nhỏ dần (tới 15px) cho đủ tên rồi mới cắt
(function () {
  var queued = false;
  function fit() {
    queued = false;
    document.querySelectorAll('.head .title').forEach(function (t) {
      if (!t.offsetParent) return;
      t.style.fontSize = '';
      var size = parseFloat(getComputedStyle(t).fontSize);
      while (t.scrollWidth > t.clientWidth && size > 15) { size -= 0.5; t.style.fontSize = size + 'px'; }
    });
  }
  function queue() { if (!queued) { queued = true; requestAnimationFrame(fit); } }
  new MutationObserver(queue).observe(document.body, { childList: true, subtree: true, characterData: true });
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
    o.innerHTML = '<form class="modal-sheet" novalidate><div class="modal-head">' + (again ? 'Hẹn lại ngày sửa' : 'Tiếp nhận sửa chữa') + '</div>' +
      '<div class="user-info-row"><span>Phòng</span><strong>' + esc(room) + '</strong></div>' +
      '<div class="user-info-row"><span>Món hư</span><strong>' + esc(assetOf(ev)) + '</strong></div>' +
      '<div class="user-info-row"><span>Khách báo</span><strong>' + esc((ev.tenantName || '') + (ev.date ? ' · ' + ev.date : '')) + '</strong></div>' +
      '<div class="user-info-row"><span>Mô tả</span><strong>' + esc(String(ev.detail || '').split(' · ')[0]) + '</strong></div>' +
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
      if (!again) baseAck(room, id);
      var label = '';
      updateTenantEvent(room, id, function (x) {
        label = assetOf(x);
        if (!again) x.acceptedAt = now;
        x.acceptedBy = x.acceptedBy || who;
        x.repairDate = day; x.repairPlanNote = note || undefined;
        x.detail = String(x.detail || '').replace(/ · hẹn sửa [^·]*/g, '') + ' · hẹn sửa ' + viDate(day) + (note ? ' (' + note + ')' : '');
      });
      appendRoomHistory(room, { kind: 'repair-note', title: (again ? 'Hẹn lại ngày sửa: ' : 'Tiếp nhận sửa: ') + label + ' · hẹn ' + viDate(day) + ' · ' + who, detail: note, status: 'Đã tiếp nhận', actor: who });
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
      var name = String(it.title || '').split(' · ').slice(1).join(' · ');
      var ev = ((readTenantEventsSafe()[it.room]) || []).find(function (e) { return e.kind === 'repair' && e.status === 'Đã tiếp nhận' && String(e.title || '').replace(/^Đã báo hư hỏng:\s*/, '') === name; });
      if (!ev) return;
      var late = ev.repairDate ? Math.round((dayStart() - dayStart(ev.repairDate)) / DAY) : 0;
      var plan = ev.repairDate ? 'hẹn sửa ' + viDate(ev.repairDate) + (late > 0 ? ' · quá hẹn ' + late + ' ngày' : late === 0 ? ' · hôm nay' : '') : 'chưa hẹn ngày sửa';
      if (late > 0) it.urgent = true;
      var mine = !ev.acceptedBy || ev.acceptedBy === scope.name || scope.role !== 'owner' || ev.acceptedBy === ownerName();
      if (!mine) {
        it.sub = [ev.acceptedBy + ' đang sửa', plan, ev.tenantRejectReason ? 'khách báo chưa xong: ' + ev.tenantRejectReason : ''].filter(Boolean).join(' · ');
        it.actions = [];
        return;
      }
      it.sub = [ev.tenantName, (ev.acceptedBy ? ev.acceptedBy + ' tiếp nhận' : 'Đã tiếp nhận'), plan, ev.tenantRejectReason ? 'khách báo chưa xong: ' + ev.tenantRejectReason : ''].filter(Boolean).join(' · ');
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
  function row(dot, title, sub, btn, fn, extra) {
    var id = fn ? on(fn) : -1;
    return '<div class="work-row th-row' + (extra && extra.urgent ? ' urgent' : '') + '"' + (id >= 0 && !btn ? ' data-th="' + id + '" role="button" tabindex="0"' : '') + '><span class="work-dot dot-' + dot + '"></span><span class="work-main"><span class="work-title">' + esc(title) + '</span>' + (sub ? '<span class="work-sub">' + esc(sub) + '</span>' : '') + '</span>' +
      (extra && extra.amount ? '<span class="th-amount">' + esc(extra.amount) + '</span>' : '') +
      (btn ? '<button type="button" class="work-action" data-th="' + id + '">' + esc(btn) + '</button>' : (id >= 0 ? '<span class="work-chevron">›</span>' : '')) + '</div>';
  }
  // Mở một thẻ cũ trong bảng (giữ nguyên nút và sự kiện của thẻ), đóng thì trả thẻ về chỗ cũ
  function sheet(el, title) {
    if (!el) return;
    var home = el.parentNode, next = el.nextSibling, o = document.createElement('div');
    o.className = 'modal-overlay';
    o.innerHTML = '<div class="modal-sheet th-sheet">' + (title ? '<div class="modal-head">' + esc(title) + '</div>' : '') + '<div class="th-sheet-body"></div><div class="modal-actions"><button type="button" data-th-close>Đóng</button></div></div>';
    o.querySelector('.th-sheet-body').appendChild(el);
    el.classList.add('th-in-sheet');
    function close() { el.classList.remove('th-in-sheet'); if (home && home.isConnected) home.insertBefore(el, next && next.parentNode === home ? next : null); o.remove(); }
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
  function short(d) { var m = String(d || '').match(/(\d{1,2})\/(\d{1,2})\/\d{4}/); return m ? m[1].padStart(2, '0') + '/' + m[2].padStart(2, '0') : String(d || ''); }
  function render() {
    var portal = document.getElementById('tenantPortal'), sel = document.getElementById('accountSelect');
    if (!portal || !sel) return;
    var acct = String(sel.value || '').split('|');
    var box = document.getElementById('tenantHome2');
    if (acct[0] !== 'tenant') { if (box) box.remove(); portal.classList.remove('th2'); return; }
    var room = acct[2], c = null; try { c = getHomeContract(room); } catch (e) {}
    handlers = [];
    // Người ở cùng đã được ghi dọn đi (hoặc hợp đồng phòng đã lập cho khách khác): không còn xem được phòng
    if (window.__tenantLeft && !c) {
      var gone = '<div class="work-section th-section"><div class="work-empty">Anh/chị không còn ở phòng ' + esc(room) + '. Lịch sử thuê vẫn được giữ. Muốn xoá tài khoản thì bấm vào logo ở góc trái.</div></div>';
      if (!box) { box = document.createElement('div'); box.id = 'tenantHome2'; (portal.querySelector(':scope > .head') || portal.firstElementChild).insertAdjacentElement('afterend', box); }
      if (box.dataset.html !== gone) { box.dataset.html = gone; box.innerHTML = gone; }
      if (!portal.classList.contains('th2')) portal.classList.add('th2');
      if (!portal.classList.contains('th-gone')) portal.classList.add('th-gone');
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
        todo.push(row('room', w ? w.subject : txt(card.querySelector('.tenant-title')), w ? w.sub : 'Đang chờ quản lý kiểm tra phòng', 'Xem', function () { sheet(card, ''); }, { urgent: w && w.late }));
        return;
      }
      var t = card.querySelector('h4,h5,strong,.title') || card.querySelector('.tenant-title'); todo.push(row('handover', txt(t) || 'Cần xác nhận', /hư|sửa/i.test(txt(card)) ? 'Đã sửa xong · cần anh/chị xác nhận' : 'Cần anh/chị xác nhận', 'Xem', function () { sheet(card, ''); })); });
    // Người ở cùng: không ký, không gia hạn, không trả phòng thay khách chính
    var mate = window.roommateEntry ? window.roommateEntry(acct.join('|')) : null;
    var lease = document.getElementById('tenantLeaseChoice');
    if (!mate && lease && txt(lease)) todo.push(row('contract', txt(lease.querySelector('.tenant-title,strong')) || 'Hợp đồng sắp hết hạn', 'Chọn gia hạn hoặc trả phòng', 'Xem', function () { sheet(lease, ''); }));
    var td = document.getElementById('tenantTodo');
    if (td && !mate) {
      var steps = td.querySelectorAll('.todo-step'), now = td.querySelector('.todo-step.now'), idx = Array.prototype.indexOf.call(steps, now) + 1;
      if (now) { var tb = now.querySelector('button'); todo.push(row('contract', txt(now.querySelector('strong')), [txt(now.querySelector('small')), 'bước ' + idx + '/' + steps.length].filter(Boolean).join(' · '), tb ? txt(tb) : '', tb ? function () { tb.click(); } : null)); }
    }
    var due = document.getElementById('tenantDueCard'), amtEl = document.getElementById('tenantDueAmount');
    var amt = amtEl ? Number(String(amtEl.textContent).replace(/[^\d.]/g, '')) || 0 : 0;
    var pay = Array.prototype.find.call(portal.querySelectorAll('.tenant-actions button'), function (b) { return /thanh toán/i.test(b.textContent); });
    var reported = pay && /^Đã báo thanh toán/.test(pay.textContent.trim());
    if (due && !due.hidden && amt > 0) todo.push(row('payment', txt(document.getElementById('tenantDueCopy')) || 'Khoản cần đóng', [amtEl.textContent.trim(), reported ? 'đã báo · chờ quản lý xác nhận' : txt(due.querySelector('small')).replace(/^KHOẢN THANH TOÁN · /i, '')].filter(Boolean).join(' · '), reported || !pay || pay.hidden ? '' : 'Báo đã thanh toán', reported || !pay ? null : function () { pay.click(); }, { urgent: due.classList.contains('late') }));
    var pa = document.getElementById('tenantPriorityAlerts');
    if (pa) pa.querySelectorAll('.tenant-priority-item').forEach(function (it) {
      var head = txt(it.querySelector('strong')), body = txt(it.querySelector('span')), repair = it.classList.contains('repair');
      var parts = body.split(' · ');
      if (repair && todo.some(function (h) { return h.indexOf('>' + esc(parts[0]) + '<') >= 0; })) return; // đã có dòng cần xác nhận cùng việc
      if (/bàn giao/i.test(head) && todo.some(function (h) { return h.indexOf('biên bản giao phòng') >= 0; })) return; // bước Nhận phòng đã có nút xem biên bản
      var ws = repair && window.waitingSteps ? window.waitingSteps().filter(function (o) { return o.room === room && o.type === 'repair' && o.subject === parts[0] && o.show.indexOf('tenant') >= 0; })[0] : null;
      todo.push(repair ? row('repair', parts[0], ['Sửa chữa', ws ? ws.sub : parts.slice(1).join(' · ') || 'Đang xử lý'].join(' · '), '', null, { urgent: ws && ws.late }) : row(it.classList.contains('expiring') ? 'contract' : 'room', head, body, '', null, { urgent: /quá hạn|trễ/i.test(head + body) }));
    });
    var vio = document.getElementById('tenantViolations'), vItems = vio ? vio.querySelectorAll('.notice-item') : [];
    var unseen = Array.prototype.filter.call(vItems, function (n) { return /Chờ khách xem/.test(n.textContent); });
    if (unseen.length) todo.push(row('room', 'Biên bản vi phạm mới', unseen.length + ' biên bản chưa xem', 'Xem', function () { sheet(vio, ''); }, { urgent: true }));
    var nt = document.getElementById('tenantNotices');
    if (nt) nt.querySelectorAll('.notice-item.unread').forEach(function (n) { todo.push(row('notice', txt(n.querySelector('h5,strong,b,h4')) || 'Thông báo mới', 'Thông báo của căn', 'Xem', function () { sheet(nt, ''); })); });
    if (!mate && c && window.openHousehold) (c.roommateInvites || []).filter(function (v) { return v.status === 'Từ chối'; }).forEach(function (v) { todo.push(row('contract', 'Không duyệt người ở cùng: ' + v.name, v.reason || '', 'Xem', function () { window.openHousehold(room); })); });
    // Bước đang chờ quản lý / chủ nhà làm: khách cũng thấy đang chờ ai
    if (window.waitingSteps) window.waitingSteps().forEach(function (o) {
      if (o.room !== room || o.show.indexOf('tenant') < 0) return;
      if (mate) return; // người ở cùng không theo dõi việc hợp đồng của khách chính
      if (todo.some(function (h) { return h.indexOf(esc(o.subject)) >= 0; })) return;
      todo.push(row(o.type === 'room' ? 'room' : 'contract', o.subject, o.sub, '', null, { urgent: o.late }));
    });
    // 2) Dòng tiền
    var rent = txt(document.getElementById('tenantRent')), dd = (txt(document.getElementById('tenantDueDay')).match(/\d+/) || [])[0];
    if (c && c.status === 'Đã ký' && rent && !(td && td.querySelector('.todo-step.now'))) {
      var nextTxt = '';
      if (dd) { var d = new Date(), n = new Date(d.getFullYear(), d.getMonth(), Number(dd)); if (n.getTime() < d.setHours(0, 0, 0, 0) + 1 || amt <= 0) n = new Date(n.getFullYear(), n.getMonth() + (n.getTime() <= Date.now() || amt <= 0 ? 1 : 0), Number(dd)); nextTxt = String(n.getDate()).padStart(2, '0') + '/' + String(n.getMonth() + 1).padStart(2, '0'); }
      H += '<div class="th-money"><span>Tiền thuê <b>' + esc(rent) + '</b>/tháng</span><span class="' + (amt > 0 ? 'th-due' : 'th-ok') + '">' + (amt > 0 ? 'Cần đóng ' + esc(amtEl.textContent.trim()) : 'Đã đóng đủ' + (nextTxt ? ' · kỳ sau ' + nextTxt : '')) + '</span></div>';
    }
    H += '<div class="work-section th-section"><div class="work-head"><span>Việc cần làm</span><span class="work-count' + (todo.length ? ' urgent' : '') + '">' + todo.length + '</span></div>' +
      (todo.length ? '<div class="work-list">' + todo.join('') + '</div>' : '<div class="work-empty">Không có việc nào đang chờ</div>') + '</div>';
    // 3) Nút
    var acts = Array.prototype.slice.call(portal.querySelectorAll('.tenant-actions button')).filter(function (b) { return b !== pay && !b.hidden && txt(b) && !b.closest('#tenantHome2'); });
    if (mate) acts = acts.filter(function (b) { return !/trả phòng|gia hạn|hợp đồng/i.test(b.textContent); });
    if (c && c.status === 'Đã ký' && window.householdButton) acts.push(window.householdButton(room));
    var repairBtn = acts.find(function (b) { return /hư hỏng/i.test(b.textContent); }), others = acts.filter(function (b) { return b !== repairBtn; }).sort(function (a, b) { return (/trả phòng/i.test(a.textContent) ? 1 : 0) - (/trả phòng/i.test(b.textContent) ? 1 : 0); }); // Báo trả phòng xuống cuối, tránh bấm nhầm
    H += '<div class="th-actions">' + (repairBtn ? '<button type="button" class="th-main" data-th="' + on(function () { repairBtn.click(); }) + '">' + esc(txt(repairBtn)) + '</button>' : '') +
      (others.length ? '<button type="button" class="th-more" data-th="' + on(function () { list('Việc khác', others); }) + '">Khác ›</button>' : '') + '</div>';
    // 4) Vi phạm
    if (vItems.length) H += '<div class="work-list th-vio">' + row('room', 'Vi phạm nội quy · ' + vItems.length + ' lần', 'Gần nhất: ' + txt(vItems[0].querySelector('h5,strong,b')).replace(/^Lần \d+:\s*/, '') + ' · ' + short(txt(vItems[0].querySelector('small'))), '', function () { sheet(vio, ''); }) + '</div>';
    // 5) Lịch sử: chỉ việc của khách
    var hist = [], evs = events(room), rows = document.querySelectorAll('#tenantFullTimeline .tenant-event');
    var hand = null; try { hand = readHandoverRecords().filter(function (r) { return r.room === room && r.type === 'Giao phòng' && r.confirmedAt; }).pop(); } catch (e) {}
    Array.prototype.forEach.call(rows, function (r, i) {
      var t = txt(r.querySelector('strong')), p = txt(r.querySelector('p')), st = txt(r.querySelector('.tenant-status')), date = txt(r.querySelector('.tenant-date'));
      if (/^(Lập hợp đồng|Chủ nhà duyệt hợp đồng|Khách thêm thiết bị|Chủ nhà xem xét)/.test(t)) return;
      var e = evs.find(function (x) { return x.title === t; }), ts = e ? (stamp(e) || vt(e.acceptedAt) || vt(e.confirmedAt)) : 0;
      if (/xác nhận ký hợp đồng/.test(t) && c) ts = vt(c.signedAt);
      if (/^Nhận phòng/.test(t) && hand) ts = vt(hand.confirmedAt);
      if (!ts) ts = vt('12:00:00 ' + date) - i;
      var kind = /hư hỏng|sửa/i.test(t) ? 'repair' : /chuyển khoản|thanh toán|tiền/i.test(t) ? 'payment' : /hợp đồng/i.test(t) ? 'contract' : 'room';
      var title = t.replace(/^Đã báo hư hỏng:\s*/, 'Báo hư: ').replace(/^Đã báo chuyển khoản:\s*/, 'Báo đã chuyển: ').replace(/^Người thuê xác nhận ký hợp đồng/, 'Ký hợp đồng');
      hist.push({ ts: ts, t: title, sub: [short(date), st && st !== title ? st : ''].filter(Boolean).join(' · '), detail: p, kind: kind });
    });
    document.querySelectorAll('#tenantReceipts [data-receipt]').forEach(function (b) {
      var amount = txt(b.querySelector('b')), rest = txt(b).replace(amount, '').replace(/^\s*·\s*/, ''), when = txt(b.querySelector('small')), lab = rest.replace(when, '').trim();
      hist.push({ ts: vt((when.match(/\d{1,2}:\d{2}(:\d{2})? \d{1,2}\/\d{1,2}\/\d{4}/) || [])[0]), t: 'Biên lai: ' + lab, sub: short(when) + ' · ' + (when.split(' · ')[0] || ''), amount: amount, kind: 'payment', btn: b });
    });
    document.querySelectorAll('#tenantComplaints .complaint-item').forEach(function (it) {
      var sm = txt(it.querySelector('small')), body = txt(it.querySelector('p'));
      var cd = (sm.match(/\d{1,2}\/\d{1,2}\/\d{4}/) || [])[0];
      hist.push({ ts: cd ? vt('23:59:00 ' + cd) : 0, t: 'Góp ý: ' + body, sub: sm.replace(/\d{1,2}\/\d{1,2}\/\d{4}/, short(cd)), detail: txt(it.querySelector('.complaint-reply')), kind: 'notice' });
    });
    hist.sort(function (a, b) { return b.ts - a.ts; });
    var shown = showAll ? hist : hist.slice(0, 5);
    H += '<div class="work-section th-section"><div class="work-head"><span>Lịch sử</span><span class="work-count">' + hist.length + '</span>' + (hist.length > 5 ? '<button type="button" class="work-more' + (showAll ? ' less' : '') + '" data-th="' + on(function () { showAll = !showAll; render(); }) + '">' + (showAll ? 'Thu gọn' : 'Xem tất cả') + '</button>' : '') + '</div>' +
      (shown.length ? '<div class="work-list">' + shown.map(function (h) {
        return row(h.kind, h.t, h.sub, '', h.btn ? function () { h.btn.click(); } : h.detail ? function () { appConfirmInfo(h); } : null, { amount: h.amount });
      }).join('') + '</div>' : '<div class="work-empty">Chưa có hoạt động nào</div>') + '</div>';
    if (!box) { box = document.createElement('div'); box.id = 'tenantHome2'; (portal.querySelector(':scope > .head') || portal.firstElementChild).insertAdjacentElement('afterend', box); }
    if (box.dataset.html !== H) { box.dataset.html = H; box.innerHTML = H; }
    if (!portal.classList.contains('th2')) portal.classList.add('th2');
  }
  function appConfirmInfo(h) {
    var o = document.createElement('div');
    o.className = 'modal-overlay';
    o.innerHTML = '<div class="modal-sheet"><div class="modal-head">' + esc(h.t) + '</div><p class="confirm-text">' + esc(h.detail) + '</p><p class="note">' + esc(h.sub) + '</p><div class="modal-actions"><button type="button" data-th-close>Đóng</button></div></div>';
    o.addEventListener('click', function (e) { if (e.target === o || e.target.closest('[data-th-close]')) o.remove(); });
    (typeof appendToPhone === 'function' ? appendToPhone : function (x) { document.querySelector('.phone').appendChild(x); })(o);
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('#tenantHome2 [data-th]');
    if (!b) return;
    var fn = handlers[Number(b.dataset.th)];
    if (fn) fn();
  });
  var t = 0, busy = false;
  function soon() { if (busy) return; clearTimeout(t); t = setTimeout(function () { busy = true; try { render(); } finally { setTimeout(function () { busy = false; }, 0); } }, 120); }
  window.__th2Soon = soon;
  function watch() {
    var p = document.getElementById('tenantPortal');
    if (p) new MutationObserver(function (ms) { if (ms.some(function (m) { return !(m.target.closest && m.target.closest('#tenantHome2')) && !(m.target.id === 'tenantHome2'); })) soon(); }).observe(p, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['hidden', 'class'] });
    render();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch); else watch();
})();

// Người ở cùng phòng (anh chốt 12/11): khách chính mời, quản lý duyệt rồi tạo tài khoản riêng.
// Cả phòng chung một hoá đơn, ai chuyển tiền thì người đó báo. Dọn đi thì khách chính hoặc quản lý bỏ ra;
// hợp đồng và cọc vẫn đứng tên khách chính.
(function () {
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function acct() { var s = document.getElementById('accountSelect'); return s ? String(s.value || '') : ''; }
  function contracts() { try { return readHomeContracts() || {}; } catch (e) { return {}; } }
  function now() { return new Date().toLocaleString('vi-VN'); }
  function day(at) { return String(at || '').split(' ').pop(); }
  function phone(o) { (typeof appendToPhone === 'function' ? appendToPhone : function (x) { document.querySelector('.phone').appendChild(x); })(o); }
  function refresh() { ['renderManagementOverview', 'refreshTenantScreen', '__th2Soon'].forEach(function (f) { try { if (typeof window[f] === 'function') window[f](); } catch (e) {} }); }
  function mates(c) { return ((c && c.extraPeople) || []).filter(function (p) { return !p.leftAt; }); }
  // Tài khoản người ở cùng: có trong danh sách người ở thêm của hợp đồng
  window.isRoommateKey = function (key) {
    var room = String(key || '').split('|')[2], c = room && contracts()[room];
    return !!(c && (c.extraPeople || []).some(function (p) { return p.account === key; }));
  };
  window.roommateEntry = function (key) {
    var room = String(key || '').split('|')[2], c = room && contracts()[room];
    var p = c && mates(c).find(function (x) { return x.account === key; });
    return p ? { room: room, p: p, c: c } : null;
  };
  // Tiền phòng tính theo khách chính: người ở cùng xem và báo thanh toán chung một hoá đơn
  window.householdKey = function (key) {
    var r = window.roommateEntry(key);
    if (!r) return key;
    var u = null; try { u = roomTenantUser(r.room); } catch (e) {}
    return u && u.key !== key ? u.key : key;
  };
  function mainName(room, c) { var u = null; try { u = roomTenantUser(room); } catch (e) {} return (c && c.tenantName) || (u && u.name) || ''; }
  function isMain(room) { var a = acct().split('|'); return a[0] === 'tenant' && a[2] === room && !window.roommateEntry(acct()); }
  function isStaff(room) { try { return ['owner', 'manager'].indexOf(acct().split('|')[0]) >= 0 && canManageCheckout(room); } catch (e) { return false; } }
  function feeNote(room) {
    var fee = 0, house = ''; try { fee = extraPersonMonthly(room); house = propertyIdForRoom(room); } catch (e) {}
    return fee > 0 ? 'Từ kỳ sau thu thêm ' + amountForHouse(fee, house) + ' / người / tháng.' : '';
  }
  function err(form, t) { var b = form.querySelector('.user-error'); b.hidden = false; b.textContent = t; }

  // Danh sách người ở trong phòng
  window.openHousehold = function (room) {
    var c = contracts()[room] || {}, main = mainName(room, c), u = null; try { u = roomTenantUser(room); } catch (e) {}
    var canEdit = isMain(room) || isStaff(room), me = acct();
    var rows = '<div class="user-info-row"><span>Khách chính</span><strong>' + esc(main) + (u && u.phone ? ' · ' + esc(u.phone) : '') + '</strong></div>';
    mates(c).forEach(function (p) {
      rows += '<div class="hh-row"><div><strong>' + esc(p.names) + (p.account === me ? ' (anh/chị)' : '') + '</strong><small>' + esc([p.phone, p.account ? 'có tài khoản' : 'không có tài khoản', 'ở từ ' + day(p.at)].filter(Boolean).join(' · ')) + '</small></div>' +
        (canEdit ? '<button type="button" class="hh-btn" data-hh-left="' + esc(p.id) + '">Đã dọn đi</button>' : '') + '</div>';
    });
    (c.roommateInvites || []).forEach(function (v) {
      var rej = v.status === 'Từ chối';
      rows += '<div class="hh-row"><div><strong>' + esc(v.name) + '</strong><small' + (rej ? ' class="hh-bad"' : '') + '>' + esc(rej ? 'Quản lý không duyệt: ' + (v.reason || '') : 'Chờ quản lý duyệt · mời ' + day(v.at)) + '</small></div>' +
        (isMain(room) || isStaff(room) ? '<button type="button" class="hh-btn" data-hh-drop="' + esc(v.id) + '">' + (rej ? 'Bỏ' : 'Huỷ mời') + '</button>' : '') + '</div>';
    });
    var cap = 0; try { cap = roomCapacity(room); } catch (e) {}
    var full = cap && (Number(c.occupants) || 1) + (c.roommateInvites || []).filter(function (v) { return v.status !== 'Từ chối'; }).length >= cap;
    var o = document.createElement('div');
    o.className = 'modal-overlay';
    o.innerHTML = '<div class="modal-sheet"><div class="modal-head">Người ở cùng · ' + esc(room) + '</div>' + rows +
      '<p class="note">Đang ở ' + (Number(c.occupants) || 1) + ' người' + (cap ? ' / tối đa ' + cap : '') + (full ? ', phòng đã đủ người' : '') + '. ' + (canEdit ? 'Người ở cùng có tài khoản riêng: báo hư, xem thông báo, xem và báo thanh toán tiền phòng. Hợp đồng và tiền cọc vẫn đứng tên khách chính.' : 'Khách chính ' + esc(main) + ' thêm hoặc bỏ người ở cùng.') + '</p>' +
      '<div class="modal-actions"><button type="button" data-hh-close>Đóng</button>' + (canEdit && !full ? '<button type="button" class="save" data-hh-add>Thêm người ở cùng</button>' : '') + '</div></div>';
    o.addEventListener('click', function (e) {
      var t = e.target;
      if (t === o || t.closest('[data-hh-close]')) return o.remove();
      if (t.closest('[data-hh-add]')) { o.remove(); return openInvite(room); }
      var l = t.closest('[data-hh-left]'); if (l) { o.remove(); return askLeft(room, l.dataset.hhLeft); }
      var d = t.closest('[data-hh-drop]'); if (d) { o.remove(); dropInvite(room, d.dataset.hhDrop); return window.openHousehold(room); }
    });
    phone(o);
  };

  // Khách chính (hoặc quản lý) nhập người ở cùng
  function openInvite(room) {
    var c = contracts()[room] || {}, cap = 0; try { cap = roomCapacity(room); } catch (e) {}
    var o = document.createElement('div');
    o.className = 'modal-overlay';
    o.innerHTML = '<form class="modal-sheet"><div class="modal-head">Thêm người ở cùng · ' + esc(room) + '</div>' +
      '<label>Họ tên</label><input name="name" data-req autocomplete="off"><label>Số điện thoại (để đăng nhập)</label><input name="phone" data-req inputmode="tel" autocomplete="off">' +
      '<label>Ảnh CCCD / hộ chiếu (bắt buộc)</label><input name="photos" data-req type="file" accept="image/*" multiple>' +
      '<p class="note">' + esc([isStaff(room) ? 'Lưu xong đặt mật khẩu cho người này.' : 'Quản lý duyệt xong sẽ tạo tài khoản, người này đăng nhập bằng số điện thoại trên.', feeNote(room)].filter(Boolean).join(' ')) + '</p>' +
      '<p class="user-error" hidden></p><div class="modal-actions"><button type="button" data-close>Huỷ</button><button class="save">' + (isStaff(room) ? 'Lưu' : 'Gửi quản lý duyệt') + '</button></div></form>';
    phone(o);
    var form = o.querySelector('form'), photos = [], busy = false;
    form.photos.addEventListener('change', async function () { busy = true; photos = []; for (var f of Array.prototype.slice.call(form.photos.files, 0, 4)) { try { photos.push(await compressInventoryPhoto(f)); } catch (e) {} } busy = false; });
    o.querySelector('[data-close]').addEventListener('click', function () { o.remove(); });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var name = form.name.value.trim().replace(/\|/g, ''), ph = form.phone.value.trim(), fresh = contracts()[room] || {};
      if (busy) return err(form, 'Đang xử lý ảnh, bấm lại sau giây lát.');
      if (name.length < 2) return err(form, 'Nhập họ tên người ở cùng.');
      var pe = contractPhoneError(ph); if (pe) return err(form, pe);
      if (!photos.length) return err(form, 'Tải ảnh CCCD / hộ chiếu của người này (bắt buộc).');
      var pk = phoneKey(ph, '84'), taken = (readUsers() || []).some(function (u) { return u.role === 'tenant' && u.room === room && u.status !== 'Đã xoá' && (u.name === name || (u.phone && phoneKey(u.phone, '84') === pk)); }) ||
        (fresh.roommateInvites || []).some(function (v) { return v.status !== 'Từ chối' && (v.name === name || phoneKey(v.phone, '84') === pk); });
      if (taken || name === fresh.tenantName) return err(form, 'Phòng đã có người tên này hoặc số điện thoại này.');
      var waiting = (fresh.roommateInvites || []).filter(function (v) { return v.status !== 'Từ chối'; }).length;
      if (cap && (Number(fresh.occupants) || 1) + waiting + 1 > cap) return err(form, 'Phòng chỉ cho tối đa ' + cap + ' người, không được ở vượt.');
      var v = { id: 'RM' + Date.now().toString(36), name: name, phone: ph, photos: photos, at: now(), by: currentActorName(), status: 'Chờ duyệt' };
      fresh.roommateInvites = (fresh.roommateInvites || []).concat([v]);
      saveHomeContract(room, fresh);
      appendRoomHistory(room, { kind: 'contract', title: 'Mời người ở cùng: ' + name, detail: ph + ' · ' + currentActorName() + ' gửi · chờ quản lý duyệt', actor: currentActorName() });
      o.remove();
      if (isStaff(room)) return approve(room, v.id);
      if (typeof appToast === 'function') appToast('Đã gửi quản lý duyệt');
      refresh();
    });
  }
  function dropInvite(room, id) {
    var c = contracts()[room]; if (!c) return;
    var v = (c.roommateInvites || []).find(function (x) { return x.id === id; });
    c.roommateInvites = (c.roommateInvites || []).filter(function (x) { return x.id !== id; });
    saveHomeContract(room, c);
    if (v && v.status !== 'Từ chối') appendRoomHistory(room, { kind: 'contract', title: 'Huỷ mời người ở cùng: ' + v.name, detail: currentActorName(), actor: currentActorName() });
    refresh();
  }

  // Quản lý duyệt: thêm vào số người ở (tính phụ phí, nhắc khai báo tạm trú như thêm người ở), rồi đặt mật khẩu
  function reviewInvite(room, id) {
    var c = contracts()[room] || {}, v = (c.roommateInvites || []).find(function (x) { return x.id === id; });
    if (!v) return;
    var cap = 0; try { cap = roomCapacity(room); } catch (e) {}
    var n = Number(c.occupants) || 1;
    appConfirm('Duyệt người ở cùng?', 'Duyệt xong đặt mật khẩu, người này đăng nhập bằng số điện thoại và xem chung tiền phòng với khách chính.', 'Duyệt', function () { approve(room, id); }, false, {
      big: v.name, sub: room + ' · khách chính ' + mainName(room, c),
      rows: [['Số điện thoại', v.phone], ['Khách mời', v.by + ' · ' + v.at], ['Số người ở', n + ' → ' + (n + 1) + ' người' + (cap ? ' / tối đa ' + cap : '')], ['Phụ phí', feeNote(room) || 'Căn này chưa đặt phụ phí thêm người']],
      photos: v.photos || [], photoLabel: 'CCCD / hộ chiếu'
    });
  }
  function approve(room, id) {
    var c = contracts()[room]; if (!c) return;
    var v = (c.roommateInvites || []).find(function (x) { return x.id === id; }); if (!v) return;
    var next = Date.now(); try { next = periodBounds(roomLease(room).dueDay, dayStart()).next; } catch (e) {}
    var key = 'tenant|' + v.name + '|' + room;
    c.occupants = (Number(c.occupants) || 1) + 1;
    c.extraPeople = (c.extraPeople || []).concat([{ id: 'XP' + Date.now().toString(36), count: 1, names: v.name, phone: v.phone, photos: v.photos || [], at: now(), by: v.by, approvedBy: currentActorName(), fromPeriod: monthKeyOf(next), residenceDeclaredAt: '', account: key }]);
    c.roommateInvites = c.roommateInvites.filter(function (x) { return x.id !== id; });
    saveHomeContract(room, c);
    var users = readUsers(), u = users.find(function (x) { return x.key === key; });
    if (!u) { u = { key: key, id: 'U-' + Date.now().toString(36).slice(-6), role: 'tenant', name: v.name, fullName: v.name, room: room, phone: v.phone, status: 'Đang hoạt động', history: [] }; users.push(u); }
    else { u.status = 'Đang hoạt động'; u.phone = v.phone; }
    logUserChange(u, 'Tạo tài khoản người ở cùng phòng ' + room);
    saveUsers(users);
    appendRoomHistory(room, { kind: 'contract', title: 'Đã duyệt người ở cùng: ' + v.name, detail: 'Nay ' + c.occupants + ' người · ' + currentActorName() + ' duyệt', actor: currentActorName() });
    try { ensureRentCharges(); } catch (e) {}
    try { refreshUserAccounts(); } catch (e) {}
    refresh();
    setPassword(room, key, v);
  }
  function setPassword(room, key, v) {
    var o = document.createElement('div');
    o.className = 'modal-overlay';
    o.innerHTML = '<form class="modal-sheet"><div class="modal-head">Mật khẩu cho ' + esc(v.name) + '</div><p class="note" style="margin-top:0">' + esc(v.name) + ' đăng nhập bằng số ' + esc(v.phone) + '.</p><label>Mật khẩu</label><div class="pw-row"><input name="pw" minlength="6" maxlength="40" value="' + randomPassword() + '" autocomplete="off"><button type="button" class="pw-gen" data-random>Tạo số khác</button></div><p class="user-error" hidden></p><div class="modal-actions"><button class="save">Tạo tài khoản</button></div></form>';
    phone(o);
    var form = o.querySelector('form');
    o.querySelector('[data-random]').addEventListener('click', function () { form.pw.value = randomPassword(); });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var pw = String(form.pw.value || '').trim();
      if (pw.length < 6) return err(form, 'Mật khẩu cần ít nhất 6 ký tự.');
      setUserPassword(key, pw, currentActorName(), false);
      form.innerHTML = '<div class="modal-head">Đã tạo tài khoản</div><div class="pw-box">Báo cho ' + esc(v.name) + ' đăng nhập bằng số <b>' + esc(v.phone) + '</b><br>Mật khẩu <strong>' + esc(pw) + '</strong></div><p class="note">Vào app chọn tiếng, nhập số điện thoại và mật khẩu này. Đăng nhập xong nên tự đổi mật khẩu.</p><div class="modal-actions"><button type="button" class="save" data-close>Xong</button></div>';
      form.querySelector('[data-close]').addEventListener('click', function () { o.remove(); });
    });
  }
  function rejectInvite(room, id) {
    var c = contracts()[room] || {}, v = (c.roommateInvites || []).find(function (x) { return x.id === id; }); if (!v) return;
    var o = document.createElement('div');
    o.className = 'modal-overlay';
    o.innerHTML = '<form class="modal-sheet"><div class="modal-head">Không duyệt ' + esc(v.name) + '?</div><label>Lý do (khách chính thấy)</label><textarea name="reason" data-req rows="3"></textarea><p class="user-error" hidden></p><div class="modal-actions"><button type="button" data-close>Huỷ</button><button class="save danger">Không duyệt</button></div></form>';
    phone(o);
    var form = o.querySelector('form');
    o.querySelector('[data-close]').addEventListener('click', function () { o.remove(); });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var reason = form.reason.value.trim(); if (reason.length < 3) return err(form, 'Ghi lý do để khách chính biết.');
      var f = contracts()[room], x = f && (f.roommateInvites || []).find(function (i) { return i.id === id; }); if (!x) return o.remove();
      x.status = 'Từ chối'; x.reason = reason; x.reviewedBy = currentActorName(); x.reviewedAt = now();
      saveHomeContract(room, f);
      appendRoomHistory(room, { kind: 'contract', title: 'Không duyệt người ở cùng: ' + x.name, detail: reason + ' · ' + currentActorName(), actor: currentActorName() });
      o.remove(); refresh();
    });
  }

  // Dọn đi: bớt số người, thôi phụ phí từ kỳ sau, khoá tài khoản (máy quản lý / chủ nhà gỡ khỏi phòng trên máy chủ)
  function askLeft(room, id) {
    var c = contracts()[room] || {}, p = mates(c).find(function (x) { return x.id === id; }); if (!p) return;
    appConfirm('Ghi ' + p.names + ' đã dọn đi?', 'Người này không vào app xem phòng được nữa. Lịch sử vẫn giữ. Hợp đồng và tiền cọc không đổi.', 'Đã dọn đi', function () {
      var f = contracts()[room], x = f && mates(f).find(function (i) { return i.id === id; }); if (!x) return;
      var next = Date.now(); try { next = periodBounds(roomLease(room).dueDay, dayStart()).next; } catch (e) {}
      x.leftAt = now(); x.leftBy = currentActorName(); x.toPeriod = monthKeyOf(next);
      f.occupants = Math.max(1, (Number(f.occupants) || 1) - (Number(x.count) || 1));
      saveHomeContract(room, f);
      try { var list = readRentCharges().filter(function (ch) { return !(ch.room === room && ch.extra === 'person' && ch.status === 'Chưa thu' && String(ch.period) >= 'person-' + x.toPeriod); }); saveRentCharges(list); ensureRentCharges(); } catch (e) {}
      appendRoomHistory(room, { kind: 'contract', title: 'Người ở cùng dọn đi: ' + x.names, detail: 'Nay ' + f.occupants + ' người · ' + currentActorName() + ' ghi', actor: currentActorName() });
      unlinkLeft(); refresh();
    }, true, { big: p.names, sub: room, rows: [['Số người ở', (Number(c.occupants) || 1) + ' → ' + Math.max(1, (Number(c.occupants) || 1) - 1) + ' người']].concat(feeNote(room) ? [['Phụ phí', 'Thôi thu từ kỳ ' + (function () { try { return monthKeyOf(periodBounds(roomLease(room).dueDay, dayStart()).next).split('-').reverse().join('/'); } catch (e) { return 'sau'; } })()]] : []) });
  }
  var unlinking = {};
  function unlinkLeft() {
    if (!window.HOME_REAL || !window.HOME_DB || !window.HOME_DB.unlinkTenantRoom || ['owner', 'manager'].indexOf(acct().split('|')[0]) < 0) return;
    var all = contracts();
    Object.keys(all).forEach(function (room) {
      ((all[room] && all[room].extraPeople) || []).forEach(function (p) {
        if (!p.account || !p.leftAt || p.unlinkedAt || unlinking[p.id] || !isStaff(room)) return;
        var u = (readUsers() || []).find(function (x) { return x.key === p.account && x.uuid; }); if (!u) return;
        unlinking[p.id] = 1;
        window.HOME_DB.unlinkTenantRoom(u.uuid, room).then(function (r) {
          delete unlinking[p.id]; if (r.error) return;
          var f = contracts()[room], x = f && (f.extraPeople || []).find(function (i) { return i.id === p.id; }); if (!x) return;
          x.unlinkedAt = now(); saveHomeContract(room, f);
        });
      });
    });
  }
  setTimeout(unlinkLeft, 4000); setInterval(unlinkLeft, 60000);
  function checkLeft() {
    var me = null; try { me = JSON.parse(localStorage.getItem('homeServerUser') || 'null'); } catch (e) {}
    if (!window.HOME_REAL || !me || me.vai_tro !== 'khach') return;
    if (!window.HOME_DB) return window.addEventListener('home-db-ready', checkLeft, { once: true });
    window.HOME_DB.client.from('khach_phong').select('dang_o').eq('khach_id', me.id).then(function (r) {
      if (r.error || !r.data) return;
      var left = !r.data.some(function (x) { return x.dang_o; });
      if (left !== !!window.__tenantLeft) { window.__tenantLeft = left; refresh(); }
    });
  }
  checkLeft(); setInterval(checkLeft, 60000);

  // Việc cần xử lý: quản lý duyệt lời mời
  var base = collectWorkItems;
  collectWorkItems = function () {
    var items = base.apply(this, arguments), scope = workScope();
    if (['owner', 'manager'].indexOf(scope.role) < 0) return items;
    var all = contracts();
    Object.keys(all).forEach(function (room) {
      (all[room] && all[room].roommateInvites || []).forEach(function (v) {
        if (v.status === 'Từ chối') return;
        var house = ''; try { house = propertyIdForRoom(room); } catch (e) {}
        if (!scope.houseOk(house) || !scope.roomOk(room)) return;
        var can = isStaff(room);
        items.push({ type: 'contract', house: house, room: room, title: room + ': Duyệt người ở cùng · ' + v.name, sub: (can ? v.by + ' mời · ' + v.phone : 'Chờ quản lý duyệt · ' + v.by + ' mời'), time: parseViTime(v.at) || Date.now(),
          actions: can ? [{ label: 'Xem', run: function () { reviewInvite(room, v.id); } }, { label: 'Không duyệt', run: function () { rejectInvite(room, v.id); } }] : [], target: { type: 'room', room: room } });
      });
    });
    return items;
  };

  // Nút trong màn khách và trong chi tiết phòng của quản lý
  window.householdButton = function (room) {
    var b = document.createElement('button'); b.type = 'button'; b.textContent = 'Người ở cùng';
    b.addEventListener('click', function () { window.openHousehold(room); });
    return b;
  };
  new MutationObserver(function () {
    document.querySelectorAll('.phone .rd-sheet').forEach(function (sheet) {
      var add = sheet.querySelector('[data-occupant-add]');
      if (!add || sheet.querySelector('[data-household]')) return;
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
          if (m) add({ room: room, subject: asset(e), match: new RegExp(esc(asset(e))), who: 'manager', whoName: m, wait: 'Đang chờ ' + m + ' tiếp nhận', since: stamp(e) || t(e.date), show: ['owner', 'tenant'], type: 'repair' });
        }
        if (e.kind === 'repair' && e.status === 'Chờ khách xác nhận') {
          var cost = Number(e.repairCost) || 0;
          add({ room: room, subject: asset(e), match: new RegExp(esc(asset(e))), who: 'tenant', whoName: e.tenantName, wait: 'Đang chờ ' + (e.tenantName || 'khách') + ' xác nhận đã sửa xong' + (cost > 0 ? ' · chi phí ' + money(cost, house(room)) : '') + (e.fixedBy ? ' · ' + e.fixedBy + ' sửa' : ''), since: t(e.fixedAt) || stamp(e), show: ['owner', 'manager'], type: 'repair' });
        }
      });
    });
    var cs = {}; try { cs = readHomeContracts(); } catch (e) {}
    Object.keys(cs).forEach(function (room) {
      var c = cs[room]; if (!c) return;
      if (c.status === 'Chờ chủ nhà duyệt') add({ room: room, subject: 'Hợp đồng ' + (c.tenantName || ''), match: /Hợp đồng/, who: 'owner', wait: 'Đang chờ chủ nhà duyệt' + (c.createdBy ? ' · ' + c.createdBy + ' lập' : ''), since: t(c.createdAt), show: ['manager', 'tenant'], type: 'contract' });
      if (c.status === 'Chờ người thuê ký') add({ room: room, subject: 'Hợp đồng ' + (c.tenantName || ''), match: /ký hợp đồng|Hợp đồng/, who: 'tenant', whoName: c.tenantName, wait: 'Đang chờ ' + (c.tenantName || 'khách') + ' ký', since: t(c.approvedAt) || t(c.createdAt), show: ['owner', 'manager'], type: 'contract' });
      if (c.renewal && c.renewal.status === 'Chờ chủ nhà duyệt') add({ room: room, subject: 'Gia hạn hợp đồng', match: /gia hạn/i, who: 'owner', wait: 'Đang chờ chủ nhà duyệt gia hạn' + (c.renewal.end ? ' đến ' + c.renewal.end : ''), since: t(c.renewal.at), show: ['manager', 'tenant'], type: 'contract' });
      (c.roommateInvites || []).forEach(function (v) {
        if (v.status === 'Từ chối') return;
        add({ room: room, subject: 'Người ở cùng ' + v.name, match: new RegExp(esc(v.name)), who: 'manager', whoName: mgr(room), wait: 'Đang chờ ' + (mgr(room) || 'quản lý') + ' duyệt', since: t(v.at), show: ['tenant'], type: 'contract' });
      });
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
      if (r.status === 'Chờ khách xác nhận') add({ room: room, subject: 'Hoàn cọc', match: /hoàn cọc|trả phòng/i, who: 'tenant', whoName: r.tenantName, wait: 'Đang chờ ' + (r.tenantName || 'khách') + ' xác nhận hoàn ' + money(r.refund || 0, r.house || house(room)), since: t(r.updatedAt) || t(r.createdAt), show: ['owner', 'manager'], type: 'room' });
      if (/Khách báo (chưa đúng|sai lệch)/.test(r.status || '')) add({ room: room, subject: 'Hoàn cọc', match: /hoàn cọc|trả phòng/i, who: 'manager', whoName: mgr(room), wait: 'Đang chờ ' + (mgr(room) || 'quản lý') + ' xem lại số hoàn cọc', since: t(r.updatedAt), show: ['tenant'], type: 'room' });
    });
    var mo = {}; try { mo = readMoveOutRequests(); } catch (e) {}
    Object.keys(mo).forEach(function (room) {
      var q = mo[room]; if (!q || (co[room] && co[room].status !== 'Đã hoàn cọc')) return;
      add({ room: room, subject: 'Báo trả phòng ngày ' + (q.date || ''), match: /trả phòng/i, who: 'manager', whoName: mgr(room), wait: 'Đang chờ ' + (mgr(room) || 'quản lý') + ' kiểm tra phòng, tính hoàn cọc', since: t(q.at || q.createdAt), show: ['tenant'], type: 'room' });
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
      add({ room: '', house: r.propertyId, subject: 'Chi phí: ' + r.name + ' · ' + money(r.amount, r.propertyId), match: new RegExp(esc(r.name || '')), who: 'owner', wait: 'Đang chờ chủ nhà duyệt · ' + money(r.amount, r.propertyId), since: t(r.createdAt), show: ['manager'], onlyName: r.createdBy, type: 'expense' });
    });
    // Thông báo quản lý soạn, chờ chủ nhà duyệt
    (get('homeNotices', []) || []).forEach(function (n) {
      if (!n || n.status !== 'Chờ duyệt') return;
      add({ room: '', house: n.house, subject: 'Thông báo: ' + n.title, match: new RegExp(esc(n.title || '')), who: 'owner', wait: 'Đang chờ chủ nhà duyệt', since: t(n.createdAt || n.at), show: ['manager'], onlyName: n.createdBy, type: 'notice' });
    });
    out.forEach(function (o) { o.days = o.since ? Math.floor((Date.now() - o.since) / DAY) : 0; o.late = o.days > 2; o.sub = o.wait + (o.days > 0 ? ' · đã chờ ' + o.days + ' ngày' : ''); });
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
      if (!scope.houseOk(o.house) || (o.room && !scope.roomOk(o.room))) return;
      var same = items.filter(function (it) { return (!o.room || (it.room || (it.target && it.target.room) || '') === o.room) && o.match.test(it.title || ''); });
      var viewOnly = function (it) { return (it.actions || []).every(function (a) { return /^(Mở|Xem)/.test(a.label || ''); }); };
      if (same.some(function (it) { return !viewOnly(it); })) return; // mình cũng có việc ở bước này
      if (same.length) { same.forEach(function (it) { it.sub = o.sub; it.urgent = o.late; }); return; }
      items.push({ type: o.type, house: o.house, room: o.room, title: (o.room ? o.room + ' · ' : '') + o.subject, sub: o.sub, time: o.since || Date.now(), urgent: o.late, actions: [], target: o.room ? { type: 'room', room: o.room } : undefined });
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
