/**
 * Paymob Accept (Egypt) — iframe card flow.
 *
 * Required env:
 * - PAYMOB_API_KEY
 * - PAYMOB_INTEGRATION_ID   (card integration id)
 * - PAYMOB_IFRAME_ID        (iframe template id)
 *
 * Optional env:
 * - PAYMOB_BASE_URL         (default https://accept.paymob.com)
 * - PAYMOB_CURRENCY         (default EGP)
 * - FRONTEND_URL            (default http://localhost:3000) used for return URL
 * - PAYMOB_BILLING_COUNTRY  (default EG)
 */

function configured() {
  return Boolean(
    process.env.PAYMOB_API_KEY &&
      process.env.PAYMOB_INTEGRATION_ID &&
      process.env.PAYMOB_IFRAME_ID
  );
}

function baseUrl() {
  return (process.env.PAYMOB_BASE_URL || "https://accept.paymob.com").replace(/\/$/, "");
}

async function postJson(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.message || data?.detail || `Paymob HTTP ${res.status}`);
  }
  return data;
}

async function getAuthToken() {
  const data = await postJson(`${baseUrl()}/api/auth/tokens`, {
    api_key: process.env.PAYMOB_API_KEY,
  });
  if (!data?.token) throw new Error("Paymob auth failed (missing token)");
  return data.token;
}

async function createOrder(authToken, amountCents, currency) {
  const data = await postJson(`${baseUrl()}/api/ecommerce/orders`, {
    auth_token: authToken,
    delivery_needed: false,
    amount_cents: String(amountCents),
    currency,
    items: [],
  });
  if (data?.id == null) throw new Error("Paymob order failed (missing id)");
  return data.id;
}

async function createPaymentKey(authToken, orderId, amountCents, currency, billingData) {
  const data = await postJson(`${baseUrl()}/api/acceptance/payment_keys`, {
    auth_token: authToken,
    amount_cents: String(amountCents),
    expiration: 3600,
    order_id: orderId,
    billing_data: billingData,
    currency,
    integration_id: Number(process.env.PAYMOB_INTEGRATION_ID),
    // redirect_url is optional on Paymob, but it's convenient for our flow
    redirect_url: `${(process.env.FRONTEND_URL || "http://localhost:3000").replace(/\/$/, "")}/payment/return`,
  });
  if (!data?.token) throw new Error("Paymob payment key failed (missing token)");
  return data.token;
}

function registerPaymobRoutes(app) {
  app.get("/paymob/config", (req, res) => {
    res.json({ ok: true, enabled: configured() });
  });

  app.post("/paymob/session", async (req, res) => {
    try {
      if (!configured()) {
        return res.status(503).json({
          ok: false,
          error: "Paymob is not configured. Set PAYMOB_API_KEY, PAYMOB_INTEGRATION_ID, PAYMOB_IFRAME_ID in backend/.env",
        });
      }

      const { amount, billing } = req.body || {};
      const currency = String(process.env.PAYMOB_CURRENCY || "EGP").toUpperCase();
      const amountCents = Math.max(100, Math.round(Number(amount || 0) * 100));

      if (!Number.isFinite(amountCents) || amountCents <= 0) {
        return res.status(400).json({ ok: false, error: "Valid amount is required" });
      }

      const bill = billing || {};
      if (!bill.first_name || !bill.last_name || !bill.email) {
        return res.status(400).json({
          ok: false,
          error: "billing.first_name, billing.last_name, billing.email are required",
        });
      }

      const billingData = {
        apartment: "NA",
        floor: "NA",
        street: "NA",
        building: "NA",
        postal_code: "NA",
        city: "NA",
        country: process.env.PAYMOB_BILLING_COUNTRY || "EG",
        state: "NA",
        phone_number: bill.phone_number || "+201000000000",
        ...bill,
      };

      const authToken = await getAuthToken();
      const orderId = await createOrder(authToken, amountCents, currency);
      const paymentToken = await createPaymentKey(authToken, orderId, amountCents, currency, billingData);

      const iframeId = process.env.PAYMOB_IFRAME_ID;
      const iframeUrl = `${baseUrl()}/api/acceptance/iframes/${iframeId}?payment_token=${encodeURIComponent(
        paymentToken
      )}`;

      return res.json({ ok: true, iframeUrl, orderId });
    } catch (err) {
      console.error("[Paymob]", err);
      return res.status(500).json({ ok: false, error: err.message || "Paymob session failed" });
    }
  });
}

module.exports = { registerPaymobRoutes };

