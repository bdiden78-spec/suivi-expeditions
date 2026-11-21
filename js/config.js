// Clé anon : sans danger TANT QUE setup.sql est exécuté (RLS activée).
const SUPABASE_URL = "https://hswchbamojtmpystcuea.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhzd2NoYmFtb2p0bXB5c3RjdWVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI2MTc1MzIsImV4cCI6MjEwODE5MzUzMn0.6RUytS5zJEmlK9MBcJuHZ6G32RV63kShes2fNGf0_sU";

// Récupération instantanée et synchrone de la session locale (immunisée contre les blocages navigator.locks)
function getLogiTrakSession() {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (/^sb-.*-auth-token$/.test(k)) {
        const v = JSON.parse(localStorage.getItem(k));
        if (v && ((v.user && v.user.email) || (v.currentSession && v.currentSession.user && v.currentSession.user.email))) {
          return v.currentSession || v;
        }
      }
    }
  } catch (e) {}
  return null;
}
window.getLogiTrakSession = getLogiTrakSession;

// Client Supabase optimisé haute vitesse (singleton partagé pour éviter les GoTrueClient multiples)
let _sharedLogiTrakClient = null;
function getLogiTrakClient(url, key) {
  const u = url || localStorage.getItem('supabase_url') || SUPABASE_URL;
  const k = key || localStorage.getItem('supabase_key') || SUPABASE_ANON;
  if (!window.supabase) return null;
  if (_sharedLogiTrakClient && _sharedLogiTrakClient._lt_url === u && _sharedLogiTrakClient._lt_key === k) {
    return _sharedLogiTrakClient;
  }
  try {
    _sharedLogiTrakClient = window.supabase.createClient(u, k, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false
      }
    });
    _sharedLogiTrakClient._lt_url = u;
    _sharedLogiTrakClient._lt_key = k;
    return _sharedLogiTrakClient;
  } catch (e) {
    _sharedLogiTrakClient = window.supabase.createClient(u, k);
    _sharedLogiTrakClient._lt_url = u;
    _sharedLogiTrakClient._lt_key = k;
    return _sharedLogiTrakClient;
  }
}
window.getLogiTrakClient = getLogiTrakClient;
