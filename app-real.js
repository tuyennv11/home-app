// Chạy NGAY TRƯỚC code demo, khi giao diện đã có: nếu đang đăng nhập tài khoản thật (máy chủ Supabase)
// thì bật chế độ dữ liệu thật — tắt dữ liệu mẫu, dùng căn / phòng đã tải từ máy chủ (homeRealHouses / homeRealRooms).
(function () {
  var me = null;
  try { me = JSON.parse(localStorage.getItem('homeServerUser') || 'null'); } catch (e) {}
  if (!me) return;
  window.HOME_REAL = true;
  // Ngăn lưu trữ riêng cho dữ liệu thật: mọi khoá "home…" / "active…" của app đọc / ghi vào "real:<khoá>".
  // Dữ liệu thử cũ trên máy giữ nguyên, không xoá, chỉ không đọc tới nữa.
  var SHARED = { homeServerUser: 1, homeRealHouses: 1, homeRealRooms: 1, homeRealRoomsBase: 1, homeRealHousesBase: 1, homeAppSignedIn: 1, homeSignedOut: 1, homeAccount: 1, homeLoginCC: 1, homeLang: 1, homeLoginFails: 1 };
  // Mỗi tài khoản một ngăn riêng, để người sau đăng nhập trên cùng máy không thấy dữ liệu của người trước.
  var PREFIX = 'real:' + String(me.id).slice(0, 8) + ':';
  function ns(key) { key = String(key); return (/^(home|active)/.test(key) && !SHARED[key]) ? PREFIX + key : key; }
  var P = Storage.prototype, g = P.getItem, st = P.setItem, rm = P.removeItem;
  // Code demo ghi danh sách phòng / căn vào homeAdditionalRooms / homeProperties → chuyển sang bản sao thật
  // và báo để gửi lên máy chủ (app/src/sync.js).
  var REDIRECT = { homeAdditionalRooms: 'homeRealRooms', homeProperties: 'homeRealHouses' };
  function target(k) { return REDIRECT[k] || ns(k); }
  // Các khoá này đổi thì gửi người dùng / phân công lên máy chủ. Code demo ghi lại cả khi không đổi nên phải so trước.
  var WATCH = { homeUsers: 1, homePropertyManagers: 1, homeRoomManagers: 1 };
  var DATA = {};
  ('homeUserHistory homeTenantEvents homeContracts homeRoomInventories homeRoomStatuses homeRoomUtilityBilling homeRoomUtilityOverride homeMeterReadings homeCheckouts homeMoveOutRequests homeRentCharges homeInventoryRecords homeTenantInvites homeGuestStays homeRoomHolds homeComplaints homeViolations homeNotices homeExpenseRecords homeCashExtras homeSpendRequests homeMaintenancePlans homeRoomApprovalRequests homeTenantCredits homeDeleteRequests homeSettlements homeActionStates homeManagerRates homeHouseSettings homeAmenityCatalog homeDeletedRooms homeRoomManagerLog').split(' ').forEach(function (k) { DATA[k] = 1; });
  P.getItem = function (k) { return g.call(this, this === localStorage ? target(k) : k); };
  P.setItem = function (k, v) {
    if (this !== localStorage) return st.call(this, k, v);
    var t = target(k), same = g.call(this, t) === String(v), r = st.call(this, t, v), changed = WATCH[k] && !same;
    if (DATA[k] && !same) { try { window.dispatchEvent(new Event('home-real-data')); } catch (e) {} }
    if (changed) { try { window.dispatchEvent(new Event('home-real-people')); } catch (e) {} }
    if (REDIRECT[k]) { window.__homeRealDirty = true; try { window.dispatchEvent(new Event('home-real-write')); } catch (e) {} }
    return r;
  };
  P.removeItem = function (k) {
    var r = rm.call(this, this === localStorage ? target(k) : k);
    if (this === localStorage && DATA[k]) { try { window.dispatchEvent(new Event('home-real-data')); } catch (e) {} }
    return r;
  };
  // Người không phải chủ nhà: bỏ lựa chọn chủ nhà, để app không thể rơi về vai chủ nhà
  var select = document.getElementById('accountSelect'), account = localStorage.getItem('homeAccount') || '';
  if (select && me.vai_tro !== 'chu_nha') {
    var ownerGroup = select.querySelector('optgroup[label="Chủ nhà"]');
    if (ownerGroup) ownerGroup.remove();
    if (account && !Array.prototype.some.call(select.options, function (o) { return o.value === account; })) {
      var option = document.createElement('option'); option.value = account; option.textContent = me.ten || account; select.append(option);
    }
  }
  // Bỏ 7 ô phòng mẫu viết sẵn trong giao diện
  document.querySelectorAll('#rooms > .room').forEach(function (card) { card.remove(); });
  // Bỏ các dòng việc mẫu viết sẵn trong trang Tổng quan
  document.querySelectorAll('#home .list > .row').forEach(function (row) { row.remove(); });
  // Căn đang xem phải là căn thật
  try {
    var houses = JSON.parse(localStorage.getItem('homeRealHouses') || '[]');
    var active = localStorage.getItem('activeHomePropertyId');
    if (houses.length && !houses.some(function (h) { return h.id === active; })) {
      localStorage.setItem('activeHomePropertyId', houses[0].id);
      localStorage.setItem('homeProperty', JSON.stringify(houses[0]));
    }
  } catch (e) {}
})();
