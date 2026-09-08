# Said That. — website

Streetwear storefront built with React + Vite + Tailwind. Payments via Paystack,
order emails via Resend, hosted on Netlify.

## 1. Before you deploy — two things to fill in

**Paystack public key.** Open `src/App.jsx`, search for:

```
key:"pk_live_REPLACE_WITH_YOUR_PAYSTACK_PUBLIC_KEY",
```

Replace that with your real Paystack **public** key (find it in Paystack →
Settings → API Keys & Webhooks). This one is safe to be visible in the
frontend code — it's the secret key that must never appear here.

**Sanity check the fabric/pricing/colour details** in `src/App.jsx` against
whatever you've most recently confirmed with your supplier, since this file
was assembled over several editing sessions.

## 2. Deploy to Netlify

The simplest reliable path is connecting a GitHub repo, because it's the
only way Netlify picks up the `netlify/functions` folder automatically and
rebuilds whenever you push a change.

1. Create a new GitHub repository and push this whole folder to it.
2. In Netlify: **Add new site → Import an existing project → GitHub** →
   select the repo.
3. Netlify will read `netlify.toml` automatically — build command
   `npm run build`, publish directory `dist`, functions directory
   `netlify/functions`. You shouldn't need to change anything here.
4. Click **Deploy**.

If you'd rather not use GitHub, you can drag-and-drop deploy instead
(Netlify → Add new site → Deploy manually), but you'll need the
[Netlify CLI](https://docs.netlify.com/cli/get-started/) to include the
function — plain drag-and-drop only uploads static files, not the webhook.
GitHub is the easier route.

## 3. Set environment variables

In Netlify: **Site settings → Environment variables**, add:

| Key | Value |
|---|---|
| `PAYSTACK_SECRET_KEY` | Your Paystack **secret** key (`sk_live_...`) |
| `RESEND_API_KEY` | Your Resend API key |
| `FROM_EMAIL` | A verified sending address, e.g. `orders@saidthat.shop` |
| `OWNER_EMAIL` | Where you want new-order emails to land |

After adding these, trigger a redeploy (**Deploys → Trigger deploy**) so the
function picks them up.

## 4. Verify your Resend sending domain

In Resend, add and verify `saidthat.shop` (DNS records — Resend will show
you exactly what to add wherever you manage the domain's DNS). Emails will
fail to send until this is verified.

## 5. Point Paystack's webhook at your live site

In Paystack: **Settings → API Keys & Webhooks → Webhook URL**, set it to:

```
https://<your-site-name>.netlify.app/.netlify/functions/paystack-webhook
```

This is what triggers the order confirmation emails — without it, payments
will still go through but no emails will send.

## 6. Connect your domain

In Netlify: **Domain settings → Add a domain** → enter `saidthat.shop` and
follow the DNS instructions (usually pointing your domain's nameservers or
adding an A/CNAME record at your domain registrar).

## Local development

```bash
npm install
npm run dev
```

Note: the Paystack popup and the webhook function won't do anything useful
locally without real keys — this is mainly for checking layout/style changes.

## How the money flows (worth knowing before launch)

Paystack settles customer payments into **your own bank account** — there's
no automatic handoff to your print supplier. After a sale, you'll need to
place that order with them yourself and pay their invoice (per their terms,
that's before they print/ship, until you've got a payment history with them
— then they'll move you to weekly invoicing). The webhook above just makes
sure you get an email with everything you need to do that quickly.
