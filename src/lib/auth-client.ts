"use client";

import { emailOTPClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

// Même origine que l'app : les cookies de session (http-only) sont envoyés automatiquement.
export const authClient = createAuthClient({ plugins: [emailOTPClient()] });
