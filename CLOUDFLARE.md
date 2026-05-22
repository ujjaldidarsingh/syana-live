# Deploy SYANA Live With GitHub + Cloudflare Pages

This app is a static site. It does not need npm, React, a build command, or a server.

## 1. Create The GitHub Repo

Create a new GitHub repo named something like:

`syana-live`

Upload/commit the contents of this `SYANA Live` folder as the repo root. The repo root should contain:

- `index.html`
- `app.js`
- `styles.css`
- `config.js`
- `assets/`
- `supabase/`
- `README.md`

## 2. Connect Cloudflare Pages

In Cloudflare:

1. Go to **Workers & Pages**.
2. Click **Create application**.
3. Choose **Pages**.
4. Choose **Connect to Git**.
5. Select the `syana-live` GitHub repo.
6. Use these build settings:

| Setting | Value |
| --- | --- |
| Framework preset | `None` |
| Build command | leave blank |
| Build output directory | `/` or `.` |
| Root directory | `/` |

If this folder is inside a larger repo, set **Root directory** to `SYANA Live`.

## 3. Add The Custom Domain

After the first deploy succeeds:

1. Open the Cloudflare Pages project.
2. Go to **Custom domains**.
3. Add `syana.us`.
4. Add `www.syana.us` too, if desired.

Recommended public URLs:

- Participant: `https://syana.us/?session=RETREAT`
- Admin: `https://syana.us/#/admin`
- Display: `https://syana.us/#/display/RETREAT`

## 4. Connect Supabase Later

The first Cloudflare deploy can run in demo mode. Real retreat responses require Supabase.

Once Supabase is ready, update `config.js`:

```js
window.SYANA_LIVE_CONFIG = {
  supabaseUrl: "https://YOUR_PROJECT.supabase.co",
  supabaseAnonKey: "YOUR_PUBLISHABLE_OR_ANON_KEY",
  defaultSessionCode: "RETREAT",
  appBaseUrl: "https://syana.us/",
};
```

Then commit and push. Cloudflare Pages will redeploy automatically.
