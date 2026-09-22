/* Weekly cohort analytics for full Trader News page loads only. */
(function () {
  'use strict';

  var STORAGE_KEY = 'trader_news_cohort';

  function isoWeek(date) {
    var utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    var day = utc.getUTCDay() || 7;
    utc.setUTCDate(utc.getUTCDate() + 4 - day);
    var yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
    var week = Math.ceil((((utc - yearStart) / 86400000) + 1) / 7);
    return utc.getUTCFullYear() + '-W' + String(week).padStart(2, '0');
  }

  function pageType() {
    var path = window.location.pathname || '/';
    if (path === '/') return 'home';
    if (/^\/(newest|news|front|best|ask|show|jobs|past|lists)/.test(path)) return 'listing';
    if (/^\/item/.test(path)) return 'item';
    if (/^\/chat/.test(path)) return 'chat';
    if (/^\/user/.test(path)) return 'profile';
    return 'other';
  }

  function readCohort() {
    try {
      var stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'opt-out') return '';
      if (/^\d{4}-W\d{2}$/.test(stored || '')) return stored;
      var current = isoWeek(new Date());
      localStorage.setItem(STORAGE_KEY, current);
      return current;
    } catch (error) {
      return '';
    }
  }

  function sendVisit() {
    var params = new URLSearchParams();
    params.set('cohort', readCohort());
    params.set('week', isoWeek(new Date()));
    params.set('type', pageType());
    var url = '/cohort-visit?' + params.toString();

    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon(url, '');
      } else {
        fetch(url, { credentials: 'same-origin', keepalive: true }).catch(function () {});
      }
    } catch (error) {
      // Analytics failure must never affect page rendering.
    }
  }

  function wireOptOut() {
    var buttons = document.querySelectorAll('.cohort-optout');
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].addEventListener('click', function () {
        try {
          var current = localStorage.getItem(STORAGE_KEY);
          if (current === 'opt-out') {
            localStorage.setItem(STORAGE_KEY, isoWeek(new Date()));
          } else {
            localStorage.setItem(STORAGE_KEY, 'opt-out');
          }
          renderOptOutState();
        } catch (error) {
          var status = document.querySelector('.cohort-privacy-status');
          if (status) status.textContent = 'Storage is unavailable in this browser, so visits remain unattributed.';
        }
      });
    }
    renderOptOutState();
  }

  function renderOptOutState() {
    var status = document.querySelector('.cohort-privacy-status');
    var buttons = document.querySelectorAll('.cohort-optout');
    if (!status) return;

    var stored = null;
    try { stored = localStorage.getItem(STORAGE_KEY); } catch (error) {}
    if (stored === 'opt-out') {
      status.textContent = 'You are opted out. Your visits count as unattributed.';
      for (var i = 0; i < buttons.length; i++) buttons[i].textContent = 'Opt back in';
    } else if (/^\d{4}-W\d{2}$/.test(stored || '')) {
      status.textContent = 'Your first-visit week is stored locally as ' + stored + '.';
      for (var j = 0; j < buttons.length; j++) buttons[j].textContent = 'Opt out of cohort attribution';
    } else {
      status.textContent = 'No cohort is stored. Visits are unattributed.';
      for (var k = 0; k < buttons.length; k++) buttons[k].textContent = 'Start cohort attribution';
    }
  }

  function wireTableOverflow() {
    var wrappers = document.querySelectorAll('.cohort-table-scroll');
    for (var i = 0; i < wrappers.length; i++) {
      (function (tableWrap) {
        function update() {
          var overflowing = tableWrap.scrollWidth > tableWrap.clientWidth + 1;
          tableWrap.classList.toggle('has-overflow', overflowing);
          tableWrap.classList.toggle('scrolled-end', overflowing &&
            tableWrap.scrollLeft + tableWrap.clientWidth >= tableWrap.scrollWidth - 1);
        }
        update();
        tableWrap.addEventListener('scroll', update, { passive: true });
        window.addEventListener('resize', update);
      }(wrappers[i]));
    }
  }

  sendVisit();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      wireOptOut();
      wireTableOverflow();
    });
  } else {
    wireOptOut();
    wireTableOverflow();
  }
}());
