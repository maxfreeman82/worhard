import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Espace de travail",
  description: "Pages, blocs et bases de données pour ton équipe.",
};

// Applique le thème choisi avant le premier rendu, pour éviter un flash clair en mode sombre.
const themeScript = `try{var t=localStorage.getItem('theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
