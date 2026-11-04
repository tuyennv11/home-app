// Cấu hình kết nối Supabase của app thật (dự án home-prod, Singapore).
// Khoá "publishable" được phép nằm trong app: quyền đọc / ghi do luật phân quyền (RLS) trên máy chủ giữ.
// TUYỆT ĐỐI không đặt khoá "secret" / "service_role" vào đây.
window.HOME_SUPABASE = {
  url: 'https://fcsyfsbmpefqtbccaylm.supabase.co',
  publishableKey: 'sb_publishable_4F5g7ChsozGFaI6XRHf6BQ_bG6gIyTx',
  // Android đã có Firebase (google-services.json, dự án home-thu): bật nhận thông báo đẩy
  pushAndroid: true
};
