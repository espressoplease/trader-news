function $ (id) { return document.getElementById(id); }
function byClass (el, cl) { return el ? el.getElementsByClassName(cl) : [] }
function byTag (el, tg) { return el ? el.getElementsByTagName(tg) : [] }
function allof (cl) { return byClass(document, cl) }
function classes (el) { return (el && el.className && el.className.split(' ')) || []; }
function hasClass (el, cl) { return afind(cl, classes(el)) }
function addClass (el, cl) { if (el) { var a = classes(el); if (!afind(cl, a)) { a.unshift(cl); el.className = a.join(' ')}} }
function remClass (el, cl) { if (el) { var a = classes(el); arem(a, cl); el.className = a.join(' ') } }
function uptil (el, f) { if (el) return f(el) ? el : uptil(el.parentNode, f) }
function upclass (el, cl) { return uptil(el, function (x) { return hasClass(x, cl) }) }
function html (el) { return el ? el.innerHTML : null; }
function attr (el, name) { return el.getAttribute(name) }
function tonum (x) { var n = parseFloat(x); return isNaN(n) ? null : n }
function remEl (el) { el.parentNode.removeChild(el) }
function posf (f, a) { for (var i=0; i < a.length; i++) { if (f(a[i])) return i; } return -1; }
function apos (x, a) { return (typeof x == 'function') ? posf(x,a) : Array.prototype.indexOf.call(a,x) }
function afind (x, a) { var i = apos(x, a); return (i >= 0) ? a[i] : null; }
function acut (a, m, n) { return Array.prototype.slice.call(a, m, n) }
function aeach (fn, a) { return Array.prototype.forEach.call(a, fn) }
function arem (a, x) { var i = apos(x, a); if (i >= 0) { a.splice(i, 1); } return a; }
function alast (a) { return a[a.length - 1] }
function vis (el, on) { if (el) { (on ? remClass : addClass)(el, 'nosee') } }
function setshow (el, on) { (on ? remClass : addClass)(el, 'noshow') }
function send (url) { var req = new XMLHttpRequest(); req.open('GET', url); req.send(); }

function ind (tr) {
  var el = byClass(tr, 'ind')[0];
  return el ? tonum(attr(el, 'indent')) : null;
}

function vurl (id, how, auth, _goto) {
  return "vote?id=" + id + "&how=" + how + "&auth=" + encodeURIComponent(auth) + "&goto=" + encodeURIComponent(_goto) + "&js=t"
}

function vote (id, how, auth, _goto) {
  vis($('up_' + id), how == 'un');
  vis($('down_' + id), how == 'un');
  var unv = '';
  if (how != 'un') {
    unv = " | <a id='un_" + id + "' class='clicky' " +
      "href='" + vurl(id, 'un', auth, _goto) + "'>" +
      (how == 'up' ? 'unvote' : 'undown') + "</a>"
  }
  $('unv_' + id).innerHTML = unv;
  send(vurl(id, how, auth, _goto));
}

function nextcomm (el) {
  while (el = el.nextElementSibling) {
    if (hasClass(el, 'comtr')) return el;
  }
}

function hidekids (tr) {
  var n = ind(tr);
  while ((tr = nextcomm(tr)) && ind(tr) > n) {
    setshow(tr, false);
  }
}

function showkids (tr) {
  var m = ind(tr);
  while (tr = nextcomm(tr)) {
    var n = ind(tr);
    if (n <= m) return;
    if (n == m + 1) {
      setshow(tr, true);
      (hasClass(tr, 'coll') ? hidekids : showkids)(tr);
    }
  }
}

function toggleCollapse (id) {
  var tr = $(id), coll = !hasClass(tr, 'coll');
  collstate(tr, coll);
  (coll ? hidekids : showkids)(tr);
  if ($('logout')) {
    send('collapse?id=' + id + (coll ? '' : '&un=true'));
  }
}

function collstate (tr, coll) {
  (coll ? addClass : remClass)(tr, 'coll');
  vis(byClass(tr, 'votelinks')[0], !coll);
  setshow(byClass(tr, 'comment')[0], !coll);
  var el = byClass(tr, 'togg')[0];
  el.innerHTML = coll ? ('[' + attr(el, 'n') + ' more]') : '[–]';
}

function onop () { return attr(byTag(document,'html')[0],'op') }

function ranknum (el) {
  var s = html(el) || "";
  var a = s.match(/[0-9]+/);
  if (a) {
    return tonum(a[0]);
  }
}

var n1 = ranknum(allof('rank')[0]) || 1;

function newstory (pair) {
  if (pair) {
    var sp = alast(allof('spacer'));
    sp.insertAdjacentHTML('afterend', pair[0] + sp.outerHTML);
    fixranks();
    if (onop() == 'newest') {
      var n = ranknum(alast(allof('rank')));
      allof('morelink')[0].href = 'newest?next=' + pair[1] + '&n=' + (n + 1);
    }
  }
}

