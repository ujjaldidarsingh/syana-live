# SYANA Live

Static live-prompt app for SYANA Gurmat Retreat. It covers the simple Mentimeter/Slido use cases we actually need: word clouds, multiple choice bars, ratings, and moderated response walls.

## Run Locally

From this folder:

```bash
python3 -m http.server 4173
```

Open `http://localhost:4173`.

Without Supabase credentials the app runs in demo mode. Use session code `DEMO`, open `#/admin` for facilitator controls, and open `#/display/DEMO` for the projector view.

## Retreat-Day URLs

For a session code such as `RETREAT`, use:

- Participant link: `https://syana.us/?session=RETREAT`
- Facilitator link: `https://syana.us/#/admin`
- Projector link: `https://syana.us/#/display/RETREAT`

The projector link shows the participant URL and code while no prompt is open.

## Deploy To `syana.us`

Deploy the contents of this folder as a Cloudflare Pages static site.

Use `syana.us` as the primary custom domain.

The app uses hash routes so static hosting does not need rewrite rules:

- Participant: `/?session=RETREAT`
- Facilitator: `/#/admin`
- Display: `/#/display/RETREAT`

## Supabase Setup

1. Create a Supabase project.
2. Enable Anonymous Sign-Ins in Auth.
3. Run `supabase/schema.sql` in the SQL editor.
4. Create a permanent facilitator user in Supabase Auth.
5. Insert that user id into `public.live_admins`.
6. Optional: run `supabase/sample-data.sql` to create a `RETREAT` session with five editable sample prompts.
7. Fill in `config.js`:

```js
window.SYANA_LIVE_CONFIG = {
  supabaseUrl: "https://YOUR_PROJECT.supabase.co",
  supabaseAnonKey: "YOUR_PUBLISHABLE_OR_ANON_KEY",
  defaultSessionCode: "RETREAT",
  appBaseUrl: "https://syana.us/",
};
```

The implementation follows Supabase’s current guidance for anonymous sign-ins and Realtime database updates.

## GitHub Handoff

Create a GitHub repo for this folder, then connect that repo to Cloudflare Pages. Keep `config.js` in the deployed artifact, but do not commit service-role keys or facilitator passwords.

Suggested commit scope:

- Static app files: `index.html`, `app.js`, `styles.css`, `config.js`, `assets/`
- Database setup reference: `supabase/schema.sql`
- Operator notes: `README.md`

## Acceptance Checklist

- Participant link opens on mobile and accepts a response.
- Facilitator can create a session and add the starter prompt pack.
- Opening a prompt updates the projector view.
- Word cloud, multiple choice, rating, and response wall each render results.
- Response-wall moderation hides unapproved responses from the projector.
- CSV export downloads responses for the selected prompt.
