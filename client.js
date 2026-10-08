/* Supabase data layer for Better Than Yesterday.
   Exposes window.BTYCloud. Requires the supabase-js CDN script and supabase/config.js to load first. */
(() => {
  'use strict';
  const cfg = window.BTY_SUPABASE || {};
  const configured = !!(cfg.url && cfg.anonKey && !/YOUR_SUPABASE/.test(cfg.url + cfg.anonKey));
  const enabled = configured && !!(window.supabase && window.supabase.createClient);
  const sb = enabled ? window.supabase.createClient(cfg.url, cfg.anonKey, { auth: { persistSession: true, autoRefreshToken: true } }) : null;

  // The course app logs in with a User ID, mapped to an internal email address.
  const emailFor = id => `${String(id).trim().toLowerCase()}@id.upgradetracker.app`;
  const USER_ID_RE = /^[a-zA-Z0-9_.-]{3,32}$/;
  const tz = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  let ownerId = null;
  const must = ({ error, data }) => { if (error) throw error; return data; };

  const HABIT_COLS = ['id','name','description','emoji','color','category','priority','difficulty','target_value','target_unit',
    'reminder_time','reminder_enabled','daily_score','sort_order','archived','active_from','deleted_at'];
  const habitRow = h => { const r = { owner_id: ownerId, description: '', daily_score: 10 }; HABIT_COLS.forEach(k => { if (h[k] !== undefined) r[k] = h[k]; }); return r; };
  const logRow = l => ({ id: l.id, owner_id: ownerId, habit_id: l.habit_id, log_date: l.log_date, status: l.status,
    progress: l.progress, note: l.note ?? null, score_awarded: l.score_awarded });

  async function fetchAll(table, orderCol) {
    const out = [], size = 1000;
    for (let from = 0; ; from += size) {
      const rows = must(await sb.from(table).select('*').order(orderCol, { ascending: true }).range(from, from + size - 1)) || [];
      out.push(...rows);
      if (rows.length < size) break;
    }
    return out;
  }

  window.BTYCloud = {
    enabled,
    configured,
    USER_ID_RE,

    async getUser() {
      if (!enabled) return null;
      const { data } = await sb.auth.getSession();
      const u = data?.session?.user || null;
      ownerId = u ? u.id : null;
      return u;
    },

    async signIn(userId, password) {
      const { data, error } = await sb.auth.signInWithPassword({ email: emailFor(userId), password });
      if (error) throw new Error(/confirm/i.test(error.message) ? 'Email confirmation is ON in Supabase. Turn it off (Authentication → Providers → Email) and sign up again.' : 'Incorrect User ID or password.');
      ownerId = data.user.id;
      return data.user;
    },

    async signUp(fullName, userId, password) {
      if (!USER_ID_RE.test(userId)) throw new Error('User ID must be 3–32 characters: letters, numbers, . _ -');
      const { data, error } = await sb.auth.signUp({
        email: emailFor(userId), password,
        options: { data: { full_name: fullName, user_id: userId.trim().toLowerCase() } }
      });
      if (error) throw new Error(/registered|exists/i.test(error.message) ? 'That User ID is already taken.' : error.message);
      if (!data.session) throw new Error('Sign-up worked but no session was created. In Supabase go to Authentication → Providers → Email and turn OFF "Confirm email", then log in.');
      ownerId = data.user.id;
      must(await sb.from('profiles').upsert({
        id: ownerId, full_name: fullName, username: fullName, user_id: userId.trim().toLowerCase(), timezone: tz()
      }, { onConflict: 'id' }));
      return data.user;
    },

    async signOut() { ownerId = null; if (enabled) await sb.auth.signOut(); },

    async loadAll() {
      const profile = must(await sb.from('profiles').select('*').eq('id', ownerId).maybeSingle());
      const habits = (await fetchAll('habits', 'sort_order')).map(h => ({ ...h, target_value: Number(h.target_value), daily_score: Number(h.daily_score) }));
      const logs = (await fetchAll('habit_logs', 'log_date')).map(l => ({ ...l, progress: Number(l.progress), score_awarded: Number(l.score_awarded) }));
      return { profile, habits, logs };
    },

    async ensureProfile(fullName, userId) {
      must(await sb.from('profiles').upsert({ id: ownerId, full_name: fullName, username: fullName, user_id: userId, timezone: tz() }, { onConflict: 'id' }));
    },
    async updateName(name) {
      must(await sb.from('profiles').update({ full_name: name, username: name, updated_at: new Date().toISOString() }).eq('id', ownerId));
    },

    async saveHabit(h) { must(await sb.from('habits').upsert(habitRow(h), { onConflict: 'id' })); },
    async setLog(l) { must(await sb.from('habit_logs').upsert(logRow(l), { onConflict: 'habit_id,log_date' })); },
    async clearLog(habitId, date) { must(await sb.from('habit_logs').delete().eq('habit_id', habitId).eq('log_date', date)); },

    async pushAll(habits, logs) {
      if (habits.length) must(await sb.from('habits').upsert(habits.map(habitRow), { onConflict: 'id' }));
      for (let i = 0; i < logs.length; i += 500)
        must(await sb.from('habit_logs').upsert(logs.slice(i, i + 500).map(logRow), { onConflict: 'habit_id,log_date' }));
    }
  };
})();
