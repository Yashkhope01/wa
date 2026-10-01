import './style.css';
import { isSupabaseConfigured, supabase } from './supabaseClient';

const DEFAULT_TASKS = [
  { id: 'pushups', title: '50 Pushups', category: 'Body' },
  { id: 'water', title: '5 liters of water every day', category: 'Body' },
  { id: 'study', title: 'Study 2 hours', category: 'Mind' },
  { id: 'jobs', title: 'Apply to jobs', category: 'Craft' },
  { id: 'reading', title: 'Read or listen for half an hour', category: 'Mind' },
];

class Task {
  constructor({ id, title, category, completed = false }) {
    this.id = id;
    this.title = title;
    this.category = category;
    this.completed = completed;
  }
}

class SupabaseProgressStore {
  constructor(client) {
    this.client = client;
    this.user = null;
    this.tasks = DEFAULT_TASKS.map((task) => new Task(task));
    this.history = new Map();
  }

  async load(user) {
    this.user = user;
    const now = new Date();
    const monthStart = dateKey(new Date(now.getFullYear(), now.getMonth(), 1));
    const monthEnd = dateKey(new Date(now.getFullYear(), now.getMonth() + 1, 0));
    const { data, error } = await this.client
      .from('daily_progress')
      .select('progress_date, completed_task_ids')
      .eq('user_id', user.id)
      .gte('progress_date', monthStart)
      .lte('progress_date', monthEnd);

    if (error) throw error;
    this.history = new Map((data || []).map((row) => [row.progress_date, row.completed_task_ids || []]));
    this.applyToday();
  }

  applyToday() {
    const completedIds = new Set(this.history.get(todayKey()) || []);
    this.tasks.forEach((task) => { task.completed = completedIds.has(task.id); });
  }

