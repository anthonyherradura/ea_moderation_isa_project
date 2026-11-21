// Plain JS client. Every piece of server or user text is rendered with
// textContent (never innerHTML), so stored chat text cannot inject markup.
// API comes from config.js, which serve.js generates from the API_URL variable.

const $ = (id) => document.getElementById(id);
let me = null;

function el(tag, text, className) {
  const node = document.createElement(tag);
  if (text != null) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function setStatus(text, isError = false) {
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

// ---- Session ---------------------------------------------------------------

function showLoggedOut() {
  me = null;
  $('auth').hidden = false;
  $('app').hidden = true;
  $('session').hidden = true;
}

function showUsage(used, free) {
  $('usage').textContent = STR.usage(used, free);
  $('usage').className = used > free ? 'error' : '';
}

function showLoggedIn(user) {
  me = user;
  $('auth').hidden = true;
  $('app').hidden = false;
  $('session').hidden = false;
  $('who').textContent = `${user.email} (${user.role})`;
  showUsage(user.apiCalls, user.freeCalls);
  $('reviewTitle').textContent = isModerator() ? STR.reviewTitleAll : STR.reviewTitleMine;
  $('admin').hidden = user.role !== 'admin';
  $('chatLog').replaceChildren();
  $('nameResult').textContent = '';
  $('nameText').value = '';
  $('chatText').value = '';
  loadReviews();
  if (user.role === 'admin') loadStats();
}

const isModerator = () => me.role === 'moderator' || me.role === 'admin';
const credentials = () => ({ email: $('email').value, password: $('password').value });

$('authForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const user = await api('POST', '/auth/login', credentials());
  if (user) {
    $('password').value = '';
    showLoggedIn(user);
  }
});

$('register').addEventListener('click', async () => {
  if (!$('authForm').reportValidity()) return;
  if (await api('POST', '/auth/register', credentials())) setStatus(STR.registered);
});

$('logout').addEventListener('click', async () => {
  await api('POST', '/auth/logout');
  showLoggedOut();
});

// ---- Scoring ---------------------------------------------------------------

function scoreSummary(result) {
  const parts = [STR.decision[result.decision]];
  if (result.topLabel) parts.push(STR.score(result.topLabel, result.topScore));
  return parts.concat(result.warnings).join(' · ');
}

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

$('nameForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const result = await api('POST', '/usernames/check', { username: $('nameText').value });
  if (!result) return;
  $('nameResult').textContent = `${result.acceptable ? STR.nameOk : STR.nameNotOk} (${scoreSummary(result)})`;
  $('nameResult').className = result.decision;
  showUsage(result.usage.apiCalls, result.usage.freeCalls);
  if (result.caseId) loadReviews();
});

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
  const cases = await api('GET', '/reviews');
  if (!cases) return;
  $('reviews').replaceChildren(...(cases.length ? cases.map(renderCase) : [el('p', STR.noCases, 'muted')]));
}

// ---- Admin -----------------------------------------------------------------

function fillTable(table, headers, rows) {
  const head = el('tr');
  head.append(...headers.map((h) => el('th', h)));
  table.replaceChildren(head, ...rows.map((cells) => {
    const row = el('tr');
    row.append(...cells.map((cell) => el('td', String(cell))));
    return row;
  }));
}

async function loadStats() {
  const stats = await api('GET', '/admin/stats');
  if (!stats) return;
  fillTable($('endpointTable'), STR.endpointHeaders, stats.endpoints.map((e) => [e.method, e.endpoint, e.requests]));
  fillTable($('userTable'), STR.userHeaders, stats.users.map((u) => [u.email, u.role, u.apiCalls]));
}

// ---- Start -----------------------------------------------------------------

for (const [id, text] of Object.entries({
  title: STR.title, authTitle: STR.authTitle, emailLabel: STR.email, passwordLabel: STR.password,
  login: STR.login, register: STR.register, logout: STR.logout, privacy: STR.privacy,
  chatTitle: STR.chatTitle, chatSend: STR.send, nameTitle: STR.nameTitle, nameSend: STR.check,
  reviewRefresh: STR.refresh, adminTitle: STR.adminTitle, adminRefresh: STR.refresh,
})) $(id).textContent = text;
$('chatText').placeholder = STR.chatPlaceholder;
$('nameText').placeholder = STR.namePlaceholder;
$('reviewRefresh').onclick = loadReviews;
$('adminRefresh').onclick = loadStats;

// Restore the session if the cookie is still valid.
fetch(`${API}/users/me`, { credentials: 'include' })
  .then((res) => (res.ok ? res.json() : null))
  .then((user) => user && showLoggedIn(user))
  .catch(() => setStatus(STR.networkError, true));
