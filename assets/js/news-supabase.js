(() => {
  "use strict";

  const client = window.thermxSupabase;
  const config = window.THERMX_SUPABASE || {};
  const bucket = config.newsBucket || "news-images";

  const el = (id) => document.getElementById(id);
  const grid = el("news-grid");
  const manageList = el("manage-list");
  const panel = el("admin-panel");
  const openBtn = el("open-admin-btn");
  const logoutBtn = el("admin-logout-btn");
  const closeBtn = el("close-admin-btn");
  const backdrop = el("login-backdrop");
  const emailInput = el("admin-email-input");
  const passwordInput = el("admin-password-input");
  const passwordToggleBtn = el("password-toggle-btn");
  const loginBtn = el("submit-login-btn");
  const cancelLoginBtn = el("cancel-login-btn");
  const loginError = el("login-error");
  const adminUserNote = el("admin-user-note");
  const form = el("admin-news-form");
  const imageInput = el("news-image");
  const preview = el("image-preview");
  const dateInput = el("news-date");
  const statusBox = el("form-status");
  const cancelEditBtn = el("cancel-edit-btn");
  const submitBtn = el("submit-news-btn");

  let currentUser = null;
  let adminPosts = [];
  let editingPost = null;
  let selectedImageFile = null;
  let objectPreviewUrl = null;

  const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[char]);

  const formatDate = (value) => {
    if (!value) return "Not published";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-IN", {
      day: "2-digit", month: "short", year: "numeric"
    });
  };

  const toDateInput = (value) => {
    if (!value) return new Date().toISOString().slice(0, 10);
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? new Date().toISOString().slice(0, 10) : date.toISOString().slice(0, 10);
  };

  const slugify = (value) => String(value)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || "news-update";

  const isAllowedAdmin = (user) => {
    const ids = Array.isArray(config.adminUserIds) ? config.adminUserIds : [];
    return Boolean(user && (ids.length === 0 || ids.includes(user.id)));
  };

  const setStatus = (message, type = "normal") => {
    statusBox.textContent = message;
    statusBox.classList.remove("form-status-success", "form-status-error");
    if (type === "success") statusBox.classList.add("form-status-success");
    if (type === "error") statusBox.classList.add("form-status-error");
  };

  const setBusy = (busy, label = "Saving…") => {
    submitBtn.disabled = busy;
    submitBtn.textContent = busy ? label : (editingPost ? "Update News →" : "Save News →");
  };

  const publicEmpty = (title, message) => {
    grid.innerHTML = `<div class="news-empty"><div><div class="news-empty-icon">N</div><h3>${escapeHtml(title)}</h3><p>${escapeHtml(message)}</p></div></div>`;
  };

  const resetPreviewUrl = () => {
    if (objectPreviewUrl) URL.revokeObjectURL(objectPreviewUrl);
    objectPreviewUrl = null;
  };

  const showPreview = (src, alt = "News image preview") => {
    preview.innerHTML = src ? `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}">` : "Image preview";
  };

  function resetForm() {
    editingPost = null;
    selectedImageFile = null;
    resetPreviewUrl();
    form.reset();
    dateInput.value = new Date().toISOString().slice(0, 10);
    el("news-status").value = "published";
    showPreview("");
    cancelEditBtn.style.display = "none";
    submitBtn.textContent = "Save News →";
    setStatus("Save a draft or publish a company update. Select an existing post from the right column to edit it.");
  }

  function setAdminPanel(open) {
    document.body.classList.toggle("news-admin-open", open);
    panel.classList.toggle("is-open", open);
    panel.setAttribute("aria-hidden", String(!open));
    if (open) {
      loadAdminPosts();
      panel.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      resetForm();
    }
  }

  function openLogin() {
    loginError.textContent = "";
    const storedEmail = localStorage.getItem("thermx_news_admin_email") || "";
    emailInput.value = currentUser?.email || storedEmail;
    passwordInput.value = "";
    adminUserNote.classList.toggle("is-visible", Boolean(currentUser?.email));
    adminUserNote.textContent = currentUser?.email ? `Signed in as ${currentUser.email}` : "";
    backdrop.classList.add("is-open");
    setTimeout(() => (emailInput.value ? passwordInput : emailInput).focus(), 80);
  }

  function closeLogin() {
    backdrop.classList.remove("is-open");
    loginError.textContent = "";
  }

  async function loadPublicPosts() {
    if (!client) {
      publicEmpty("Connection unavailable", "Supabase could not be loaded. Check the internet connection and try again.");
      return;
    }

    grid.innerHTML = '<div class="news-loading">Loading official updates…</div>';
    const { data, error } = await client
      .from("news_posts")
      .select("id,title,slug,summary,content,category,cover_image_url,image_alt,published_at,is_featured")
      .eq("status", "published")
      .lte("published_at", new Date().toISOString())
      .order("is_featured", { ascending: false })
      .order("published_at", { ascending: false });

    if (error) {
      console.error("Public news load failed:", error);
      publicEmpty("Unable to load news", "Please refresh the page after a moment.");
      return;
    }

    if (!data?.length) {
      publicEmpty("No News Published Yet", "Official Therm-X announcements will appear here after they are published.");
      return;
    }

    grid.innerHTML = data.map((post) => {
      const excerpt = post.summary?.trim() || post.content?.trim().slice(0, 230) || "";
      const image = post.cover_image_url
        ? `<div class="news-card-image"><img src="${escapeHtml(post.cover_image_url)}" alt="${escapeHtml(post.image_alt || post.title)}" loading="lazy"></div>`
        : '<div class="news-card-image no-image">TX</div>';
      return `<article class="news-card reveal visible">
        ${image}
        <div class="news-card-body">
          <div class="news-card-meta"><span class="news-type">${escapeHtml(post.category)}</span><time class="news-date">${escapeHtml(formatDate(post.published_at))}</time></div>
          <h3><a href="news-details.html?slug=${encodeURIComponent(post.slug)}">${escapeHtml(post.title)}</a></h3>
          <div class="news-scroll-content">${escapeHtml(excerpt)}</div>
          <a class="news-readmore" href="news-details.html?slug=${encodeURIComponent(post.slug)}">Read full update →</a>
        </div>
      </article>`;
    }).join("");
  }

  async function loadAdminPosts() {
    if (!currentUser || !isAllowedAdmin(currentUser)) return;
    manageList.innerHTML = '<div class="empty-manage">Loading saved news…</div>';

    const { data, error } = await client
      .from("news_posts")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Admin news load failed:", error);
      manageList.innerHTML = `<div class="empty-manage">${escapeHtml(error.message)}</div>`;
      return;
    }

    adminPosts = data || [];
    if (!adminPosts.length) {
      manageList.innerHTML = '<div class="empty-manage">No saved news yet. Create the first update from the left column.</div>';
      return;
    }

    manageList.innerHTML = adminPosts.map((post) => {
      const image = post.cover_image_url ? `<img src="${escapeHtml(post.cover_image_url)}" alt="${escapeHtml(post.image_alt || post.title)}">` : "";
      const statusClass = post.status === "published" ? "published" : "draft";
      return `<div class="manage-item" data-id="${escapeHtml(post.id)}">
        <div class="manage-thumb">${image}</div>
        <div>
          <h4>${escapeHtml(post.title)}</h4>
          <div class="manage-meta">${escapeHtml(post.category)} • ${escapeHtml(formatDate(post.published_at || post.created_at))}<span class="manage-status ${statusClass}">${escapeHtml(post.status)}</span></div>
          <div class="manage-actions"><button class="edit-btn" type="button">Edit</button><button class="delete-btn" type="button">Delete</button></div>
        </div>
      </div>`;
    }).join("");
  }

  async function compressImage(file) {
    if (!file) return null;
    if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) throw new Error("Choose a JPG, PNG, or WebP image.");

    const bitmap = await createImageBitmap(file);
    const maxWidth = 1600;
    const maxHeight = 1000;
    const ratio = Math.min(1, maxWidth / bitmap.width, maxHeight / bitmap.height);
    const width = Math.max(1, Math.round(bitmap.width * ratio));
    const height = Math.max(1, Math.round(bitmap.height * ratio));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: false });
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", 0.84));
    if (!blob) throw new Error("The image could not be processed.");
    if (blob.size > 5 * 1024 * 1024) throw new Error("The processed image is larger than 5 MB.");
    return blob;
  }

  async function uploadImage(file) {
    const blob = await compressImage(file);
    const path = `posts/${crypto.randomUUID()}.webp`;
    const { error } = await client.storage.from(bucket).upload(path, blob, {
      contentType: "image/webp",
      cacheControl: "3600",
      upsert: false
    });
    if (error) throw error;
    const { data } = client.storage.from(bucket).getPublicUrl(path);
    return { path, url: data.publicUrl };
  }

  async function login() {
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    if (!email || !password) {
      loginError.textContent = "Enter the administrator email and password.";
      return;
    }

    loginBtn.disabled = true;
    loginBtn.textContent = "Signing in…";
    loginError.textContent = "";

    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) {
      loginError.textContent = error.message;
      loginBtn.disabled = false;
      loginBtn.textContent = "Secure Login →";
      return;
    }

    if (!isAllowedAdmin(data.user)) {
      await client.auth.signOut();
      loginError.textContent = "This account is not authorized to manage Therm-X news.";
      loginBtn.disabled = false;
      loginBtn.textContent = "Secure Login →";
      return;
    }

    currentUser = data.user;
    localStorage.setItem("thermx_news_admin_email", email);
    openBtn.textContent = "Admin ✓";
    closeLogin();
    setAdminPanel(true);
    loginBtn.disabled = false;
    loginBtn.textContent = "Secure Login →";
  }

  async function savePost(event) {
    event.preventDefault();
    if (!currentUser || !isAllowedAdmin(currentUser)) {
      setStatus("Administrator authentication is required.", "error");
      openLogin();
      return;
    }

    const title = el("news-title").value.trim();
    const category = el("news-type").value;
    const status = el("news-status").value;
    const date = dateInput.value;
    const summary = el("news-summary").value.trim();
    const content = el("news-content").value.trim();
    const imageAlt = el("news-image-alt").value.trim() || title;
    const featured = el("news-featured").checked;

    if (!title || !category || !content || !date) {
      setStatus("Complete all required fields.", "error");
      return;
    }
    if (!editingPost && !selectedImageFile) {
      setStatus("Choose a news image before saving the first version.", "error");
      return;
    }

    setBusy(true, editingPost ? "Updating…" : "Saving…");
    setStatus("Uploading image and saving the news post…");

    let newImage = null;
    try {
      if (selectedImageFile) newImage = await uploadImage(selectedImageFile);
      const publishedAt = status === "published" ? new Date(`${date}T12:00:00`).toISOString() : null;
      const payload = {
        title,
        summary,
        content,
        category,
        image_alt: imageAlt,
        status,
        is_featured: featured,
        published_at: publishedAt,
        author_name: "Therm-X Innovations"
      };

      if (newImage) {
        payload.cover_image_url = newImage.url;
        payload.cover_image_path = newImage.path;
      }

      let error;
      if (editingPost) {
        ({ error } = await client.from("news_posts").update(payload).eq("id", editingPost.id));
      } else {
        payload.slug = `${slugify(title)}-${Date.now().toString(36)}`;
        payload.created_by = currentUser.id;
        ({ error } = await client.from("news_posts").insert(payload));
      }
      if (error) throw error;

      if (editingPost && newImage && editingPost.cover_image_path && editingPost.cover_image_path !== newImage.path) {
        const { error: removeError } = await client.storage.from(bucket).remove([editingPost.cover_image_path]);
        if (removeError) console.warn("Old image cleanup failed:", removeError);
      }

      const successMessage = editingPost ? "News updated successfully." : (status === "draft" ? "Draft saved successfully." : "News published successfully.");
      await Promise.all([loadPublicPosts(), loadAdminPosts()]);
      resetForm();
      setStatus(successMessage, "success");
      panel.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      console.error("Save failed:", error);
      if (newImage?.path) await client.storage.from(bucket).remove([newImage.path]);
      setStatus(error.message || "The news post could not be saved.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function deletePost(post) {
    if (!confirm(`Delete “${post.title}”? This cannot be undone.`)) return;
    const { error } = await client.from("news_posts").delete().eq("id", post.id);
    if (error) {
      setStatus(error.message, "error");
      return;
    }
    if (post.cover_image_path) {
      const { error: imageError } = await client.storage.from(bucket).remove([post.cover_image_path]);
      if (imageError) console.warn("Image cleanup failed:", imageError);
    }
    if (editingPost?.id === post.id) resetForm();
    setStatus("News post deleted.", "success");
    await Promise.all([loadPublicPosts(), loadAdminPosts()]);
  }

  function editPost(post) {
    editingPost = post;
    selectedImageFile = null;
    resetPreviewUrl();
    el("news-title").value = post.title || "";
    el("news-type").value = post.category || "Company News";
    el("news-status").value = post.status || "draft";
    dateInput.value = toDateInput(post.published_at || post.created_at);
    el("news-summary").value = post.summary || "";
    el("news-content").value = post.content || "";
    el("news-image-alt").value = post.image_alt || "";
    el("news-featured").checked = Boolean(post.is_featured);
    showPreview(post.cover_image_url || "", post.image_alt || post.title);
    cancelEditBtn.style.display = "inline-flex";
    submitBtn.textContent = "Update News →";
    setStatus("Editing the selected Supabase news post. Save to apply the changes.");
    panel.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  openBtn.addEventListener("click", () => {
    if (currentUser && isAllowedAdmin(currentUser)) setAdminPanel(true);
    else openLogin();
  });
  closeBtn.addEventListener("click", () => setAdminPanel(false));
  cancelLoginBtn.addEventListener("click", closeLogin);
  backdrop.addEventListener("click", (event) => { if (event.target === backdrop) closeLogin(); });
  document.addEventListener("keydown", (event) => { if (event.key === "Escape" && backdrop.classList.contains("is-open")) closeLogin(); });
  passwordToggleBtn.addEventListener("click", () => {
    const visible = passwordInput.type === "text";
    passwordInput.type = visible ? "password" : "text";
    passwordToggleBtn.textContent = visible ? "Show" : "Hide";
  });
  passwordInput.addEventListener("keydown", (event) => { if (event.key === "Enter") login(); });
  loginBtn.addEventListener("click", login);
  logoutBtn.addEventListener("click", async () => {
    await client.auth.signOut();
    currentUser = null;
    openBtn.textContent = "Admin";
    setAdminPanel(false);
  });
  imageInput.addEventListener("change", () => {
    const file = imageInput.files?.[0];
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) {
      setStatus("Choose a JPG, PNG, or WebP image.", "error");
      imageInput.value = "";
      return;
    }
    selectedImageFile = file;
    resetPreviewUrl();
    objectPreviewUrl = URL.createObjectURL(file);
    showPreview(objectPreviewUrl, file.name);
    setStatus("Image selected. It will be compressed and uploaded when the post is saved.");
  });
  form.addEventListener("submit", savePost);
  cancelEditBtn.addEventListener("click", resetForm);
  manageList.addEventListener("click", (event) => {
    const item = event.target.closest(".manage-item");
    if (!item) return;
    const post = adminPosts.find((entry) => entry.id === item.dataset.id);
    if (!post) return;
    if (event.target.closest(".edit-btn")) editPost(post);
    if (event.target.closest(".delete-btn")) deletePost(post);
  });

  async function initialize() {
    dateInput.value = new Date().toISOString().slice(0, 10);
    if (!client) {
      publicEmpty("Connection unavailable", "Supabase could not be initialized.");
      return;
    }
    await loadPublicPosts();
    const { data: { session } } = await client.auth.getSession();
    if (session?.user && isAllowedAdmin(session.user)) {
      currentUser = session.user;
      openBtn.textContent = "Admin ✓";
    } else if (session?.user) {
      await client.auth.signOut();
    }
    client.auth.onAuthStateChange((_event, sessionState) => {
      if (sessionState?.user && isAllowedAdmin(sessionState.user)) {
        currentUser = sessionState.user;
        openBtn.textContent = "Admin ✓";
      } else if (!sessionState) {
        currentUser = null;
        openBtn.textContent = "Admin";
      }
    });
  }

  initialize().catch((error) => {
    console.error("News initialization failed:", error);
    publicEmpty("Unable to initialize news", "Please refresh the page after a moment.");
  });
})();
