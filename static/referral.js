(function () {
  function setStatus (panel, message) {
    var status = panel.getElementsByClassName('referral-action-status')[0];
    if (!status) return;
    status.textContent = message;
    if (panel._referralStatusTimer) window.clearTimeout(panel._referralStatusTimer);
    if (message) {
      panel._referralStatusTimer = window.setTimeout(function () {
        status.textContent = '';
      }, 3500);
    }
  }

  function fallbackCopy (value) {
    var input = document.createElement('textarea');
    input.value = value;
    input.setAttribute('readonly', '');
    input.style.position = 'fixed';
    input.style.left = '-9999px';
    document.body.appendChild(input);
    input.select();
    var copied = false;
    try { copied = document.execCommand('copy'); } catch (error) { copied = false; }
    document.body.removeChild(input);
    return copied;
  }

  function copyLink (panel, value) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(value).then(function () {
        setStatus(panel, 'Link copied');
      }, function () {
        setStatus(panel, fallbackCopy(value) ? 'Link copied' : 'Copy failed, select the link');
      });
    } else {
      setStatus(panel, fallbackCopy(value) ? 'Link copied' : 'Copy failed, select the link');
    }
  }

  function shareLink (panel, value) {
    if (navigator.share) {
      navigator.share({
        title: 'Trader News',
        text: 'Join me on Trader News',
        url: value
      }).then(function () {
        setStatus(panel, 'Share sheet opened');
      }, function (error) {
        if (!error || error.name !== 'AbortError') setStatus(panel, 'Share cancelled');
      });
    } else {
      copyLink(panel, value);
    }
  }

  function init () {
    var panels = document.getElementsByClassName('referral-link-card');
    for (var i = 0; i < panels.length; i++) {
      (function (panel) {
        var copy = panel.getElementsByClassName('referral-copy')[0];
        var share = panel.getElementsByClassName('referral-share')[0];
        var value = copy && copy.getAttribute('data-referral-url');
        if (!value) return;
        if (copy) copy.addEventListener('click', function () { copyLink(panel, value); });
        if (share) share.addEventListener('click', function () { shareLink(panel, value); });
      })(panels[i]);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
