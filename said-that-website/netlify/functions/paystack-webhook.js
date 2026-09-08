// Netlify Function — receives Paystack's webhook after a successful payment,
// verifies it's genuinely from Paystack (not a browser callback, which can be
// spoofed), then emails the customer a confirmation and emails the shop
// owner an order summary via Resend.
//
// Required environment variables (set in Netlify → Site settings → Environment):
//   PAYSTACK_SECRET_KEY   — your Paystack secret key (starts sk_live_ / sk_test_)
//   RESEND_API_KEY        — your Resend API key
//   FROM_EMAIL            — verified sending address, e.g. orders@saidthat.shop
//   OWNER_EMAIL           — where new-order notifications go (your inbox)
//
// Set the webhook URL in your Paystack dashboard to:
//   https://<your-site>.netlify.app/.netlify/functions/paystack-webhook

const crypto = require("crypto");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const secret = process.env.PAYSTACK_SECRET_KEY;
  const rawBody = event.body || "";

  // ── Verify the signature — this is what stops someone forging a "payment
  // succeeded" request straight to this endpoint. Only Paystack, who has the
  // secret key, can produce a matching hash.
  const signature = event.headers["x-paystack-signature"] || event.headers["X-Paystack-Signature"];
  const expectedHash = crypto.createHmac("sha512", secret).update(rawBody).digest("hex");

  if (!signature || expectedHash !== signature) {
    return { statusCode: 401, body: "Invalid signature" };
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return { statusCode: 400, body: "Bad payload" };
  }

  // We only care about successful charges — ignore everything else Paystack sends.
  if (payload.event !== "charge.success") {
    return { statusCode: 200, body: "Ignored" };
  }

  const data = payload.data || {};
  const fields = {};
  (data.metadata?.custom_fields || []).forEach((f) => {
    fields[f.variable_name] = f.value;
  });

  const reference      = data.reference || "";
  const amount         = ((data.amount || 0) / 100).toFixed(2);
  const customerEmail  = data.customer?.email || "";
  const customerName   = fields.name || "";
  const customerPhone  = fields.phone || "";
  const shippingAddr   = fields.address || "";
  const itemsRaw       = fields.items || "";
  const itemLines      = itemsRaw.split("|").map((s) => s.trim()).filter(Boolean);

  const resendKey  = process.env.RESEND_API_KEY;
  const fromEmail  = process.env.FROM_EMAIL;
  const ownerEmail = process.env.OWNER_EMAIL;

  const itemsHtml = itemLines.map((line) => `<li style="margin-bottom:6px;">${line}</li>`).join("");
  const itemsText = itemLines.map((line) => `  - ${line}`).join("\n");

  const customerHtml = `
    <div style="font-family:Georgia,'Times New Roman',serif;background:#F2EDE4;padding:32px;color:#3A2E22;">
      <p style="font-style:italic;font-size:22px;font-weight:700;margin:0 0 4px;">Said That.</p>
      <p style="font-family:monospace;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#8A7A63;margin:0 0 24px;">Order Confirmed</p>
      <p>Hi ${customerName || "there"},</p>
      <p>Thanks for your order — it's in and headed to print.</p>
      <ul style="background:#ffffff;border:1px solid #E4DCC9;padding:16px 16px 16px 32px;margin:16px 0;">${itemsHtml}</ul>
      <p><strong>Order reference:</strong> ${reference}<br/>
         <strong>Total paid:</strong> R${amount}</p>
      <p><strong>Shipping to:</strong><br/>${shippingAddr}</p>
      <p style="margin-top:24px;">Printed to order — production takes 5–7 working days, then express courier to your door. We'll be in touch if anything needs clarifying.</p>
      <p style="margin-top:32px;font-size:12px;color:#8A7A63;">— Said That.</p>
    </div>
  `;

  const ownerText = `New order — ${reference}

Customer:  ${customerName}
Email:     ${customerEmail}
Phone:     ${customerPhone}
Address:   ${shippingAddr}

Items:
${itemsText}

Total paid: R${amount}

Next step: place this with the print supplier and settle their invoice before it ships.
`;

  const sendEmail = (to, subject, body, isHtml) =>
    fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to,
        subject,
        ...(isHtml ? { html: body } : { text: body }),
      }),
    });

  try {
    await Promise.all([
      customerEmail
        ? sendEmail(customerEmail, `Your Said That. order — ${reference}`, customerHtml, true)
        : Promise.resolve(),
      ownerEmail
        ? sendEmail(ownerEmail, `New order to fulfil — ${reference}`, ownerText, false)
        : Promise.resolve(),
    ]);
  } catch (err) {
    // Payment already succeeded — a failed email shouldn't return an error
    // status to Paystack (it would just retry the webhook). Log and move on.
    console.error("Resend email failed:", err);
  }

  return { statusCode: 200, body: "OK" };
};
