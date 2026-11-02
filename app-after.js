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
    // Gõ cả mã vùng mà không có dấu +: 84900111222 cũng là +84
    var key = phoneKey(digits.indexOf(region) === 0 && digits.length >= region.length + 9 ? '+' + digits : phone, region);
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
          try { sessionStorage.setItem('homeRealToast', 'Đã tải dữ liệu: ' + p.houses + ' căn · ' + p.rooms + ' phòng'); } catch (e) {}
          try { localStorage.setItem('homeAppSignedIn', '1'); localStorage.removeItem('homeSignedOut'); localStorage.setItem('homeAccount', roleKey); localStorage.setItem('homeServerUser', JSON.stringify({ id: res.me.id, vai_tro: res.me.vai_tro, ten: res.me.ten, phone: res.me.so_dien_thoai, key: roleKey })); } catch (e) {}
          location.reload();
        });
      });
    });
  }, true);
  var so = window.signOut;
  if (typeof so === 'function') window.signOut = function () {
    try { ['homeServerUser', 'homeRealHouses', 'homeRealRooms', 'homeRealRoomsBase'].forEach(function (k) { localStorage.removeItem(k); }); } catch (e) {}
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
        window.HOME_DB.pushPeople().then(function (p) { if (p.error) toast('Chưa lưu được phân công lên máy chủ: ' + p.error); });
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
    var snapshot = function () { return ['homeRealHouses', 'homeRealRooms', 'homeUsers', 'homePropertyManagers', 'homeRoomManagers'].map(function (k) { return localStorage.getItem(k) || ''; }).join('|'); };
    var before = snapshot();
    window.HOME_DB.pullAll().then(function (p) {
      if (p.error) return;
      if (snapshot() === before && !p.changed) return;
      // Chỉ mở lại khi đã qua 1 phút kể từ lần trước, không để app tự tải lại liên tục
      var last = 0; try { last = Number(sessionStorage.getItem('homeRealReloadAt')) || 0; } catch (e) {}
      if (Date.now() - last < 60000) return;
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
    vi: { head: 'Trước khi dùng Home', terms: 'Tôi đã đọc và đồng ý với Điều khoản sử dụng và Chính sách quyền riêng tư.', id: 'Tôi đồng ý để Home lưu ảnh giấy tờ tuỳ thân của tôi, là dữ liệu cá nhân nhạy cảm, trên máy chủ ở Singapore để lập hợp đồng và khai báo cư trú. Tôi có thể rút lại bằng cách gửi email cho Home.', privacy: 'Xem Chính sách', read: 'Xem Điều khoản', ok: 'Đồng ý và tiếp tục', no: 'Đăng xuất', err: 'Chưa lưu được. Kiểm tra mạng rồi thử lại.' },
    en: { head: 'Before you use Home', terms: 'I have read and agree to the Terms of Use and Privacy Policy.', id: 'I agree that Home may store my ID photos, which are sensitive personal data, on servers in Singapore for my lease and residence registration. I can withdraw by emailing Home.', privacy: 'View Policy', read: 'View Terms', ok: 'Agree and continue', no: 'Sign out', err: 'Could not save. Check your connection and try again.' },
    km: { head: 'មុនពេលប្រើ Home', terms: 'ខ្ញុំបានអាន និងយល់ព្រមនឹងលក្ខខណ្ឌប្រើប្រាស់ និងគោលការណ៍ឯកជនភាព។', id: 'ខ្ញុំយល់ព្រមឱ្យ Home រក្សាទុករូបថតឯកសារអត្តសញ្ញាណរបស់ខ្ញុំ ដែលជាទិន្នន័យផ្ទាល់ខ្លួនរសើប នៅលើម៉ាស៊ីនមេក្នុងប្រទេសសិង្ហបុរី សម្រាប់កិច្ចសញ្ញា និងការប្រកាសស្នាក់នៅ។ ខ្ញុំអាចដកវិញដោយផ្ញើអ៊ីមែលទៅ Home។', privacy: 'មើលគោលការណ៍', read: 'មើលលក្ខខណ្ឌ', ok: 'យល់ព្រម និងបន្ត', no: 'ចាកចេញ', err: 'មិនអាចរក្សាទុកបានទេ។ សូមពិនិត្យអ៊ីនធឺណិត ហើយសាកម្ដងទៀត។' }
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
