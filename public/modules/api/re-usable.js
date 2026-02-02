export async function sendEmailNotificationViaBackend(paylinkId) {
  const res = await fetch(
    `https://localhost:3001/api/paylinks/${encodeURIComponent(paylinkId)}/notifications`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ send_email: true }),
    }
  );

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error || data?.message || JSON.stringify(data);
    throw new Error(`Backend notification failed (${res.status}): ${msg}`);
  }
  return data;
}