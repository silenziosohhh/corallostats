async function getJson(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      Accept: "application/json",
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
    let payload = null;
    try {
      payload = await res.json();
    } catch {
      payload = null;
    }

    let message =
      payload?.error ||
      payload?.message ||
      `HTTP ${res.status} ${res.statusText}`.trim();

    const isV1 = String(url).includes("/api/v1");
    if (isV1 && res.status === 401) message = "Non autenticato. Fai login con Discord.";
    if (isV1 && res.status === 403) message = "Accesso negato. Rigenera la key da Account se serve.";
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }

  return await res.json();
}

export const api = { getJson };
