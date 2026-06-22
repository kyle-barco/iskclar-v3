(function () {
  /* Inject spinner keyframes */
  var style = document.createElement('style');
  style.textContent = '@keyframes spin{to{transform:rotate(360deg)}}';
  document.head.appendChild(style);


  /* ── 1. Character Limits with Live Counter ───────────────── */
  document.querySelectorAll('input[maxlength], textarea[maxlength]').forEach(function (el) {
    var max = parseInt(el.getAttribute('maxlength'), 10);
    if (!max) return;

    var wrapper = document.createElement('div');
    wrapper.style.cssText = 'position:relative;';

    var counter = document.createElement('span');
    counter.className = 'char-counter';
    counter.textContent = '0/' + max;
    counter.style.cssText = 'position:absolute;bottom:6px;right:10px;font-size:11px;color:#aaa;pointer-events:none;';

    el.parentNode.insertBefore(wrapper, el);
    wrapper.appendChild(el);
    wrapper.appendChild(counter);

    function updateCounter() {
      var len = el.value.length;
      counter.textContent = len + '/' + max;
      if (len > max) {
        counter.style.color = '#c62828';
        el.style.borderColor = '#c62828';
      } else if (len > max * 0.9) {
        counter.style.color = '#f57c00';
        el.style.borderColor = '#f57c00';
      } else {
        counter.style.color = '#aaa';
        el.style.borderColor = '';
      }
    }

    el.addEventListener('input', updateCounter);
    updateCounter();
  });

  /* ── Disable submit when any field exceeds maxlength ────── */
  document.querySelectorAll('form').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      var exceeded = false;
      form.querySelectorAll('input[maxlength], textarea[maxlength]').forEach(function (el) {
        var max = parseInt(el.getAttribute('maxlength'), 10);
        if (el.value.length > max) {
          exceeded = true;
          el.style.borderColor = '#c62828';
          el.style.borderWidth = '2px';
        }
      });
      if (exceeded) {
        e.preventDefault();
        alert('Some fields exceed the maximum character limit.');
      }
    });
  });

  /* ── 2. Unsaved Changes Warning ─────────────────────────── */
  var formDirty = false;
  document.querySelectorAll('form[data-unsaved-warning]').forEach(function (form) {
    form.querySelectorAll('input, textarea, select').forEach(function (el) {
      el.addEventListener('change', function () { formDirty = true; });
      el.addEventListener('input', function () { formDirty = true; });
    });
    form.addEventListener('submit', function () { formDirty = false; });
  });

  window.addEventListener('beforeunload', function (e) {
    if (formDirty) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  /* ── 3. Confirm Action Modal (generic) ────────────────────── */
  var confirmOverlay = null;
  var confirmResolve = null;

  function createConfirmModal() {
    if (confirmOverlay) return;
    confirmOverlay = document.createElement('div');
    confirmOverlay.className = 'confirm-modal-overlay';
    confirmOverlay.style.cssText = 'display:none;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.5);z-index:9999;align-items:center;justify-content:center;';
    confirmOverlay.innerHTML =
      '<div class="confirm-modal-box" style="background:#fff;border-radius:16px;padding:28px;max-width:400px;width:90%;box-shadow:0 10px 40px rgba(0,0,0,.2);text-align:center;">' +
      '<div style="margin-bottom:12px;color:#520003;"><svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z"/><path d="M22 10v6"/><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5"/></svg></div>' +
      '<h3 style="margin:0 0 8px;font-size:18px;font-weight:700;" id="confirmTitle">Confirm</h3>' +
      '<p style="color:#888;font-size:14px;margin:0 0 20px;" id="confirmMsg">Are you sure?</p>' +
      '<div style="display:flex;gap:10px;justify-content:center;">' +
      '<button id="confirmCancelBtn" style="padding:10px 24px;border:2px solid #ccc;border-radius:10px;background:#fff;color:#888;font-weight:600;cursor:pointer;">Cancel</button>' +
      '<button id="confirmOkBtn" style="padding:10px 24px;border:none;border-radius:10px;background:#520003;color:#fff;font-weight:600;cursor:pointer;">Yes</button>' +
      '</div></div>';
    document.body.appendChild(confirmOverlay);

    document.getElementById('confirmCancelBtn').addEventListener('click', function () {
      confirmOverlay.style.display = 'none';
      if (confirmResolve) confirmResolve(false);
    });
    document.getElementById('confirmOkBtn').addEventListener('click', function () {
      confirmOverlay.style.display = 'none';
      if (confirmResolve) confirmResolve(true);
    });
    confirmOverlay.addEventListener('click', function (e) {
      if (e.target === confirmOverlay) {
        confirmOverlay.style.display = 'none';
        if (confirmResolve) confirmResolve(false);
      }
    });
  }

  window.confirmAction = function (msg, title) {
    createConfirmModal();
    document.getElementById('confirmTitle').textContent = title || 'Confirm';
    document.getElementById('confirmMsg').textContent = msg || 'Are you sure?';
    document.getElementById('confirmOkBtn').style.background = '#520003';
    confirmOverlay.style.display = 'flex';
    return new Promise(function (resolve) {
      confirmResolve = resolve;
    });
  };

  window.confirmDelete = function (msg) {
    createConfirmModal();
    document.getElementById('confirmTitle').textContent = 'Confirm Delete';
    document.getElementById('confirmMsg').textContent = msg || 'Are you sure you want to delete this item? This action cannot be undone.';
    document.getElementById('confirmOkBtn').style.background = '#c62828';
    document.getElementById('confirmOkBtn').textContent = 'Delete';
    confirmOverlay.style.display = 'flex';
    return new Promise(function (resolve) {
      confirmResolve = resolve;
    });
  };

  /* Replace confirm() in delete forms */
  document.querySelectorAll('form[data-confirm-delete]').forEach(function (form) {
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      var msg = form.getAttribute('data-confirm-delete') || 'Delete this item?';
      var confirmed = await window.confirmDelete(msg);
      if (confirmed) {
        form.submit();
      }
    });
  });

  /* Double submission prevention — disable submit button after first click */
  document.querySelectorAll('form').forEach(function (form) {
    form.addEventListener('submit', function () {
      var btns = form.querySelectorAll('button[type="submit"]');
      btns.forEach(function (btn) {
        if (btn.disabled) return;
        btn.disabled = true;
        btn.dataset.origText = btn.textContent;
        btn.innerHTML = 'Processing... <span class="spinner" style="display:inline-block;width:14px;height:14px;border:2px solid rgba(255,255,255,.3);border-top-color:#fff;border-radius:50%;animation:spin .6s linear infinite;vertical-align:middle;margin-left:4px;"></span>';
      });
    });
  });

  /* Logout confirmation */
  document.querySelectorAll('a[href="/auth/logout"]').forEach(function (link) {
    link.addEventListener('click', async function (e) {
      e.preventDefault();
      var confirmed = await window.confirmAction('Are you sure you want to logout your account?', 'Logout');
      if (confirmed) {
        window.location.href = '/auth/logout';
      }
    });
  });
})();
