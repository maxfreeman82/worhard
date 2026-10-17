import "server-only";

/**
 * Envoie un e-mail transactionnel par l'API officielle de Resend, avec la clé du propriétaire du projet.
 * Sans RESEND_API_KEY (développement), le message est écrit dans la console du serveur à la place.
 */
export async function sendEmail({ to, subject, text }: { to: string; subject: string; text: string }) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from) {
    if (process.env.NODE_ENV === "production" && process.env.VERCEL) {
      throw new Error("RESEND_API_KEY et EMAIL_FROM sont requis en production.");
    }
    console.info(`[e-mail non envoyé : pas de RESEND_API_KEY] à ${to} — ${subject}\n${text}`);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject, text }),
  });
  if (!res.ok) throw new Error(`Envoi de l'e-mail impossible (${res.status}).`);
}
