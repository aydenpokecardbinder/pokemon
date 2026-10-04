# PokeCardBinder — setup guide

Your own Pokémon card binder website at **pokecardbinder.pages.dev**, free.

- **You (the owner)** log in to scan, upload, edit and delete cards.
- **Friends** open the link and browse, search and zoom. No account needed, and they can't change anything.
- **Name, card number and price** are filled in automatically. Prices are TCGplayer market prices, refreshed daily and converted to SGD at the daily exchange rate.

Setup takes about an hour, mostly creating free accounts. No credit card is needed for any step.

---

## What's in this folder

| Folder / file | What it is |
|---|---|
| `public/` | The website pages (`index.html` binder, `login.html` owner login) |
| `functions/` | The small server that checks logins and stores cards |
| `lib/` | Shared server code |
| `README.md` | This guide |

Keep the folders exactly as they are.

---

## Step 1 — Put the files on GitHub (free)

1. Create a free account at **github.com**.
2. Click **+** (top right), then **New repository**. Name it `pokecardbinder`, choose **Private** or **Public**, and click **Create repository**.
3. On the new repository page, click **uploading an existing file**.
4. Unzip `pokecardbinder.zip` on your computer. Drag the **`public`, `functions` and `lib` folders and `README.md`** into the GitHub page. (Use Chrome or Edge on a computer so the folders upload with their contents.)
5. Click **Commit changes**.

## Step 2 — Create the website on Cloudflare (free)

1. Create a free account at **dash.cloudflare.com**.
2. In the left menu, open **Workers & Pages**, click **Create**, choose the **Pages** tab, then **Connect to Git**.
3. Connect your GitHub account and pick the `pokecardbinder` repository.
4. On the settings screen:
   - **Project name:** `pokecardbinder` (this becomes `pokecardbinder.pages.dev`; if it's taken, try `pokecardbinder-sg`)
   - **Framework preset:** None
   - **Build command:** leave empty
   - **Build output directory:** `public`
5. Click **Save and Deploy**. Wait until it says it's live.

## Step 3 — Create the database (free)

1. In Cloudflare's left menu, open **Storage & Databases → D1 SQL Database**, and click **Create**.
2. Name it `pokecardbinder` and click **Create**. (The tables are created automatically the first time the site runs.)

## Step 4 — Connect the database and set your login

Open **Workers & Pages → pokecardbinder → Settings**.

1. **Bindings → Add → D1 database.**
   - Variable name: `DB` (exactly, in capitals)
   - D1 database: `pokecardbinder`
   - Save.
2. **Variables and Secrets → Add**, and add these. Choose type **Secret** for the password and key.

| Name | Type | Value |
|---|---|---|
| `OWNER_USERNAME` | Text | The login name you want, e.g. `ashley` |
| `OWNER_PASSWORD` | Secret | A strong password only you know |
| `GEMINI_API_KEY` | Secret | Your free Gemini key (Step 5). Strongly recommended. |

3. Go to **Deployments**, open the latest one's **⋯** menu and click **Retry deployment**, so the new settings take effect.

## Step 5 — Get a free Gemini key (recommended)

This is what reads the card name and number accurately, including Japanese, Chinese and Korean cards.

1. Go to **aistudio.google.com** and sign in with a Google account.
2. Click **Get API key**, then **Create API key**, and copy it.
3. Paste it as the `GEMINI_API_KEY` secret in Step 4, then retry the deployment.

Notes:
- The free tier has daily limits set by Google. If you scan very large batches, some cards may come back as "Needs details" until the next day; tap them later and save to look them up again.
- On Google's free tier, Google may use what you send (here: card photos) to improve its products.
- Without a key, the site uses a free on-phone text reader instead. It works on clear English cards but often can't read Japanese set codes, so more cards will need details added by hand.
- If Google ever retires the default model, add a text variable `GEMINI_MODEL` with the current "Flash" model name shown in AI Studio.

## Step 6 — Try it

1. Open **https://pokecardbinder.pages.dev** (or the name you chose).
2. Tap **Owner login**, sign in, and tap **Scan card**.
3. Check the yellow outline sits on the card (drag a corner if not), tap **Use this crop**, and the card is saved with its name, number and price.
4. Share the link with friends. They'll see the binder without any login.

---

## Everyday use

- **Scan one card:** Scan card → take the photo → Use this crop.
- **Many cards at once:** Upload photos → select them all. Each one is found, cropped, read and saved. A summary at the end lists any photos that need a retake.
- **Fix a card:** tap it → pencil. Change the number, the number after the slash, or the set code, and save; the name and price are looked up again.
- **Delete:** tap the card → bin icon.
- **Prices:** refresh automatically about once a day when anyone visits.

**Best photos:** whole card in view, card filling most of the frame, soft even light, no strong reflections. Toploaders and sleeves are fine.

## Changing your password

Edit `OWNER_PASSWORD` in **Settings → Variables and Secrets**, then retry the latest deployment. Everyone, including you, is logged out and you log in with the new password.

## Using a .com later

Buy `pokecardbinder.com` from any registrar (about US$10–15 a year), then in Cloudflare open the project → **Custom domains → Set up a custom domain** and follow the steps.

## Troubleshooting

| Problem | Fix |
|---|---|
| "Database not connected" | The binding in Step 4 must be named `DB` exactly. Retry the deployment after adding it. |
| "Owner login isn't set up yet" | Add `OWNER_USERNAME` and `OWNER_PASSWORD`, then retry the deployment. |
| Cards save as "Needs details" | Add a Gemini key (Step 5), or tap the card → pencil and type the number and set code. |
| "No price found" | TCGplayer has no market price for that card yet, or it's a Chinese/Korean card (TCGplayer doesn't list those). The PriceCharting link still works. |
| Locked out after wrong passwords | Wait 15 minutes. |
