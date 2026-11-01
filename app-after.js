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
// Khi trang đăng nhập đang mở: khoá mọi phần khác của app (kể cả bảng bật lên mở sau đó).
(function () {
  var phone = document.querySelector('.phone');
  if (!phone) return;
  function lock() {
    var login = document.getElementById('loginScreen');
    Array.prototype.forEach.call(phone.children, function (el) {
      if (el.id === 'loginScreen') return;
      if (login) el.setAttribute('inert', ''); else el.removeAttribute('inert');
    });
  }
  new MutationObserver(lock).observe(phone, { childList: true });
  lock();
})();
// Đăng nhập thật qua Supabase. App thật không còn tài khoản mẫu.
(function () {
  document.addEventListener('submit', function (event) {
    var form = event.target;
    if (!form || !form.closest || !form.closest('#loginScreen')) return;
    if (form.dataset.demoFallback === '1') { delete form.dataset.demoFallback; return; } // để code demo xử lý
    if (!window.HOME_DB) return;
    event.preventDefault(); event.stopImmediatePropagation();
    var box = form.closest('#loginScreen'), btn = box.querySelector('.login-submit');
    var phone = box.querySelector('#loginPhone').value, password = box.querySelector('#loginPassword').value;
    var key = (typeof phoneKey === 'function') ? phoneKey(phone, loginCountry()) : '';
    if (!key || !password) { form.dataset.demoFallback = '1'; form.requestSubmit(); return; }
    var wait = loginLockMinutes(key);
    if (wait) return renderLoginScreen({ phone: phone, cc: loginCountry(), error: 'tooMany', minutes: wait });
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="login-spin" aria-label="…"></span>'; }
    window.HOME_DB.signIn(key, password).then(function (res) {
      if (res.error || !res.me || res.me.trang_thai !== 'hoat_dong') {
        var cc = loginCountry();
        if (res.me) { window.HOME_DB.signOut(); return renderLoginScreen({ phone: phone, cc: cc, error: res.me.trang_thai === 'tam_khoa' ? 'locked' : 'deleted' }); }
        // Sai mật khẩu thì máy chủ trả mã 400; còn lại là lỗi mạng, không tính vào số lần sai
        if (res.error && res.error.status !== 400) {
          if (btn) { btn.disabled = false; renderLoginScreen({ phone: phone, cc: cc }); }
          if (typeof appToast === 'function') appToast('Chưa kết nối được máy chủ. Kiểm tra mạng rồi thử lại.');
          return;
        }
        var locked = noteLoginFail(key);
        return renderLoginScreen({ phone: phone, cc: cc, error: locked ? 'tooMany' : 'wrong', minutes: locked });
      }
      clearLoginFails(key);
      var ownerKey = (loginAccounts().find(function (u) { return u.role === 'owner'; }) || {}).key || 'owner|Anh Tuyên|';
      var roleKey = res.me.vai_tro === 'chu_nha' ? ownerKey : res.me.vai_tro === 'quan_ly' ? 'manager|' + res.me.ten + '|' : null;
      try { localStorage.setItem('homeServerUser', JSON.stringify({ id: res.me.id, vai_tro: res.me.vai_tro, ten: res.me.ten, phone: res.me.so_dien_thoai })); } catch (e) {}
      // Tải dữ liệu thật về máy rồi mở lại app ở chế độ dữ liệu thật
      var fail = function (text) {
        try { localStorage.removeItem('homeServerUser'); } catch (e) {}
        if (btn) btn.disabled = false;
        window.HOME_DB.signOut();
        if (typeof appToast === 'function') appToast(text);
      };
      var whichRoom = res.me.vai_tro === 'khach' ? window.HOME_DB.myRoom(res.me.id) : Promise.resolve({});
      whichRoom.then(function (place) {
        if (place.error) return fail('Chưa tải được dữ liệu từ máy chủ: ' + place.error);
        if (res.me.vai_tro === 'khach') {
          if (!place.room) return fail('Tài khoản chưa được gắn với phòng nào. Liên hệ quản lý.');
          roleKey = 'tenant|' + res.me.ten + '|' + place.room;
        }
        window.HOME_DB.pullAll().then(function (p) {
          if (p.error) return fail('Chưa tải được dữ liệu từ máy chủ: ' + p.error);
          try { sessionStorage.setItem('homeRealToast', 'Đã tải dữ liệu: ' + p.houses + ' căn · ' + p.rooms + ' phòng'); } catch (e) {}
          try { localStorage.setItem('homeAppSignedIn', '1'); localStorage.removeItem('homeSignedOut'); localStorage.setItem('homeAccount', roleKey); } catch (e) {}
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
    window.HOME_DB.saveAccount({ phoneKey: phoneKey(phone, '84'), name: user.name, role: vaiTro, password: pw }).then(function (r) {
      if (!r || r.error) toast('Máy chủ chưa tạo được tài khoản: ' + ((r && r.error) || 'lỗi không rõ'));
      else {
        toast(r.da_co ? 'Đã đặt lại mật khẩu trên máy chủ cho ' + user.name : 'Đã tạo tài khoản trên máy chủ cho ' + user.name);
        // Ghi lại mã trên máy chủ, để phân công của người này gửi lên được
        var list = readUsers(), target = list.find(function (u) { return u.key === key; });
        if (target && r.id && !target.uuid) { target.uuid = r.id; saveUsers(list); }
        if (r.id && vaiTro === 'khach' && user.room) window.HOME_DB.linkTenantRoom(r.id, user.room).then(function (l) { if (l.error) toast('Chưa gắn được khách vào phòng: ' + l.error); });
      }
    });
    return result;
  };
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
      if (snapshot() !== before || p.changed) location.reload();
    });
  }
  setTimeout(refresh, 1500);
})();
