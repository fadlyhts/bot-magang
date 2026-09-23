import "dotenv/config";

const authorization = `Basic ${Buffer.from(`${process.env.ADMIN_USERNAME}:${process.env.ADMIN_PASSWORD}`).toString("base64")}`;

for (const path of ["/api/waha/session", "/api/waha/groups"]) {
  const response = await fetch(`http://127.0.0.1:${process.env.PORT || 8080}${path}`, {
    headers: { Authorization: authorization }
  });
  const body = await response.json().catch(() => null);
  const summary = path.endsWith("/groups")
    ? { count: body?.groups?.length }
    : { name: body?.name, status: body?.status, accountPresent: Boolean(body?.account) };
  console.log(path, response.status, JSON.stringify(summary));
}

const wahaUrl = new URL(process.env.WAHA_URL);
wahaUrl.hostname = "127.0.0.1";
const session = encodeURIComponent(process.env.WAHA_SESSION || "default");

for (const path of [`/api/sessions/${session}`, `/api/${session}/groups/count`]) {
  const response = await fetch(new URL(path, wahaUrl), {
    headers: { "X-Api-Key": process.env.WAHA_API_KEY }
  });
  const body = await response.json().catch(() => null);
  const summary = path.endsWith("/count")
    ? body
    : { name: body?.name, status: body?.status, engine: body?.engine?.engine, storeEnabled: body?.config?.noweb?.store?.enabled };
  console.log(`WAHA ${path}`, response.status, JSON.stringify(summary));
}
