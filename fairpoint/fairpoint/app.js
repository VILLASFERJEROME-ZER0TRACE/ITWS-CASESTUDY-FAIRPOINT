/* =========================================================
   FairPoint — Campus Student Complaint & Session Management
   Vanilla JS prototype. All data persists in localStorage.
   (No real authentication: this is a simulation for demos.)
   ========================================================= */
(() => {
  'use strict';

  /* ---------- Constants ---------- */
  const DB_KEY = 'fairpoint.v1.db';       // shared data (localStorage)
  const USER_KEY = 'fairpoint.v1.user';   // who is logged in (sessionStorage, per tab)

  const STATUS = {
    pending:   'Pending',
    review:    'Under Review',
    scheduled: 'Hearing Scheduled',
    resolved:  'Resolved',
    dismissed: 'Dismissed',
  };
  const STATUS_KEYS = Object.keys(STATUS);
  const SESSION_TYPES = ['Hearing', 'Mediation / Talk Session', 'Fact-finding Conference', 'Follow-up Session'];

  const KNOWN_STUDENTS = {
    '2023-1001': { name: 'Maria Santos',   course: 'BSIT', section: '2B' },
    '2023-1002': { name: 'Juan Dela Cruz', course: 'BSCS', section: '3A' },
    '2023-1003': { name: 'Angela Reyes',   course: 'BSBA', section: '1C' },
  };

  const ICON = (paths) =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
  const ICONS = {
    file: ICON('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/>'),
    calendar: ICON('<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>'),
    board: ICON('<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>'),
  };

  const NAV = {
    student: [
      { view: 'student-file',    label: 'File a Complaint', icon: ICONS.file },
      { view: 'student-tracker', label: 'Schedule Tracker', icon: ICONS.calendar },
    ],
    admin: [
      { view: 'admin-board',     label: 'Complaint Board',    icon: ICONS.board },
      { view: 'admin-scheduler', label: 'Session Scheduling', icon: ICONS.calendar },
    ],
  };

  /* ---------- Small helpers ---------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
  ));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const normId = (s) => String(s || '').trim().toUpperCase();

  // Dates are stored as local "YYYY-MM-DD" strings so time zones never shift them.
  const pad = (n) => String(n).padStart(2, '0');
  const toISODate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const todayISO = () => toISODate(new Date());
  const addDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return toISODate(d); };
  const parseISODate = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const fmtDate = (s) => parseISODate(s).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const fmtDateShort = (s) => parseISODate(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const fmtMonth = (s) => parseISODate(s).toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
  const fmtTime = (t) => {
    const [h, m] = t.split(':').map(Number);
    return new Date(2000, 0, 1, h, m).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };
  const fmtStamp = (iso) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });

  const courseSection = (course, section) => [course, section].filter(Boolean).join('-');
  const makeTitle = (text) => {
    const t = text.replace(/\s+/g, ' ').trim();
    if (t.length <= 70) return t;
    const cut = t.slice(0, 70);
    return cut.slice(0, Math.max(cut.lastIndexOf(' '), 40)) + '…';
  };

  /* ---------- Storage (with in-memory fallback if the browser blocks it) ---------- */
  function makeStore(getArea) {
    const mem = new Map();
    return {
      get(k) { if (mem.has(k)) return mem.get(k); try { return getArea().getItem(k); } catch { return null; } },
      set(k, v) { try { getArea().setItem(k, v); mem.delete(k); } catch { mem.set(k, v); } },
      remove(k) { mem.delete(k); try { getArea().removeItem(k); } catch { /* ignore */ } },
    };
  }
  const local = makeStore(() => window.localStorage);
  const tabStore = makeStore(() => window.sessionStorage);

  /* ---------- Data layer ---------- */
  function seed() {
    const yr = new Date().getFullYear();
    const cid = (n) => `FP-${yr}-${String(n).padStart(4, '0')}`;
    const ago = (days, hour = 9) => { const d = new Date(); d.setDate(d.getDate() - days); d.setHours(hour, 15, 0, 0); return d.toISOString(); };
    const reply = (text, days, hour) => ({ id: uid(), text, at: ago(days, hour), by: 'Judicial Admin' });
    const build = (c) => ({ ...c, title: makeTitle(c.description) });

    const complaints = [
      build({
        id: cid(1), studentId: '2023-1001', complainantName: 'Maria Santos', course: 'BSIT', section: '2B',
        respName: 'Mark Villanueva', respCourse: 'BSIT', respSection: '2A',
        description: 'During our CC103 group project, Mark repeatedly posted insulting messages about my work in the class group chat and refused to submit his part. When I asked him to stop, he threatened to remove me from the group. I would like the Judicial Office to mediate.',
        status: 'scheduled', createdAt: ago(6),
        responses: [reply('Thank you for reporting this. We reviewed the chat screenshots you attached and will hold a mediation session with both parties. Please see the schedule on your tracker.', 3, 14)],
      }),
      build({
        id: cid(2), studentId: '2023-1001', complainantName: 'Maria Santos', course: 'BSIT', section: '2B',
        respName: '', respCourse: '', respSection: '',
        description: 'Computer Laboratory 2 was left unlocked after class hours twice this week, and several mouse and keyboard units are now missing. I am worried about the security of our shared equipment.',
        status: 'pending', createdAt: ago(1), responses: [],
      }),
      build({
        id: cid(3), studentId: '2023-1002', complainantName: 'Juan Dela Cruz', course: 'BSCS', section: '3A',
        respName: 'Ricardo Lim', respCourse: 'BSCS', respSection: '3B',
        description: 'Ricardo submitted a program I wrote for our Data Structures lab as his own work. I have my commit history and a copy of the original file that show it was mine.',
        status: 'review', createdAt: ago(4),
        responses: [reply('We received your evidence and have asked the respondent for a written statement. We will contact you with next steps.', 2, 10)],
      }),
      build({
        id: cid(4), studentId: '2023-1003', complainantName: 'Angela Reyes', course: 'BSBA', section: '1C',
        respName: 'Patricia Gomez', respCourse: 'BSBA', respSection: '1C',
        description: 'A classmate kept reserving library seats for her group by leaving bags there all day, which stopped other students from using the study area.',
        status: 'resolved', createdAt: ago(20),
        responses: [reply('Both parties attended a talk session and agreed to follow the library seating policy. This case is now closed.', 11, 15)],
      }),
    ];

    const stamp = (days) => ago(days);
    const sessions = [
      { id: uid(), caseId: cid(1), type: 'Mediation / Talk Session', date: addDays(3), time: '09:00',
        venue: 'Judicial Office, Admin Building Room 204', notes: 'Bring your valid school ID and your chat screenshots.',
        published: true, createdAt: stamp(3), updatedAt: stamp(3), publishedAt: stamp(3) },
      { id: uid(), caseId: cid(3), type: 'Fact-finding Conference', date: addDays(6), time: '14:00',
        venue: 'Judicial Office, Admin Building Room 204', notes: 'Draft only. Not yet shared with the parties.',
        published: false, createdAt: stamp(1), updatedAt: stamp(1), publishedAt: null },
      { id: uid(), caseId: cid(4), type: 'Mediation / Talk Session', date: addDays(-12), time: '10:00',
        venue: 'Student Affairs Office', notes: '',
        published: true, createdAt: stamp(15), updatedAt: stamp(15), publishedAt: stamp(15) },
    ];
    return { complaints, sessions };
  }

  function loadDB() {
    const raw = local.get(DB_KEY);
    if (raw) {
      try {
        const d = JSON.parse(raw);
        if (d && Array.isArray(d.complaints) && Array.isArray(d.sessions)) return d;
      } catch { /* fall through to reseed */ }
    }
    const fresh = seed();
    local.set(DB_KEY, JSON.stringify(fresh));
    return fresh;
  }
  let db = loadDB();

  // Re-read from storage, apply a change, then save. Avoids overwriting edits made in another tab.
  function mutate(fn) {
    db = loadDB();
    const result = fn(db);
    local.set(DB_KEY, JSON.stringify(db));
    return result;
  }

  const complaintById = (id, d = db) => d.complaints.find((c) => c.id === id);
  const sessionFor = (caseId, d = db) => d.sessions.find((s) => s.caseId === caseId);
  function nextCaseId(d) {
    const yr = new Date().getFullYear();
    const max = d.complaints.reduce((m, c) => Math.max(m, parseInt(String(c.id).split('-').pop(), 10) || 0), 0);
    return `FP-${yr}-${String(max + 1).padStart(4, '0')}`;
  }

  /* ---------- Session (who is logged in) ---------- */
  let user = null;
  let currentView = null;
  let loginRole = 'student';

  function studentProfile(id) {
    if (KNOWN_STUDENTS[id]) return KNOWN_STUDENTS[id];
    const last = db.complaints.find((c) => c.studentId === id);
    return last ? { name: last.complainantName, course: last.course, section: last.section } : {};
  }
  const myComplaints = () => db.complaints.filter((c) => c.studentId === user.id); // privacy filter
  const isMine = (caseId) => myComplaints().some((c) => c.id === caseId);
  const upcomingForMe = () => db.sessions
    .filter((s) => s.published && isMine(s.caseId) && s.date >= todayISO())
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));

  /* ---------- UI primitives ---------- */
  function toast(message, type) {
    const t = document.createElement('div');
    t.className = 'toast' + (type === 'error' ? ' toast--error' : '');
    t.textContent = message;
    $('#toast-region').append(t);
    setTimeout(() => t.remove(), 4800);
  }

  function setError(input, message) {
    clearError(input);
    input.setAttribute('aria-invalid', 'true');
    const p = document.createElement('p');
    p.className = 'field__error';
    p.setAttribute('role', 'alert');
    p.textContent = message;
    input.closest('.field').append(p);
  }
  function clearError(input) {
    input.removeAttribute('aria-invalid');
    const f = input.closest('.field');
    const e = f && f.querySelector('.field__error');
    if (e) e.remove();
  }
  const clearErrors = (form) => $$('[aria-invalid]', form).forEach(clearError);

  const badge = (status) => `<span class="badge badge--${esc(status)}">${esc(STATUS[status] || status)}</span>`;

  /* ---------- Authentication ---------- */
  function setLoginRole(role) {
    loginRole = role;
    $$('.segmented__btn').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.role === role)));
    $('#login-id-label').textContent = role === 'admin' ? 'Admin ID' : 'Student ID';
    $('#login-id').value = role === 'admin' ? 'ADMIN-001' : '2023-1001';
    $('#login-password').value = role === 'admin' ? 'admin123' : 'student123';
    $('#login-error').hidden = true;
  }

  function onLogin(e) {
    e.preventDefault();
    const id = normId($('#login-id').value);
    const pw = $('#login-password').value;
    const err = $('#login-error');
    if (!id) { err.textContent = `Enter your ${loginRole === 'admin' ? 'Admin' : 'Student'} ID.`; err.hidden = false; $('#login-id').focus(); return; }
    if (!pw) { err.textContent = 'Enter a password. Any value works in this demo.'; err.hidden = false; $('#login-password').focus(); return; }
    err.hidden = true;
    user = { role: loginRole, id };
    tabStore.set(USER_KEY, JSON.stringify(user));
    enterApp();
  }

  function logout() {
    user = null;
    currentView = null;
    tabStore.remove(USER_KEY);
    $('#app-shell').hidden = true;
    $('#auth-view').hidden = false;
    setLoginRole(loginRole);
    $('#login-id').focus();
  }

  function displayName() {
    if (user.role === 'admin') return 'Judicial Admin';
    return studentProfile(user.id).name || 'Student';
  }

  function enterApp() {
    $('#auth-view').hidden = true;
    $('#app-shell').hidden = false;
    $('#role-chip').textContent = user.role === 'admin' ? 'Judicial Admin Portal' : 'Student Portal';
    renderUserBox();
    buildNav();
    if (user.role === 'student') prefillComplaintForm();
    showView(user.role === 'admin' ? 'admin-board' : 'student-tracker', { focus: false });
  }

  function renderUserBox() {
    $('#user-name').textContent = displayName();
    $('#user-id').textContent = user.id;
  }

  /* ---------- Navigation ---------- */
  function buildNav() {
    const nav = $('#sidenav');
    nav.innerHTML = NAV[user.role].map((n) =>
      `<button type="button" class="nav-item" data-view="${n.view}">${n.icon}<span>${esc(n.label)}</span><span class="nav-count" hidden></span></button>`
    ).join('');
    renderNavCounts();
  }

  function renderNavCounts() {
    const counts = {};
    if (user.role === 'student') {
      counts['student-tracker'] = upcomingForMe().length;
    } else {
      counts['admin-board'] = db.complaints.filter((c) => c.status === 'pending').length;
      counts['admin-scheduler'] = db.sessions.filter((s) => !s.published).length;
    }
    $$('.nav-item').forEach((b) => {
      const n = counts[b.dataset.view] || 0;
      const chip = $('.nav-count', b);
      chip.hidden = n === 0;
      chip.textContent = n;
      chip.title = n ? ({ 'student-tracker': 'Upcoming sessions', 'admin-board': 'Pending complaints', 'admin-scheduler': 'Draft sessions' }[b.dataset.view]) : '';
    });
  }

  function showView(name, opts = {}) {
    currentView = name;
    $$('.view').forEach((v) => { v.hidden = v.dataset.view !== name; });
    $$('.nav-item').forEach((b) => {
      if (b.dataset.view === name) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    renderCurrent();
    if (opts.focus !== false) { $('#main').focus({ preventScroll: true }); window.scrollTo(0, 0); }
  }

  function renderCurrent() {
    renderNavCounts();
    if (currentView === 'student-tracker') renderTracker();
    else if (currentView === 'admin-board') renderBoard();
    else if (currentView === 'admin-scheduler') renderScheduler();
  }

  /* =========================================================
     STUDENT PORTAL
     ========================================================= */
  function prefillComplaintForm() {
    // Set every field directly. Calling f.reset() here would fire the form's reset handler again (endless loop).
    const f = $('#complaint-form');
    const p = studentProfile(user.id);
    const set = (k, v) => { f.elements[k].value = v || ''; };
    set('studentId', user.id);
    set('complainantName', p.name);
    set('course', p.course);
    set('section', p.section);
    set('respName', '');
    set('respCourse', '');
    set('respSection', '');
    set('description', '');
    $('#desc-count').textContent = '0';
    clearErrors(f);
  }

  function onComplaintSubmit(e) {
    e.preventDefault();
    const f = e.currentTarget;
    const el = f.elements;
    const val = (k) => el[k].value.trim();
    clearErrors(f);

    let first = null;
    const fail = (input, msg) => { setError(input, msg); if (!first) first = input; };
    if (!val('complainantName')) fail(el.complainantName, 'Enter your full name.');
    if (!val('course')) fail(el.course, 'Enter your course.');
    if (!val('section')) fail(el.section, 'Enter your section.');
    if (!val('respName') && (val('respCourse') || val('respSection'))) fail(el.respName, "Add the person's name, or clear their course and section.");
    if (val('description').length < 20) fail(el.description, 'Describe the incident in at least 20 characters.');
    if (first) { first.focus(); return; }

    const complaint = mutate((d) => {
      const c = {
        id: nextCaseId(d),
        studentId: user.id, // taken from the login, so the case is tied to this student only
        complainantName: val('complainantName'),
        course: val('course').toUpperCase(),
        section: val('section').toUpperCase(),
        respName: val('respName'),
        respCourse: val('respCourse').toUpperCase(),
        respSection: val('respSection').toUpperCase(),
        description: val('description'),
        title: makeTitle(val('description')),
        status: 'pending',
        createdAt: new Date().toISOString(),
        responses: [],
      };
      d.complaints.unshift(c);
      return c;
    });

    renderUserBox();
    prefillComplaintForm();
    toast(`Complaint ${complaint.id} submitted. Only you and the Judicial Admin can see it.`);
    showView('student-tracker');
  }

  function sessionBlockHTML(s, adminView) {
    if (!s) {
      return adminView
        ? '<div class="block block--none">No session scheduled for this case.</div>'
        : '<div class="block block--none">No hearing or session has been scheduled for this case yet.</div>';
    }
    const past = s.date < todayISO();
    const state = adminView
      ? (s.published ? '<span class="badge badge--published">Published</span>' : '<span class="badge badge--draft">Draft</span>')
      : '';
    return `<div class="block block--session">
      <h4>${esc(s.type)}${past ? ' (past)' : ''} ${state}</h4>
      <p><strong>${esc(fmtDate(s.date))}</strong> at <strong>${esc(fmtTime(s.time))}</strong></p>
      <p>Venue: ${esc(s.venue)}</p>
      ${s.notes ? `<p class="muted">${esc(s.notes)}</p>` : ''}
    </div>`;
  }

  function responsesHTML(c, adminView) {
    if (!c.responses.length) {
      return `<div class="block block--none">${adminView ? 'No responses sent yet.' : 'The Judicial Admin has not responded yet.'}</div>`;
    }
    return `<div class="block block--response"><h4>${adminView ? 'Responses sent' : 'Judicial Admin response'}</h4>${
      c.responses.map((r) => `<div class="response"><p class="response__meta">${esc(r.by)} · ${esc(fmtStamp(r.at))}</p><p>${esc(r.text)}</p></div>`).join('')
    }</div>`;
  }

  function respondentText(c) {
    if (!c.respName) return '<span class="dash">None specified</span>';
    const cs = courseSection(c.respCourse, c.respSection);
    return esc(c.respName) + (cs ? ` (${esc(cs)})` : '');
  }

  function caseCardHTML(c) {
    const s = sessionFor(c.id);
    const published = s && s.published ? s : null;
    return `<article class="case" aria-label="Case ${esc(c.id)}">
      <header class="case__head">
        <div><p class="case-id">${esc(c.id)}</p><h3>${esc(c.title)}</h3></div>
        ${badge(c.status)}
      </header>
      <dl class="meta">
        <div><dt>Filed</dt><dd>${esc(fmtStamp(c.createdAt))}</dd></div>
        <div><dt>Respondent</dt><dd>${respondentText(c)}</dd></div>
      </dl>
      <p class="case__text">${esc(c.description)}</p>
      ${sessionBlockHTML(published, false)}
      ${responsesHTML(c, false)}
    </article>`;
  }

  function renderTracker() {
    const mine = myComplaints().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const count = (...keys) => mine.filter((c) => keys.includes(c.status)).length;
    $('#tracker-stats').innerHTML = [
      ['Complaints filed', mine.length, ''],
      ['Pending / in review', count('pending', 'review'), 'pending'],
      ['Hearings scheduled', count('scheduled'), 'scheduled'],
      ['Closed', count('resolved', 'dismissed'), 'resolved'],
    ].map(([label, n, cls]) => `<div class="stat ${cls ? 'stat--' + cls : ''}"><span class="stat__label">${esc(label)}</span><strong class="stat__value">${n}</strong></div>`).join('');

    const up = upcomingForMe();
    $('#tracker-upcoming').innerHTML = up.length
      ? up.map((s) => `<article class="session-card">
          <div class="date-chip" aria-hidden="true"><span class="date-chip__mon">${esc(fmtMonth(s.date))}</span><span class="date-chip__day">${parseISODate(s.date).getDate()}</span></div>
          <div class="session-card__body">
            <strong>${esc(s.type)} · ${esc(s.caseId)}</strong>
            <span>${esc(fmtDate(s.date))} at ${esc(fmtTime(s.time))}</span>
            <span>Venue: ${esc(s.venue)}</span>
            ${s.notes ? `<p>${esc(s.notes)}</p>` : ''}
          </div></article>`).join('')
      : '<div class="block block--none">No upcoming sessions. When the Judicial Admin schedules a hearing for one of your cases, it will appear here.</div>';

    $('#tracker-list').innerHTML = mine.length
      ? mine.map(caseCardHTML).join('')
      : '<div class="card empty">You have not filed any complaints yet. Use “File a Complaint” to start.</div>';
  }

  /* =========================================================
     JUDICIAL ADMIN PORTAL
     ========================================================= */
  const haystack = (c) => [c.id, c.title, c.complainantName, c.studentId, c.course, c.section, c.respName, c.respCourse, c.respSection, c.description].join(' ').toLowerCase();

  function renderBoard() {
    const all = db.complaints;
    const n = (k) => all.filter((c) => c.status === k).length;
    $('#board-stats').innerHTML = [
      ['Total complaints', all.length, ''],
      ['Pending', n('pending'), 'pending'],
      ['Under review', n('review'), 'review'],
      ['Hearing scheduled', n('scheduled'), 'scheduled'],
      ['Closed', n('resolved') + n('dismissed'), 'resolved'],
    ].map(([label, v, cls]) => `<div class="stat ${cls ? 'stat--' + cls : ''}"><span class="stat__label">${esc(label)}</span><strong class="stat__value">${v}</strong></div>`).join('');

    const q = $('#board-search').value.trim().toLowerCase();
    const f = $('#board-filter').value || 'all';
    const rows = all
      .filter((c) => (f === 'all' || c.status === f) && (!q || haystack(c).includes(q)))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    $('#board-body').innerHTML = rows.map((c) => {
      const s = sessionFor(c.id);
      const sessionLine = s
        ? `${esc(fmtDateShort(s.date))}, ${esc(fmtTime(s.time))} (${s.published ? 'published' : 'draft'})`
        : 'No session yet';
      const long = c.description.length > 150;
      const cs = courseSection(c.course, c.section);
      return `<tr>
        <td data-label="Case"><strong>${esc(c.id)}</strong><small class="muted">${esc(fmtStamp(c.createdAt))}</small></td>
        <td data-label="Complainant"><div class="person"><strong>${esc(c.complainantName)}</strong><small>${esc(c.studentId)}${cs ? ' · ' + esc(cs) : ''}</small></div></td>
        <td data-label="Respondent">${c.respName
          ? `<div class="person"><strong>${esc(c.respName)}</strong><small>${esc(courseSection(c.respCourse, c.respSection)) || '&nbsp;'}</small></div>`
          : '<span class="dash">None specified</span>'}</td>
        <td data-label="Incident"><span class="excerpt${long ? ' excerpt--clamped' : ''}">${esc(c.description)}</span>${long ? '<button type="button" class="link-btn link-more" data-action="expand" aria-expanded="false">Show more</button>' : ''}</td>
        <td data-label="Status">${badge(c.status)}<small class="muted">${sessionLine}</small></td>
        <td class="cell-actions"><div class="actions">
          <button type="button" class="btn btn--secondary btn--sm" data-action="open" data-id="${esc(c.id)}" aria-label="Review and respond to ${esc(c.id)}">Review</button>
          <button type="button" class="btn btn--ghost btn--sm" data-action="schedule" data-id="${esc(c.id)}" aria-label="Schedule a session for ${esc(c.id)}">Schedule</button>
        </div></td>
      </tr>`;
    }).join('');
    $('#board-empty').hidden = rows.length > 0;
  }

  /* ----- Case dialog ----- */
  let dialogCaseId = null;

  function fillDialog(c) {
    const cs = courseSection(c.course, c.section);
    $('#dlg-case-id').textContent = c.id;
    $('#case-dialog-title').textContent = c.title;
    const st = $('#dlg-status');
    st.className = `badge badge--${c.status}`;
    st.textContent = STATUS[c.status];

    $('#dlg-details').innerHTML = `<div class="detail-grid">
      <dl class="meta">
        <div><dt>Complainant</dt><dd>${esc(c.complainantName)}</dd></div>
        <div><dt>Student ID</dt><dd>${esc(c.studentId)}</dd></div>
        <div><dt>Course &amp; section</dt><dd>${esc(cs) || '<span class="dash">—</span>'}</dd></div>
        <div><dt>Filed</dt><dd>${esc(fmtStamp(c.createdAt))}</dd></div>
        <div><dt>Respondent</dt><dd>${c.respName ? esc(c.respName) : '<span class="dash">None specified</span>'}</dd></div>
        <div><dt>Respondent course &amp; section</dt><dd>${esc(courseSection(c.respCourse, c.respSection)) || '<span class="dash">—</span>'}</dd></div>
      </dl>
      <p class="case__text">${esc(c.description)}</p>
      ${sessionBlockHTML(sessionFor(c.id), true)}
      ${responsesHTML(c, true)}
    </div>`;
  }

  function openCase(id) {
    const c = complaintById(id);
    if (!c) return;
    dialogCaseId = id;
    fillDialog(c);
    const form = $('#response-form');
    clearErrors(form);
    $('#resp-text').value = '';
    $('#resp-status').value = c.status === 'pending' ? 'review' : c.status;
    const dlg = $('#case-dialog');
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
  }

  function closeDialog() {
    const dlg = $('#case-dialog');
    if (typeof dlg.close === 'function') dlg.close(); else dlg.removeAttribute('open');
  }

  function onResponseSubmit(e) {
    e.preventDefault();
    const text = $('#resp-text').value.trim();
    const status = $('#resp-status').value;
    const current = complaintById(dialogCaseId);
    if (!current) return;
    if (!text && status === current.status) {
      setError($('#resp-text'), 'Write a response or change the case status.');
      $('#resp-text').focus();
      return;
    }
    const updated = mutate((d) => {
      const c = complaintById(dialogCaseId, d);
      if (text) c.responses.push({ id: uid(), text, at: new Date().toISOString(), by: 'Judicial Admin' });
      c.status = status;
      return c;
    });
    $('#resp-text').value = '';
    clearErrors($('#response-form'));
    fillDialog(updated);
    renderCurrent();
    toast(text ? `Response sent to ${updated.complainantName} for ${updated.id}.` : `${updated.id} marked “${STATUS[status]}”.`);
  }

  /* ----- Scheduler ----- */
  let lastSubmitMode = 'publish';

  function caseLabel(c) {
    return `${c.id} · ${c.complainantName}${c.respName ? ' vs ' + c.respName : ''} (${STATUS[c.status]})`;
  }

  function renderScheduler() {
    const sel = $('#sch-case');
    const keep = sel.value;
    const open = db.complaints.filter((c) => c.status !== 'resolved' && c.status !== 'dismissed');
    const closed = db.complaints.filter((c) => c.status === 'resolved' || c.status === 'dismissed');
    const opt = (c) => `<option value="${esc(c.id)}">${esc(caseLabel(c))}</option>`;
    sel.innerHTML = '<option value="">Select a case…</option>'
      + (open.length ? `<optgroup label="Open cases">${open.map(opt).join('')}</optgroup>` : '')
      + (closed.length ? `<optgroup label="Closed cases">${closed.map(opt).join('')}</optgroup>` : '');
    sel.value = db.complaints.some((c) => c.id === keep) ? keep : '';
    updateSessionFormNotice();

    const sessions = db.sessions.slice().sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    $('#session-body').innerHTML = sessions.map((s) => {
      const c = complaintById(s.caseId);
      return `<tr>
        <td data-label="Case"><strong>${esc(s.caseId)}</strong></td>
        <td data-label="Student">${c ? `<div class="person"><strong>${esc(c.complainantName)}</strong><small>${esc(c.studentId)}</small></div>` : '<span class="dash">—</span>'}</td>
        <td data-label="Type">${esc(s.type)}</td>
        <td data-label="Date &amp; time">${esc(fmtDateShort(s.date))}<small class="muted">${esc(fmtTime(s.time))}</small></td>
        <td data-label="Venue">${esc(s.venue)}</td>
        <td data-label="State">${s.published ? '<span class="badge badge--published">Published</span>' : '<span class="badge badge--draft">Draft</span>'}</td>
        <td class="cell-actions"><div class="actions">
          <button type="button" class="btn btn--secondary btn--sm" data-action="edit" data-id="${esc(s.id)}">Edit</button>
          <button type="button" class="btn btn--ghost btn--sm" data-action="toggle" data-id="${esc(s.id)}">${s.published ? 'Unpublish' : 'Publish'}</button>
          <button type="button" class="btn btn--danger btn--sm" data-action="delete" data-id="${esc(s.id)}">Delete</button>
        </div></td>
      </tr>`;
    }).join('');
    $('#session-empty').hidden = sessions.length > 0;
  }

  // Loads an existing session for the chosen case into the form (one session per case, so saving updates it).
  function loadSessionIntoForm() {
    const f = $('#session-form');
    const s = sessionFor(f.elements.caseId.value);
    clearErrors(f);
    if (s) {
      f.elements.type.value = s.type;
      f.elements.date.value = s.date;
      f.elements.time.value = s.time;
      f.elements.venue.value = s.venue;
      f.elements.notes.value = s.notes || '';
    } else {
      f.elements.date.value = '';
      f.elements.time.value = '';
      f.elements.venue.value = '';
      f.elements.notes.value = '';
    }
    updateSessionFormNotice();
  }

  function updateSessionFormNotice() {
    const f = $('#session-form');
    const s = sessionFor(f.elements.caseId.value);
    const note = $('#sch-existing');
    $('#session-form-title').textContent = s ? 'Update session' : 'Set a session';
    if (s) {
      note.hidden = false;
      note.textContent = `This case already has a ${s.published ? 'published' : 'draft'} session on ${fmtDate(s.date)}. Saving will update it${s.published ? ' and the student will see the change right away' : ''}.`;
    } else {
      note.hidden = true;
    }
  }

  function startSchedule(caseId) {
    showView('admin-scheduler');
    $('#sch-case').value = caseId;
    loadSessionIntoForm();
    $('#sch-date').focus();
  }

  function syncStatus(c, s) {
    if (s.published && (c.status === 'pending' || c.status === 'review')) c.status = 'scheduled';
    if (!s.published && c.status === 'scheduled') c.status = 'review';
  }

  function onSessionSubmit(e) {
    e.preventDefault();
    const f = e.currentTarget;
    const el = f.elements;
    const publish = ((e.submitter && e.submitter.dataset.mode) || lastSubmitMode) !== 'draft';
    clearErrors(f);

    let first = null;
    const fail = (input, msg) => { setError(input, msg); if (!first) first = input; };
    if (!el.caseId.value) fail(el.caseId, 'Choose the case for this session.');
    if (!el.date.value) fail(el.date, 'Pick a date.');
    else if (el.date.value < todayISO()) fail(el.date, 'Pick today or a future date.');
    if (!el.time.value) fail(el.time, 'Pick a time.');
    if (!el.venue.value.trim()) fail(el.venue, 'Enter the venue.');
    if (first) { first.focus(); return; }

    const caseId = el.caseId.value;
    const data = {
      type: el.type.value, date: el.date.value, time: el.time.value,
      venue: el.venue.value.trim(), notes: el.notes.value.trim(),
    };
    const result = mutate((d) => {
      const c = complaintById(caseId, d);
      if (!c) return null;
      const now = new Date().toISOString();
      let s = sessionFor(caseId, d);
      const wasPublished = !!(s && s.published);
      if (s) {
        Object.assign(s, data, { published: publish, updatedAt: now });
        if (publish && !wasPublished) s.publishedAt = now;
      } else {
        s = { id: uid(), caseId, ...data, published: publish, createdAt: now, updatedAt: now, publishedAt: publish ? now : null };
        d.sessions.push(s);
      }
      syncStatus(c, s);
      return { c, updated: wasPublished };
    });
    if (!result) { toast('That case no longer exists.', 'error'); return; }

    renderCurrent();
    toast(publish
      ? `${result.updated ? 'Session updated' : 'Session published'}. ${result.c.complainantName} can see it on their tracker now.`
      : 'Draft saved. The student cannot see it until you publish it.');
  }

  function onSessionAction(e) {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const id = btn.dataset.id;
    const s = db.sessions.find((x) => x.id === id);
    if (!s) return;

    if (btn.dataset.action === 'edit') {
      startSchedule(s.caseId);
    } else if (btn.dataset.action === 'toggle') {
      mutate((d) => {
        const row = d.sessions.find((x) => x.id === id);
        row.published = !row.published;
        row.updatedAt = new Date().toISOString();
        if (row.published) row.publishedAt = row.updatedAt;
        const c = complaintById(row.caseId, d);
        if (c) syncStatus(c, row);
      });
      renderCurrent();
      toast(s.published ? 'Session unpublished. It is hidden from the student.' : 'Session published to the student.');
    } else if (btn.dataset.action === 'delete') {
      if (!window.confirm(`Delete the session for ${s.caseId}? This cannot be undone.`)) return;
      mutate((d) => {
        d.sessions = d.sessions.filter((x) => x.id !== id);
        const c = complaintById(s.caseId, d);
        if (c && c.status === 'scheduled') c.status = 'review';
      });
      if ($('#sch-case').value === s.caseId) loadSessionIntoForm();
      renderCurrent();
      toast('Session deleted.');
    }
  }

  /* =========================================================
     Wiring & start-up
     ========================================================= */
  function init() {
    // Static select options
    $('#sch-type').innerHTML = SESSION_TYPES.map((t) => `<option>${esc(t)}</option>`).join('');
    $('#resp-status').innerHTML = STATUS_KEYS.map((k) => `<option value="${k}">${esc(STATUS[k])}</option>`).join('');
    $('#board-filter').innerHTML = '<option value="all">All statuses</option>' + STATUS_KEYS.map((k) => `<option value="${k}">${esc(STATUS[k])}</option>`).join('');
    $('#sch-date').min = todayISO();

    // Auth
    $$('.segmented__btn').forEach((b) => b.addEventListener('click', () => setLoginRole(b.dataset.role)));
    $('#login-form').addEventListener('submit', onLogin);
    $('#logout-btn').addEventListener('click', logout);
    $('#reset-demo').addEventListener('click', () => {
      if (!window.confirm('Reset the demo? This removes every complaint and session you created and restores the sample data.')) return;
      local.remove(DB_KEY);
      db = loadDB();
      logout();
      toast('Demo data restored.');
    });

    // Navigation
    $('#sidenav').addEventListener('click', (e) => {
      const b = e.target.closest('.nav-item');
      if (b) showView(b.dataset.view);
    });

    // Student
    const cf = $('#complaint-form');
    cf.addEventListener('submit', onComplaintSubmit);
    cf.addEventListener('reset', () => setTimeout(() => { if (user && user.role === 'student') prefillComplaintForm(); }, 0));
    $('#f-desc').addEventListener('input', (e) => { $('#desc-count').textContent = e.target.value.length; });

    // Admin: board
    $('#board-search').addEventListener('input', renderBoard);
    $('#board-filter').addEventListener('change', renderBoard);
    $('#board-body').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-action]');
      if (!b) return;
      if (b.dataset.action === 'open') openCase(b.dataset.id);
      else if (b.dataset.action === 'schedule') startSchedule(b.dataset.id);
      else if (b.dataset.action === 'expand') {
        const text = b.previousElementSibling;
        const open = text.classList.toggle('excerpt--open');
        b.setAttribute('aria-expanded', String(open));
        b.textContent = open ? 'Show less' : 'Show more';
      }
    });

    // Admin: dialog
    $('#dlg-close').addEventListener('click', closeDialog);
    $('#case-dialog').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeDialog(); });
    $('#response-form').addEventListener('submit', onResponseSubmit);
    $('#dlg-schedule').addEventListener('click', () => { const id = dialogCaseId; closeDialog(); if (id) startSchedule(id); });

    // Admin: scheduler
    const sf = $('#session-form');
    sf.addEventListener('submit', onSessionSubmit);
    $$('button[type="submit"]', sf).forEach((b) => b.addEventListener('click', () => { lastSubmitMode = b.dataset.mode; }));
    $('#sch-case').addEventListener('change', loadSessionIntoForm);
    $('#sch-clear').addEventListener('click', () => {
      sf.reset();
      $('#sch-case').value = '';
      clearErrors(sf);
      updateSessionFormNotice();
    });
    $('#session-body').addEventListener('click', onSessionAction);

    // Clear a field's error as soon as the user edits it
    document.addEventListener('input', (e) => {
      if (e.target.matches('input, select, textarea')) clearError(e.target);
    });

    // Live updates when another tab changes the data (e.g. admin publishes while a student tab is open)
    window.addEventListener('storage', (e) => {
      if (e.key !== DB_KEY && e.key !== null) return;
      const before = user && user.role === 'student' ? new Set(upcomingForMe().map((s) => s.id)) : null;
      db = loadDB();
      if (!user) return;
      if (before) {
        const fresh = upcomingForMe().filter((s) => !before.has(s.id));
        if (fresh.length) toast(`New session scheduled for ${fresh[0].caseId}: ${fmtDate(fresh[0].date)} at ${fmtTime(fresh[0].time)}.`);
      }
      renderCurrent();
    });

    // Restore this tab's login after a refresh
    let saved = null;
    try { saved = JSON.parse(tabStore.get(USER_KEY) || 'null'); } catch { /* ignore */ }
    setLoginRole('student');
    if (saved && (saved.role === 'student' || saved.role === 'admin') && saved.id) {
      user = saved;
      loginRole = saved.role;
      enterApp();
    }
  }

  init();
})();
