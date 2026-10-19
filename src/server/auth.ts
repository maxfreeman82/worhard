import "server-only";
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { APIError } from "better-auth/api";
import { acceptInvitesFor, isAdminEmail, isRemoved, REMOVED } from "./access";
import { asOwner, owner } from "./db";

const google =
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
    ? { google: { clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET } }
    : undefined;

export const auth = betterAuth({
  appName: "workhard",
  database: owner(),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  // Origines supplémentaires autorisées (ex. un port de test), séparées par des virgules.
  trustedOrigins: process.env.BETTER_AUTH_TRUSTED_ORIGINS?.split(",").map((o) => o.trim()).filter(Boolean) ?? [],
  // Les ids Better Auth sont des UUID : ils servent aussi d'id de profil (profiles.id).
  advanced: { database: { generateId: "uuid" } },
  session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 },
  // Connexion par e-mail et mot de passe, sans envoi d'e-mail : l'inscription est libre,
  // l'accès à l'espace se fait après validation par l'enseignant (page Membres).
  emailAndPassword: { enabled: true, minPasswordLength: 8, maxPasswordLength: 128, autoSignIn: true },
  socialProviders: google,
  rateLimit: {
    enabled: true,
    window: 60,
    max: 60,
    // Contre les essais de mots de passe en série et les inscriptions en masse.
    customRules: { "/sign-in/email": { window: 60, max: 10 }, "/sign-up/email": { window: 60, max: 5 }, "/change-password": { window: 60, max: 5 } },
  },
  plugins: [nextCookies()],
  databaseHooks: {
    user: {
      create: {
        // Premier passage : le profil de l'app est créé avec le même id, en attente de validation
        // (sauf l'enseignant, déclaré dans ADMIN_EMAILS).
        after: async (user) => {
          const status = isAdminEmail(user.email) ? "approved" : "pending";
          await asOwner((c) =>
            c.query("insert into profiles (id, email, name, access_status) values ($1, $2, $3, $4) on conflict (id) do nothing", [
              user.id,
              user.email.toLowerCase(),
              user.name ?? "",
              status,
            ]),
          );
        },
      },
    },
    session: {
      create: {
        // Une personne retirée par l'enseignant garde son compte mais ne peut plus ouvrir de session.
        before: async (session) => {
          const email = (await owner().query(`select email from "user" where id = $1`, [session.userId])).rows[0]?.email ?? "";
          if (await isRemoved(email)) throw new APIError("FORBIDDEN", { message: REMOVED });
        },
        // Adresse pré-autorisée par l'enseignant : validée tout de suite, l'étudiant arrive dans la classe.
        after: async (session) => {
          await acceptInvitesFor(session.userId);
        },
      },
    },
  },
});