function fixranks () {
  var rks = allof('rank');
  aeach(function (rk) { rk.innerHTML = (apos(rk,rks) + n1) + '.' }, rks);
}

function moreurl () { return allof('morelink')[0].href }
function morenext () { return tonum(moreurl().split('next=')[1]) }

function hidestory (el, id) {
  for (var i=0; i < 2; i++) { remEl($(id).nextSibling) }
  remEl($(id));
  fixranks();
  var next = (onop() == 'newest' && morenext()) ? ('&next=' + morenext()) : '';
  var url = el.href.replace('hide', 'snip-story').replace('goto', 'onop');
  fetch(url + next).then(r => r.json()).then(newstory);
}

function onclick (ev) {
  var el = upclass(ev.target, 'clicky');
  if (el) {
    var u = new URL(el.href, location);
    var p = u.searchParams;
    if (u.pathname == '/vote') {
      vote(p.get('id'), p.get('how'), p.get('auth'), p.get('goto'));
    } else if (u.pathname == '/hide') {
      hidestory(el, p.get('id'));
    } else if (hasClass(el, 'togg')) {
      toggleCollapse(attr(el, 'id'));
    } else {
      $(u.hash.substring(1)).scrollIntoView({behavior: "smooth"})
    }
    ev.stopPropagation();
    ev.stopImmediatePropagation();
    ev.preventDefault();
    return false;
  }
}

document.addEventListener("click", onclick);

/* Refresh chat every 30 seconds while its page is open and visible. */
(function () {
  var chat = $('trader-chat');
  var messages = $('trader-chat-messages');
  if (!chat || !messages) return;
  var older = $('trader-chat-load-older');
  var refreshEvery = 30000, refreshTimer, countdownTimer, remaining = refreshEvery;

  function updateCountdown () {
    var label = $('trader-chat-refresh');
    if (!label) return;
    label.textContent = document.hidden ? 'Refresh paused while this tab is hidden' : 'Next refresh in ' + Math.ceil(remaining / 1000) + 's';
  }

  function renderMessage(msg, live) {
    if (msg.deleted) return null;
    var row = document.createElement('div');
    row.className = 'trader-chat-message';
    var meta = document.createElement('div');
    meta.className = 'trader-chat-meta';
    var user = document.createElement('span');
    user.textContent = msg.user + (msg.referralStars || '');
    meta.appendChild(user);
    if (live) meta.appendChild(document.createTextNode(' · live update'));
    var body = document.createElement('div');
    body.className = 'trader-chat-body';
    body.textContent = msg.text;
    row.appendChild(meta);
    row.appendChild(body);
    return row;
  }

  function refreshChat() {
    if (document.hidden) return;
    var since = attr(chat, 'data-last-id') || '0';
    fetch('/chat.json?since=' + encodeURIComponent(since), {
      credentials: 'same-origin',
      headers: {'Accept': 'application/json'}
    }).then(function (r) { return r.ok ? r.json() : null; }).then(function (data) {
      if (!data || !data.messages) return;
      aeach(function (msg) {
        var id = parseInt(msg.id, 10);
        var last = parseInt(attr(chat, 'data-last-id') || '0', 10);
        if (id > last) chat.setAttribute('data-last-id', String(id));
        var row = renderMessage(msg, true);
        if (row) messages.appendChild(row);
      }, data.messages);
    }).catch(function () {});
  }

  function loadOlderMessages () {
    if (!older || older.disabled) return;
    var before = attr(chat, 'data-oldest-id') || '0';
    older.disabled = true;
    older.textContent = 'loading older messages…';
    fetch('/chat.json?before=' + encodeURIComponent(before), {
      credentials: 'same-origin',
      headers: {'Accept': 'application/json'}
    }).then(function (r) { return r.ok ? r.json() : null; }).then(function (data) {
      if (!data || !data.messages || !data.messages.length) {
        older.textContent = 'no older messages';
        return;
      }
      var fragment = document.createDocumentFragment();
      aeach(function (msg) {
        var row = renderMessage(msg, false);
        if (row) fragment.appendChild(row);
      }, data.messages);
      messages.insertBefore(fragment, messages.firstChild);
      chat.setAttribute('data-oldest-id', String(data.messages[0].id));
      older.disabled = false;
      older.textContent = 'load older messages';
    }).catch(function () {
      older.disabled = false;
      older.textContent = 'load older messages';
    });
  }

  if (older) older.addEventListener('click', loadOlderMessages);

  function scheduleRefresh () {
    window.clearTimeout(refreshTimer);
    remaining = refreshEvery;
    updateCountdown();
    if (document.hidden) return;
    refreshTimer = window.setTimeout(function () {
      refreshChat();
      scheduleRefresh();
    }, refreshEvery);
  }

  countdownTimer = window.setInterval(function () {
    if (!document.hidden) {
      remaining = Math.max(0, remaining - 1000);
      updateCountdown();
    }
  }, 1000);
  document.addEventListener('visibilitychange', scheduleRefresh);
  scheduleRefresh();
})();
