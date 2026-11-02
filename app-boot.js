// Chạy trước code demo: bật chế độ app thật (toàn màn hình, bắt buộc đăng nhập).
(function () {
  document.documentElement.classList.add('app-mode');
  window.HOME_APP_MODE = true;
  try {
    // App thật luôn mở trang đăng nhập nếu chưa đăng nhập trên máy này.
    // Mất thông tin tài khoản máy chủ cũng vậy, không bao giờ rơi về dữ liệu mẫu.
    if (!localStorage.getItem('homeServerUser')) {
      localStorage.removeItem('homeAppSignedIn');
      localStorage.setItem('homeSignedOut', '1');
    }
  } catch (e) {}
})();
