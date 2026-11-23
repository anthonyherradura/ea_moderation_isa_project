// Plain JS client. Every piece of server or user text is rendered with
// textContent (never innerHTML), so stored chat text cannot inject markup.

const $ = (id) => document.getElementById(id);
const page = document.body.dataset.page;
let me = null;

function el(tag, text, className) {
  const node = document.createElement(tag);
  if (text != null) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function setStatus(text, isError = false) {
  if (!$('status')) return;
  $('status').textContent = text;
  $('status').className = isError ? 'error' : '';
}

/** Calls the API with the auth cookie. Returns the JSON body, or null on error. */
async function api(method, path, body) {
  setStatus(STR.loading);
  try {
    const res = await fetch(API + path, {
      method,
      credentials: 'include',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json();
    if (!res.ok) {
      if (res.status === 401 && me) showLoggedOut();
      setStatus([data.error, ...(data.details ?? [])].join(' '), true);
      return null;
    }
    setStatus('');
    return data;
  } catch {
    setStatus(STR.networkError, true);
    return null;
  }
}

// ---- Session and role routing ----------------------------------------------

function showLoggedOut() {
  me = null;
  if (page !== 'login') location.replace('index.html');
  if ($('auth')) $('auth').hidden = false;
  if ($('app')) $('app').hidden = true;
  if ($('session')) $('session').hidden = true;
}

function showUsage(used, free) {
  if (!$('usage')) return;
  $('usage').textContent = STR.usage(used, free);
  $('usage').className = used > free ? 'error' : '';
}

function showLoggedIn(user) {
  me = user;

  if (page === 'login') {
    location.replace(user.role === 'admin' ? 'admin.html' : 'player.html');
    return;
  }

  if (page === 'admin' && user.role !== 'admin') {
    location.replace('player.html');
    return;
  }

  if ($('auth')) $('auth').hidden = true;
  if ($('app')) $('app').hidden = false;
  if ($('session')) $('session').hidden = false;
  if ($('who')) $('who').textContent = `${user.email} (${user.role})`;
  showUsage(user.apiCalls, user.freeCalls);

  if ($('adminNav')) $('adminNav').hidden = user.role !== 'admin';
  if ($('chatLog')) $('chatLog').replaceChildren();
  if ($('nameResult')) $('nameResult').textContent = '';
  if ($('nameText')) $('nameText').value = '';
  if ($('chatText')) $('chatText').value = '';

  if (page === 'player') {
    if ($('reviewTitle')) {
      $('reviewTitle').textContent = isModerator() ? STR.reviewTitleAll : STR.reviewTitleMine;
    }
    loadReviews();
  } else if (page === 'admin') {
    loadStats();
  }
}

const isModerator = () => me && (me.role === 'moderator' || me.role === 'admin');
const credentials = () => ({ email: $('email').value, password: $('password').value });

if ($('authForm')) {
  $('authForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const user = await api('POST', '/auth/login', credentials());
    if (user) {
      $('password').value = '';
      showLoggedIn(user);
    }
  });
}

if ($('register')) {
  $('register').addEventListener('click', async () => {
    if (!$('authForm').reportValidity()) return;
    if ($('password').value.length < 8) return setStatus(STR.passwordTooShort, true);
    if (await api('POST', '/auth/register', credentials())) setStatus(STR.registered);
  });
}

if ($('logout')) {
  $('logout').addEventListener('click', async () => {
    await api('POST', '/auth/logout');
    showLoggedOut();
  });
}

// ---- Scoring ---------------------------------------------------------------

function scoreSummary(result) {
  const parts = [STR.decision[result.decision]];
  if (result.topLabel) parts.push(STR.score(result.topLabel, result.topScore));
  return parts.concat(result.warnings).join(' · ');
}

if ($('chatForm')) {
  $('chatForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const result = await api('POST', '/messages/score', { text: $('chatText').value });
    if (!result) return;
    $('chatText').value = '';
    const item = el('li', null, result.decision);
    item.append(el('span', result.displayText), el('small', scoreSummary(result)));
    $('chatLog').prepend(item);
    showUsage(result.usage.apiCalls, result.usage.freeCalls);
    if (result.caseId) loadReviews();
  });
}

if ($('nameForm')) {
  $('nameForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const result = await api('POST', '/usernames/check', { username: $('nameText').value });
    if (!result) return;
    $('nameResult').textContent = `${result.acceptable ? STR.nameOk : STR.nameNotOk} (${scoreSummary(result)})`;
    $('nameResult').className = result.decision;
    showUsage(result.usage.apiCalls, result.usage.freeCalls);
    if (result.caseId) loadReviews();
  });
}

