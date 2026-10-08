# Better Than Yesterday — Activity Tracker (HTML + CSS + JS + Supabase)

Plain-JavaScript version of the course project. No build step.
Works **offline (localStorage)** out of the box, and syncs to **Supabase** once you add your keys.

## Folder
```
better-than-yesterday/
├── index.html
├── css/style.css
├── js/app.js                 UI + logic (quests, XP, levels, streaks, charts)
├── supabase/
│   ├── config.js             ← put your Supabase URL + anon key here
│   ├── client.js             Supabase auth + database functions (window.BTYCloud)
│   └── schema.sql            ← run this once in the Supabase SQL Editor
└── assets/                   logo + favicon
```

## Set up Supabase (5 minutes)
1. Create a project at https://supabase.com.
2. **SQL Editor → New query** → paste `supabase/schema.sql` → **Run**.
   (Creates `profiles`, `habits`, `habit_logs` with Row Level Security, so each user only sees their own data.)
3. **Authentication → Providers → Email** → turn **OFF "Confirm email"**.
   (The app logs in with a User ID, mapped to an internal address like `arjun_01@id.upgradetracker.app`, which can't receive mail — same approach as the course app.)
4. Your URL and publishable key are already filled in `supabase/config.js` (change them there to use a different project).
5. Open `index.html` (or serve the folder: `python3 -m http.server 8000`). Create an account — the 14 default quests are added automatically.

If `config.js` still has the placeholders, the app runs in local-only mode and the login screen never appears.

## How sync works
- Tap a quest → the change is saved to Supabase immediately (header shows ☁ saving… → ☁ synced).
- Edit / delete (soft delete, history kept) / add quests → saved to `habits`.
- Daily status per quest → `habit_logs` (one row per quest per day).
- Export / Import JSON still works; in a cloud account, imports are merged into your data.
- "Continue offline" on the login screen uses local data only.

## Notes
- supabase-js is loaded from the jsDelivr CDN in `index.html` (internet needed). To self-host, download it and change the `<script>` tag.
- Browser reminders only fire while the tab is open.
