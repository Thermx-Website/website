(() => {
  'use strict';

  const form = document.getElementById('contact-enquiry-form');
  if (!form) return;

  const filesInput = document.getElementById('contact-files');
  const attachmentStatus = document.getElementById('attachment-status');
  const primaryStatus = attachmentStatus?.querySelector('.attachment-primary');
  const attachmentList = document.getElementById('attachment-list');
  const clearButton = document.getElementById('attachment-clear');
  const messageShell = document.querySelector('.message-shell');
  const submitButton = form.querySelector('button[type="submit"]');
  const formStatus = document.getElementById('contact-form-status');

  const MAX_FILES = 3;
  const MAX_FILE_BYTES = 3 * 1024 * 1024;
  const MAX_TOTAL_BYTES = 7 * 1024 * 1024;
  const ALLOWED_TYPES = new Set([
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/zip',
    'text/plain'
  ]);

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

  function renderFiles(fileList) {
    const files = [...(fileList || [])];
    if (attachmentList) attachmentList.innerHTML = '';

    if (!files.length) {
      if (primaryStatus) primaryStatus.textContent = 'No files added';
      attachmentStatus?.classList.remove('has-file');
      clearButton?.classList.remove('show');
      return;
    }

    if (primaryStatus) {
      primaryStatus.textContent = files.length === 1
        ? files[0].name
        : `${files.length} files selected`;
    }

    files.forEach((file) => {
      const item = document.createElement('li');
      item.textContent = `${file.name} (${formatBytes(file.size)})`;
      attachmentList?.appendChild(item);
    });

    attachmentStatus?.classList.add('has-file');
    clearButton?.classList.add('show');
  }

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
    if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function validateFiles(files) {
    if (files.length > MAX_FILES) {
      throw new Error(`You can attach a maximum of ${MAX_FILES} files.`);
    }

    let totalSize = 0;
    for (const file of files) {
      totalSize += file.size;
      if (file.size > MAX_FILE_BYTES) {
        throw new Error(`${file.name} exceeds the 3 MB file limit.`);
      }
      if (file.type && !ALLOWED_TYPES.has(file.type)) {
        throw new Error(`${file.name} is not an allowed file type.`);
      }
    }

    if (totalSize > MAX_TOTAL_BYTES) {
      throw new Error('The total attachment size must be 7 MB or less.');
    }
  }

  async function fileToBase64(file) {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const chunkSize = 0x8000;
    let binary = '';

    for (let index = 0; index < bytes.length; index += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
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

  filesInput?.addEventListener('change', () => {
    setFormStatus('');
    renderFiles(filesInput.files);
  });

  clearButton?.addEventListener('click', () => {
    if (filesInput) filesInput.value = '';
    renderFiles([]);
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

      if (type === 'drop' && event.dataTransfer?.files?.length && filesInput) {
        const transfer = new DataTransfer();
        [...event.dataTransfer.files].slice(0, MAX_FILES).forEach((file) => transfer.items.add(file));
        filesInput.files = transfer.files;
        renderFiles(filesInput.files);
      }

      messageShell.classList.remove('is-dragover');
    });
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    setFormStatus('');

    if (!form.reportValidity()) return;

    const client = window.thermxSupabase;
    if (!client) {
      setFormStatus('The enquiry service is not available. Please try again shortly.', 'error');
      return;
    }

    const formData = new FormData(form);
    const files = [...(filesInput?.files || [])];

    try {
      validateFiles(files);
      setSubmitting(true);
      setFormStatus('Sending your enquiry securely…', 'sending');

      const attachments = await prepareAttachments(files);
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

      const { data, error } = await client.functions.invoke('send-contact-email', {
        body: payload
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Unable to send the enquiry.');

      form.reset();
      renderFiles([]);
      setFormStatus('Your enquiry was sent successfully. Our team will contact you soon.', 'success');
    } catch (error) {
      console.error('Contact enquiry error:', error);
      const message = error?.message || 'Unable to send the enquiry. Please try again.';
      setFormStatus(message, 'error');
    } finally {
      setSubmitting(false);
    }
  });

  renderFiles([]);
})();