  async toggle(id) {
    const task = this.tasks.find((item) => item.id === id);
    if (!task) return;
    task.completed = !task.completed;
    const date = todayKey();
    const completedIds = this.tasks.filter((item) => item.completed).map((item) => item.id);
    this.history.set(date, completedIds);

    const { error } = await this.client.from('daily_progress').upsert({
      user_id: this.user.id,
      progress_date: date,
      completed_task_ids: completedIds,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,progress_date' });

    if (error) {
      task.completed = !task.completed;
      this.history.set(date, this.tasks.filter((item) => item.completed).map((item) => item.id));
      throw error;
    }
  }

  get completedCount() {
    return this.tasks.filter((task) => task.completed).length;
  }

  get monthlyCompletedDays() {
    return [...this.history.values()].filter((ids) => ids.length > 0).length;
  }

  completedOn(date) {
    return (this.history.get(date) || []).length > 0;
  }
}

class WinterArcApp {
  constructor(root) {
    this.root = root;
    this.store = new SupabaseProgressStore(supabase);
    this.filter = 'All';
    this.busy = false;
    this.bindEvents();
    this.initialize();
  }

  async initialize() {
    if (!isSupabaseConfigured) {
      this.renderSetup();
      return;
    }
    const { data: { session } } = await supabase.auth.getSession();
    if (session) await this.loadUser(session.user);
    else this.renderAuth();
    supabase.auth.onAuthStateChange(async (_event, sessionState) => {
      if (sessionState) await this.loadUser(sessionState.user);
      else this.renderAuth();
    });
  }

  async loadUser(user) {
    this.renderLoading();
    try {
      await this.store.load(user);
      this.render();
    } catch (error) {
      this.renderMessage('Could not load your progress', error.message);
    }
  }

  renderSetup() {
    this.root.innerHTML = `<main class="shell auth-shell"><div class="auth-panel"><span class="brand-mark">WA</span><p class="eyebrow">Supabase connection needed</p><h1>Connect your<br /><em>daily record.</em></h1><p class="auth-copy">Copy <strong>.env.example</strong> to <strong>.env</strong>, add your Supabase URL and anon key, then restart the dev server.</p><p class="auth-note">Run the SQL in <strong>supabase/schema.sql</strong> inside your Supabase project's SQL Editor before signing in.</p></div></main>`;
  }

  renderLoading() {
    this.root.innerHTML = '<main class="shell auth-shell"><div class="auth-panel"><span class="brand-mark">WA</span><p class="eyebrow">Loading your rhythm</p><h1>One moment<br /><em>please.</em></h1></div></main>';
  }

  renderAuth(message = '') {
    this.root.innerHTML = `<main class="shell auth-shell"><div class="auth-panel"><span class="brand-mark">WA</span><p class="eyebrow">Your private daily record</p><h1>Make today<br /><em>count.</em></h1><p class="auth-copy">Sign in with your email to keep progress synced across every device.</p><form class="auth-form" id="auth-form"><label for="email">Email address</label><div><input id="email" type="email" placeholder="you@example.com" required /><button type="submit">Send sign-in link</button></div></form>${message ? `<p class="auth-message">${escapeHtml(message)}</p>` : ''}</div></main>`;
  }

  renderMessage(title, detail) {
    this.root.innerHTML = `<main class="shell auth-shell"><div class="auth-panel"><span class="brand-mark">WA</span><p class="eyebrow">Something went wrong</p><h1>${escapeHtml(title)}</h1><p class="auth-copy">${escapeHtml(detail)}</p><button class="text-button" data-action="reload">Try again</button></div></main>`;
  }

  render() {
    const now = new Date();
    const monthName = now.toLocaleDateString('en-US', { month: 'long' });
    const progress = Math.round((this.store.completedCount / DEFAULT_TASKS.length) * 100);
    const visibleTasks = this.store.tasks.filter((task) => this.filter === 'All' || task.category === this.filter);

    this.root.innerHTML = `<main class="shell"><header class="topbar"><a class="brand" href="#" aria-label="Winter Arc home"><span class="brand-mark">WA</span><span>Winter Arc</span></a><div class="account"><span>${escapeHtml(this.store.user.email || '')}</span><button class="sign-out" data-action="signout">Sign out</button></div></header><section class="intro"><div><p class="eyebrow">A quiet record of showing up</p><h1>Make today<br /><em>count.</em></h1></div><p class="intro-copy">Small promises, kept daily. Keep your focus close and let the progress add up.</p></section><section class="workspace"><div class="today-column"><div class="section-heading"><div><p class="eyebrow">Today · ${formatShortDate(now)}</p><h2>Daily wins</h2></div><span class="task-count">${this.store.completedCount}/${DEFAULT_TASKS.length} done</span></div><div class="filters" role="tablist" aria-label="Task categories">${['All', 'Daily', 'Mind', 'Body', 'Craft'].map((filter) => `<button class="filter ${this.filter === filter ? 'active' : ''}" data-filter="${filter}" role="tab" aria-selected="${this.filter === filter}">${filter}</button>`).join('')}</div><div class="task-list" aria-live="polite">${visibleTasks.map((task) => this.taskMarkup(task)).join('')}</div></div><aside class="rhythm-column"><div class="month-heading"><div><p class="eyebrow">Your rhythm</p><h2>${monthName} progress</h2></div><span class="month-number">${String(now.getMonth() + 1).padStart(2, '0')}</span></div><div class="progress-block"><div class="progress-label"><span>Today’s momentum</span><strong>${progress}%</strong></div><div class="progress-track"><span style="width: ${progress}%"></span></div><p>${this.store.monthlyCompletedDays ? `${this.store.monthlyCompletedDays} day${this.store.monthlyCompletedDays === 1 ? '' : 's'} recorded this month.` : 'Your first check-in will start the month.'}</p></div><div class="calendar" aria-label="Monthly progress calendar">${this.calendarMarkup(now)}</div><div class="legend"><span><i class="legend-dot filled"></i> completed</span><span><i class="legend-dot today"></i> today</span></div><div class="quote"><span class="quote-mark">“</span><p>The work is not to become someone else. It is to become more fully yourself.</p><small>— Winter Arc note</small></div></aside></section><footer><span>WINTER ARC / 2026</span><span>ONE DAY AT A TIME</span></footer></main>`;
  }

  taskMarkup(task) {
    return `<article class="task-row ${task.completed ? 'is-complete' : ''}"><button class="check-button" data-action="toggle" data-id="${task.id}" aria-label="${task.completed ? 'Mark incomplete' : 'Mark complete'}: ${escapeHtml(task.title)}">${task.completed ? '✓' : ''}</button><div class="task-content"><span class="task-category">${escapeHtml(task.category)}</span><h3>${escapeHtml(task.title)}</h3></div></article>`;
  }

  calendarMarkup(date) {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells = [];
    ['S', 'M', 'T', 'W', 'T', 'F', 'S'].forEach((day) => cells.push(`<span class="day-label">${day}</span>`));
    for (let i = 0; i < firstDay; i += 1) cells.push('<span class="day empty"></span>');
    for (let day = 1; day <= daysInMonth; day += 1) {
      const key = dateKey(new Date(year, month, day));
      const classes = ['day', day === date.getDate() ? 'today' : '', this.store.completedOn(key) ? 'completed' : ''].filter(Boolean).join(' ');
      cells.push(`<span class="${classes}">${day}</span>`);
    }
    return cells.join('');
  }

  bindEvents() {
    this.root.addEventListener('submit', async (event) => {
      if (event.target.id !== 'auth-form') return;
      event.preventDefault();
      const email = this.root.querySelector('#email').value.trim();
      const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } });
      this.renderAuth(error ? error.message : 'Check your email for a sign-in link.');
    });
    this.root.addEventListener('click', async (event) => {
      const filter = event.target.closest('[data-filter]');
      if (filter) { this.filter = filter.dataset.filter; this.render(); return; }
      const action = event.target.closest('[data-action]');
      if (!action || this.busy) return;
      if (action.dataset.action === 'reload') { await this.loadUser(this.store.user); return; }
      if (action.dataset.action === 'signout') { await supabase.auth.signOut(); return; }
      if (action.dataset.action === 'toggle') {
        this.busy = true;
        try { await this.store.toggle(action.dataset.id); this.render(); } catch (error) { this.renderMessage('Could not save this check-in', error.message); } finally { this.busy = false; }
      }
    });
  }
}

function todayKey() { return dateKey(new Date()); }
function dateKey(date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
function formatShortDate(date) { return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]); }

new WinterArcApp(document.querySelector('#app'));
