(() => {
  'use strict';

  const form = document.getElementById('contact-enquiry-form');
  if (!form) return;

  const filesInput = document.getElementById('contact-files');
  const attachmentStatus = document.getElementById('attachment-status');
  const primaryStatus = attachmentStatus?.querySelector('.attachment-primary');
  const attachmentList = document.getElementById('attachment-list');
  const attachmentCount = document.getElementById('attachment-count');
  const clearButton = document.getElementById('attachment-clear');
  const messageShell = document.querySelector('.message-shell');
  const submitButton = form.querySelector('button[type="submit"]');
  const formStatus = document.getElementById('contact-form-status');

  const MAX_FILES = 3;
  const MAX_FILE_BYTES = 2 * 1024 * 1024;
  const MAX_TOTAL_BYTES = 3 * 1024 * 1024;
  const ALLOWED_TYPES = new Set([
    'application/pdf','application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/jpeg','image/png','image/webp','application/zip','text/plain'
  ]);

  let selectedFiles = [];

  function setFormStatus(message, type = '') {
    if (!formStatus) return;
    formStatus.textContent = message;
    formStatus.className = `contact-form-status${type ? ` ${type}` : ''}`;
  }

  function setSubmitting(isSubmitting) {
    if (!submitButton) return;
    submitButton.disabled = isSubmitting;
    submitButton.textContent = isSubmitting ? 'Sending…' : 'Submit Enquiry →';
    submitButton.setAttribute('aria-busy', String(isSubmitting));
  }

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
    if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function validateFiles(files) {
    if (files.length > MAX_FILES) throw new Error(`You can attach a maximum of ${MAX_FILES} files.`);
    let totalSize = 0;
    for (const file of files) {
      totalSize += file.size;
      if (file.size > MAX_FILE_BYTES) throw new Error(`${file.name} exceeds the 2 MB file limit.`);
      if (file.type && !ALLOWED_TYPES.has(file.type)) throw new Error(`${file.name} is not an allowed file type.`);
    }
    if (totalSize > MAX_TOTAL_BYTES) throw new Error('The total attachment size must be 3 MB or less.');
  }

  function syncInputFiles() {
    if (!filesInput) return;
    const transfer = new DataTransfer();
    selectedFiles.forEach((file) => transfer.items.add(file));
    filesInput.files = transfer.files;
  }

  function renderFiles() {
    if (attachmentList) attachmentList.innerHTML = '';
    const countText = `${selectedFiles.length} / ${MAX_FILES} files selected`;
    if (attachmentCount) attachmentCount.textContent = countText;
    else if (primaryStatus) primaryStatus.textContent = countText;

    selectedFiles.forEach((file, index) => {
      const item = document.createElement('li');
      item.dataset.fileNumber = String(index + 1);

      const name = document.createElement('span');
      name.className = 'attachment-file-name';
      name.textContent = `${file.name} (${formatBytes(file.size)})`;

      const removeButton = document.createElement('button');
      removeButton.type = 'button';
      removeButton.className = 'attachment-remove-btn';
      removeButton.dataset.fileIndex = String(index);
      removeButton.setAttribute('aria-label', `Remove ${file.name}`);
      removeButton.title = `Remove ${file.name}`;
      removeButton.textContent = '×';

      item.append(name, removeButton);
      attachmentList?.appendChild(item);
    });

    attachmentStatus?.classList.toggle('has-file', selectedFiles.length > 0);
    clearButton?.classList.toggle('show', selectedFiles.length > 0);
  }

  function addFiles(newFiles) {
    const incoming = [...newFiles];
    let message = '';

    for (const file of incoming) {
      if (selectedFiles.length >= MAX_FILES) {
        message = `Maximum ${MAX_FILES} files allowed.`;
        break;
      }
      const duplicate = selectedFiles.some((existing) =>
        existing.name === file.name && existing.size === file.size && existing.lastModified === file.lastModified
      );
      if (!duplicate) selectedFiles.push(file);
    }

    try {
      validateFiles(selectedFiles);
    } catch (error) {
      selectedFiles = selectedFiles.filter((file) => {
        try { validateFiles([file]); return true; } catch { return false; }
      });
      while (selectedFiles.reduce((sum, file) => sum + file.size, 0) > MAX_TOTAL_BYTES) selectedFiles.pop();
      message = error.message;
    }

    syncInputFiles();
    renderFiles();
    setFormStatus(message, message ? 'error' : '');
  }

  async function fileToBase64(file) {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let index = 0; index < bytes.length; index += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
    }
    return btoa(binary);
  }

  async function prepareAttachments(files) {
    return Promise.all(files.map(async (file) => ({
      filename: file.name,
      content: await fileToBase64(file),
      contentType: file.type || 'application/octet-stream'
    })));
  }

  const phoneInput = document.getElementById('contact-phone');
  phoneInput?.addEventListener('input', () => {
    phoneInput.value = phoneInput.value.replace(/\D/g, '').slice(0, 10);
    phoneInput.setCustomValidity(phoneInput.value.length === 10 ? '' : 'Enter exactly 10 digits.');
  });

  filesInput?.addEventListener('change', () => {
    addFiles(filesInput.files || []);
  });

  clearButton?.addEventListener('click', () => {
    selectedFiles = [];
    syncInputFiles();
    renderFiles();
    setFormStatus('');
  });

  attachmentList?.addEventListener('click', (event) => {
    const button = event.target.closest('.attachment-remove-btn');
    if (!button) return;

    const index = Number(button.dataset.fileIndex);
    if (!Number.isInteger(index) || index < 0 || index >= selectedFiles.length) return;

    selectedFiles.splice(index, 1);
    syncInputFiles();
    renderFiles();
    setFormStatus('');
  });

  ['dragenter', 'dragover'].forEach((type) => {
    messageShell?.addEventListener(type, (event) => {
      event.preventDefault();
      messageShell.classList.add('is-dragover');
    });
  });

  ['dragleave', 'drop'].forEach((type) => {
    messageShell?.addEventListener(type, (event) => {
      event.preventDefault();
      if (type === 'drop' && event.dataTransfer?.files?.length) addFiles(event.dataTransfer.files);
      messageShell.classList.remove('is-dragover');
    });
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    setFormStatus('');

    if (phoneInput) {
      phoneInput.value = phoneInput.value.replace(/\D/g, '').slice(0, 10);
      phoneInput.setCustomValidity(phoneInput.value.length === 10 ? '' : 'Enter exactly 10 digits.');
    }
    if (!form.reportValidity()) return;

    const formData = new FormData(form);

    try {
      validateFiles(selectedFiles);
      setSubmitting(true);
      setFormStatus('Sending your enquiry securely…', 'sending');
      const attachments = await prepareAttachments(selectedFiles);
      const payload = {
        name: String(formData.get('Name') || '').trim(),
        company: String(formData.get('Company') || '').trim(),
        email: String(formData.get('Email') || '').trim(),
        telephone: String(formData.get('Telephone') || '').trim(),
        requirementType: String(formData.get('Requirement Type') || '').trim(),
        description: String(formData.get('Description') || '').trim(),
        website: String(formData.get('Website') || '').trim(),
        pageUrl: window.location.href,
        attachments
      };

      const apiResponse = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await apiResponse.json().catch(() => ({}));
      if (!apiResponse.ok || !data?.success) {
        throw new Error(data?.error || 'Unable to send the enquiry.');
      }

      form.reset();
      selectedFiles = [];
      syncInputFiles();
      renderFiles();
      setFormStatus('Your enquiry was sent successfully. Our team will contact you soon.', 'success');
    } catch (error) {
      console.error('Contact enquiry error:', error);
      setFormStatus(error?.message || 'Unable to send the enquiry. Please try again.', 'error');
    } finally {
      setSubmitting(false);
    }
  });

  renderFiles();
})();