// ---- Review cases ----------------------------------------------------------

function renderCase(c) {
  const card = el('article', null, `case ${c.status}`);
  const head = el('div', null, 'row spread');
  head.append(el('strong', STR.caseHeader(c)), el('span', c.status, 'badge'));
  card.append(head, el('p', c.text, 'quote'));

  const ai = [STR.aiDecision[c.aiDecision]];
  if (c.topLabel) ai.push(STR.score(c.topLabel, c.topScore));
  card.append(el('small', ai.join(' · ')));
  if (c.appealNote) card.append(el('p', STR.appealLabel + c.appealNote));
  if (c.decisionNote) card.append(el('p', STR.noteLabel + c.decisionNote));

  const actions = el('div', null, 'row');
  const patch = async (body) => (await api('PATCH', `/reviews/${c.id}`, body)) && loadReviews();

  if (isModerator()) {
    const note = el('input');
    note.placeholder = STR.notePlaceholder;
    note.maxLength = 500;
    const uphold = el('button', STR.uphold);
    const overturn = el('button', STR.overturn, 'secondary');
    uphold.onclick = () => patch({ decision: 'uphold', note: note.value });
    overturn.onclick = () => patch({ decision: 'overturn', note: note.value });
    actions.append(note, uphold, overturn);
  } else if (c.status !== 'overturned') {
    const appealText = el('input');
    appealText.placeholder = STR.appealPlaceholder;
    appealText.maxLength = 500;
    const appeal = el('button', STR.appeal);
    appeal.onclick = () => appealText.value.trim() && patch({ appealNote: appealText.value });
    actions.append(appealText, appeal);
  }
  if (c.userId === me.id || me.role === 'admin') {
    const remove = el('button', STR.remove, 'danger');
    remove.onclick = async () => (await api('DELETE', `/reviews/${c.id}`)) && loadReviews();
    actions.append(remove);
  }
  card.append(actions);
  return card;
}

async function loadReviews() {
  if (!$('reviews')) return;
  const cases = await api('GET', '/reviews');
  if (!cases) return;
  $('reviews').replaceChildren(...(cases.length ? cases.map(renderCase) : [el('p', STR.noCases, 'muted')]));
}

// ---- Admin -----------------------------------------------------------------

function fillTable(table, headers, rows) {
  if (!table) return;
  const head = el('tr');
  head.append(...headers.map((h) => el('th', h)));
  table.replaceChildren(head, ...rows.map((cells) => {
    const row = el('tr');
    row.append(...cells.map((cell) => el('td', String(cell))));
    return row;
  }));
}

async function loadStats() {
  if (!$('endpointTable')) return;
  const stats = await api('GET', '/admin/stats');
  if (!stats) return;
  fillTable($('endpointTable'), STR.endpointHeaders, stats.endpoints.map((e) => [e.method, e.endpoint, e.requests]));
  fillTable($('userTable'), STR.userHeaders, stats.users.map((u) => [u.email, u.role, u.apiCalls]));
}

// ---- Start -----------------------------------------------------------------

const pageTitles = {
  login: STR.loginPageTitle,
  player: STR.playerPageTitle,
  admin: STR.adminPageTitle,
};
document.title = pageTitles[page];

for (const [id, text] of Object.entries({
  title: STR.title, authTitle: STR.authTitle, emailLabel: STR.email, passwordLabel: STR.password,
  login: STR.login, register: STR.register, logout: STR.logout, privacy: STR.privacy,
  chatTitle: STR.chatTitle, chatSend: STR.send, nameTitle: STR.nameTitle, nameSend: STR.check,
  reviewRefresh: STR.refresh, adminTitle: STR.adminTitle, adminRefresh: STR.refresh,
  playerTitle: STR.playerTitle, playerNav: STR.playerNav, adminNav: STR.adminNav,
})) if ($(id)) $(id).textContent = text;

if ($('chatText')) $('chatText').placeholder = STR.chatPlaceholder;
if ($('nameText')) $('nameText').placeholder = STR.namePlaceholder;
if ($('reviewRefresh')) $('reviewRefresh').onclick = loadReviews;
if ($('adminRefresh')) $('adminRefresh').onclick = loadStats;

document.querySelectorAll('#navigation a[aria-disabled="true"]').forEach((link) => {
  link.addEventListener('click', (event) => event.preventDefault());
});

// Restore the session if the cookie is still valid.
fetch(`${API}/users/me`, { credentials: 'include' })
  .then((res) => (res.ok ? res.json() : null))
  .then((user) => user ? showLoggedIn(user) : showLoggedOut())
  .catch(() => setStatus(STR.networkError, true));
