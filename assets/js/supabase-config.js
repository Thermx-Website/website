// Therm-X public Supabase browser configuration.
// The publishable key is intentionally safe for frontend use because RLS protects the data.
window.THERMX_SUPABASE = Object.freeze({
  url: "https://wnlvzucwmtsrvbqdwojw.supabase.co",
  publishableKey: "sb_publishable_ET7b0loO4MNin7lJ0sw5bA_CGVG0bda",
  newsBucket: "news-images",
  adminUserIds: ["0962a8b9-b4f1-40dc-bd13-fcb3a390125c"]
});

if (!window.supabase || typeof window.supabase.createClient !== "function") {
  console.error("Supabase JavaScript library did not load.");
} else {
  window.thermxSupabase = window.supabase.createClient(
    window.THERMX_SUPABASE.url,
    window.THERMX_SUPABASE.publishableKey,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    }
  );
}
