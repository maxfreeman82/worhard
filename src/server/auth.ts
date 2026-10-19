import "server-only";
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { emailOTP } from "better-auth/plugins";
import { acceptInvitesFor, canSignIn, NOT_ALLOWED } from "./access";
import { asOwner, owner } from "./db";
import { sendEmail } from "./email";

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
  socialProviders: google,
  rateLimit: {
    enabled: true,
    window: 60,
    max: 60,
    // Envoi de code : limité, pour éviter d'arroser une boîte mail.
    customRules: { "/email-otp/send-verification-otp": { window: 60, max: 3 }, "/sign-in/email-otp": { window: 60, max: 10 } },
  },
  // Espace sur invitation : une adresse non ajoutée par l'enseignant est refusée avant l'envoi du code.
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/email-otp/send-verification-otp" && ctx.path !== "/sign-in/email-otp") return;
      const email = typeof ctx.body?.email === "string" ? ctx.body.email : "";
      if (!(await canSignIn(email))) throw new APIError("FORBIDDEN", { message: NOT_ALLOWED });
    }),
  },
  plugins: [
    emailOTP({
      otpLength: 6,
      expiresIn: 600,
      allowedAttempts: 5,
      async sendVerificationOTP({ email, otp }) {
        await sendEmail({
          to: email,
          subject: `Votre code de connexion : ${otp}`,
          text: `Voici votre code de connexion à workhard : ${otp}\n\nIl expire dans 10 minutes. Si vous n'avez rien demandé, ignorez ce message.`,
        });
      },
    }),
    nextCookies(),
  ],
  databaseHooks: {
    user: {
      create: {
        // Même règle pour toute création de compte (connexion Google comprise).
        before: async (user) => {
          if (!(await canSignIn(user.email))) throw new APIError("FORBIDDEN", { message: NOT_ALLOWED });
        },
        // Premier passage : le profil de l'app est créé avec le même id.
        after: async (user) => {
          await asOwner((c) =>
            c.query("insert into profiles (id, email, name) values ($1, $2, $3) on conflict (id) do nothing", [user.id, user.email.toLowerCase(), user.name ?? ""]),
          );
        },
      },
    },
    session: {
      create: {
        // Une personne retirée de l'espace garde son compte mais ne peut plus ouvrir de session.
        before: async (session) => {
          const email = (await owner().query(`select email from "user" where id = $1`, [session.userId])).rows[0]?.email ?? "";
          if (!(await canSignIn(email))) throw new APIError("FORBIDDEN", { message: NOT_ALLOWED });
        },
        // Invitations en attente : l'étudiant arrive directement dans l'espace de la classe.
        after: async (session) => {
          await acceptInvitesFor(session.userId);
        },
      },
    },
  },
});
