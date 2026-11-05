# Umrah 2026 · Family

A password-protected trip site. Everything personal is encrypted. The published folder (`docs/`) only holds the app and `data.enc.json`, which can't be read without the password.

## Folders

| Path | What it is | Published? |
|---|---|---|
| `docs/` | The website (GitHub Pages serves this folder) | Yes |
| `private/data.json` | The real trip data | **Never** (in `.gitignore`) |
| `private/data.tr.json` | Turkish for text inside `data.json` | **Never** |
| `private/photos/` | Optional profile photos, e.g. `ahmet.jpg` | **Never** |
| `scripts/` | Encrypt and check scripts | Yes (no data in them) |

## Updating the data

1. Edit `private/data.json` (and add Turkish to `private/data.tr.json` for any new text).
2. In Terminal, from this folder, run:

   ```bash
   npm run encrypt
   ```

   Type the site password twice (nothing shows while you type). The script lists any text that has no Turkish yet, writes `docs/data.enc.json`, and checks that no passport numbers, bookings or names are readable in `docs/`.
3. Publish:

   ```bash
   git add docs && git commit -m "Update trip data" && git push
   ```

   The site updates in a minute or two. Anyone with the page open needs to reload and enter the password again.

## Photos

Square JPGs, at least 400 × 400, named after the person's `id` in `data.json` (`mustafa.jpg`, `elif.jpg`, …), in `private/photos/`. Then run `npm run encrypt` and publish. People without a photo get their initials.

## Changing the password

Run `npm run encrypt` and type the new password. The old one stops working once you push.

## Labels and translations

On-screen labels live in `docs/i18n.js` (English and Turkish side by side). Text that comes from the trip data is translated in `private/data.tr.json`, so it stays encrypted.

## Local preview

```bash
npm run serve
```

Then open http://localhost:8080.
