/* Cosmetic client-side passphrase gate.
   NOTE: This only hides the UI. On a public static host the content is still
   readable in the repo and page source. Do not use for real secrets. */
(function () {
  var overlay = document.getElementById('login-overlay');
  if (!overlay) return;

  var form = document.getElementById('login-form');
  var input = document.getElementById('login-input');
  var error = document.getElementById('login-error');
  var expected = (overlay.getAttribute('data-hash') || '').toLowerCase();

  function unlock() {
    try { sessionStorage.setItem('pn_unlocked', '1'); } catch (e) {}
    document.documentElement.classList.add('pn-unlocked');
  }

  function lock() {
    try { sessionStorage.removeItem('pn_unlocked'); } catch (e) {}
    document.documentElement.classList.remove('pn-unlocked');
    if (input) { input.value = ''; setTimeout(function () { input.focus(); }, 50); }
  }

  function showError(msg) {
    if (!error) return;
    error.hidden = false;
    error.textContent = msg;
  }

  async function sha256Hex(str) {
    var data = new TextEncoder().encode(str);
    var buf = await crypto.subtle.digest('SHA-256', data);
    return Array.prototype.map
      .call(new Uint8Array(buf), function (b) { return b.toString(16).padStart(2, '0'); })
      .join('');
  }

  if (!document.documentElement.classList.contains('pn-unlocked') && input) {
    setTimeout(function () { input.focus(); }, 60);
  }

  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var value = input ? input.value : '';

      if (!window.crypto || !crypto.subtle) {
        showError('A secure context (https or localhost) is required to verify the passphrase.');
        return;
      }

      sha256Hex(value).then(function (hash) {
        if (hash === expected) {
          if (error) error.hidden = true;
          unlock();
        } else {
          showError('Incorrect passphrase \u2014 try again.');
          if (input) input.select();
        }
      });
    });
  }

  var lockBtn = document.getElementById('lock-btn');
  if (lockBtn) lockBtn.addEventListener('click', lock);
})();
