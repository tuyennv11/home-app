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
    [/^ngày (\d+) hằng tháng$/i, function (m) { return EN ? 'Day ' + m[1] + ' of each month' : 'ថ្ងៃទី ' + m[1] + ' រៀងរាល់ខែ'; }]
  ];
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
      var known = exact.get(head) || dict.get(head.toLocaleLowerCase('vi'));
      if (known && rest.length <= 3 && /^[\p{Lu}\d$+]/u.test(rest[0])) return known + ' ' + rest.join(' ');
    }
    return null;
  }
  function translate(raw) {
    if (!raw || !VI.test(raw)) return null;
    var lead = raw.match(/^[\s＋+⌂⚙◷▦›‹·　]*/)[0], tail = raw.match(/[\s:.?!›·　]*$/)[0];
    var core = raw.slice(lead.length, raw.length - tail.length);
    if (!core) return null;
    var parts = core.split(/( · |\. )/), changed = false;
    var out = parts.map(function (part, i) { if (i % 2) return part; var t = one(part); if (t) changed = true; return t || part; });
    return changed ? lead + out.join('') + tail : null;
  }
  var original = new WeakMap(), ATTRS = ['placeholder', 'title', 'aria-label'];
  function skip(node) {
    var el = node.nodeType === 1 ? node : node.parentElement;
    return !el || el.closest('#loginScreen,script,style,textarea,select.account-select,.account-panel');
  }
  function fixText(node) {
    if (skip(node)) return;
    var saved = original.get(node), now = node.data;
    if (saved && saved.shown === now) return;
    var result = translate(now);
    if (result) { original.set(node, { vi: now, shown: result }); busy = true; node.data = result; }
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
    new MutationObserver(function (list) {
      list.forEach(function (m) {
        if (m.type === 'characterData') return fixText(m.target);
        if (m.type === 'attributes') return fixAttrs(m.target);
        m.addedNodes.forEach(walk);
      });
    }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
})();
