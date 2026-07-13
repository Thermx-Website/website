(() => {
  "use strict";
  const client = window.thermxSupabase;
  const container = document.getElementById("news-detail");
  const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"})[char]);
  const formatDate = (value) => new Date(value).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });
  const showState = (title, message) => { container.innerHTML = `<div class="detail-state"><div><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p><a class="back-news" href="news.html">Back to News &amp; Updates</a></div></div>`; };

  async function loadPost() {
    if (!client) { showState("Connection unavailable", "Supabase could not be loaded."); return; }
    const slug = new URLSearchParams(window.location.search).get("slug");
    if (!slug) { showState("Update not found", "No news article was selected."); return; }
    const { data, error } = await client
      .from("news_posts")
      .select("title,summary,content,category,cover_image_url,image_alt,published_at,author_name")
      .eq("slug", slug)
      .eq("status", "published")
      .lte("published_at", new Date().toISOString())
      .maybeSingle();
    if (error || !data) { console.error(error); showState("Update not available", "This news article may have been removed, unpublished, or the link may be incorrect."); return; }
    document.title = `${data.title} | Therm-X Innovations`;
    const paragraphs = escapeHtml(data.content || "").replace(/\n{2,}/g, "</p><p>").replace(/\n/g, "<br>");
    container.innerHTML = `${data.cover_image_url ? `<img class="detail-cover" src="${escapeHtml(data.cover_image_url)}" alt="${escapeHtml(data.image_alt || data.title)}">` : ""}<div class="detail-body"><div class="detail-meta"><span class="detail-type">${escapeHtml(data.category)}</span><time class="detail-date">${escapeHtml(formatDate(data.published_at))}</time></div><h1 class="detail-title">${escapeHtml(data.title)}</h1>${data.summary ? `<p class="detail-summary">${escapeHtml(data.summary)}</p>` : ""}<div class="detail-content"><p>${paragraphs}</p></div><a class="back-news" href="news.html">← Back to all updates</a></div>`;
  }
  loadPost().catch((error) => { console.error(error); showState("Unable to load update", "Please try again after a moment."); });
})();
