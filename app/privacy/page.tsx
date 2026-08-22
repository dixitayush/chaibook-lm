import type { Metadata } from "next";
import { LegalShell, type LegalSection } from "@/components/legal/legal-shell";

export const metadata: Metadata = {
  title: "Privacy",
  description:
    "How ChaiBook LM treats your account, notebooks, sources, and Google connections — and how to wipe the cup clean.",
};

const UPDATED = "23 August 2026";

const SECTIONS: LegalSection[] = [
  {
    id: "short",
    kicker: "The short pour",
    title: "Your library stays in the cup you poured.",
    body: [
      "ChaiBook LM is a grounded research desk. We store what you put in a notebook so you can ask it questions with citations. We do not sell your sources, chat, or embeddings, and we do not use them to train a public model.",
      "This page describes the public instance at chaibook.ayushdixit.work. If you run your own copy, that operator writes their own policy.",
    ],
  },
  {
    id: "collect",
    kicker: "What we keep",
    title: "Account, notebooks, and the leaves you add.",
    body: [
      "When you create a desk we store your name, email, and a password hash — or a Google account id if you sign in with Google. We keep a session cookie so you stay signed in.",
      "Each notebook holds titles, descriptions, sources you add (PDFs, sites, YouTube, notes, email, calendar, Drive files you pick, MCP tools), extracted text, vector embeddings, chat messages, studio artifacts, and notebook-scoped memory. Share invites store the collaborator’s email on that notebook only.",
    ],
  },
  {
    id: "use",
    kicker: "Why it is there",
    title: "To run the desk you asked for — not a second product.",
    body: [
      "We use this data to authenticate you, isolate notebooks, retrieve passages, stream cited answers, generate studio pieces (briefings, flashcards, podcasts, roadmaps), enforce rate limits, and send optional mail such as share invites if email is configured.",
      "Health checks and error logs may record that a request happened. We do not build advertising profiles or sell lists of readers.",
    ],
  },
  {
    id: "google",
    kicker: "Google on the saucer",
    title: "Sign-in and imports you choose.",
    body: [
      "Google sign-in uses OAuth so we receive your Google id, email, and name. Connecting Gmail, Calendar, or Drive is a separate, optional grant. We only import messages, events, or files you pick in that notebook — not your whole inbox.",
      "Tokens stay on this instance so we can refresh access you already approved. Disconnect Google or delete the notebook to drop those imports and tokens with the rest of the cup.",
    ],
  },
  {
    id: "models",
    kicker: "The kettle",
    title: "Models see what you ask them to steep.",
    body: [
      "Chat, embeddings, and some studio features call the language-model provider configured on this instance (for example OpenAI or Gemini). Those providers receive the prompts and source excerpts needed to answer or index — subject to their own terms.",
      "Optional Mem0, if enabled, stores long-term notes you create in a notebook. Redis holds short-lived memory and rate-limit counters. Neither is a public social graph.",
    ],
  },
  {
    id: "cookies",
    kicker: "Crumbs we do keep",
    title: "A session cookie. That is the tray.",
    body: [
      "We set an HTTP-only session cookie after you sign in, plus a short-lived cookie during Google OAuth. Theme preference may live in the browser. We do not run third-party advertising cookies or cross-site trackers on the product pages.",
    ],
  },
  {
    id: "retention",
    kicker: "How long",
    title: "Until you wipe it — or the account goes quiet.",
    body: [
      "Notebooks, sources, vectors, chat, and memory stay until you delete them or we close the account. Deleting a notebook removes its sources, embeddings, messages, artifacts, and memory for that notebook. We do not keep a quiet second copy “just in case.”",
      "Backups of the database, if the host takes them, exist only to restore the instance after failure and age out with that host’s schedule.",
    ],
  },
  {
    id: "choices",
    kicker: "Your hand on the cup",
    title: "Export, share, or leave no crumbs.",
    body: [
      "You can export a chat from a notebook, invite someone by email, remove a source, or delete the notebook. You can sign out or close the account by deleting notebooks and asking the operator to remove the user row.",
      "If you need a copy of the personal data we hold about you, or want it corrected or erased, write from the email on your account. We will respond as the operator of this instance.",
    ],
  },
  {
    id: "children",
    kicker: "Age",
    title: "This desk is not for children.",
    body: [
      "ChaiBook LM is not directed at anyone under 16, and we do not knowingly collect data from children. If you believe a child created an account, contact us and we will delete it.",
    ],
  },
  {
    id: "changes",
    kicker: "The menu changes",
    title: "We will date this page when the recipe does.",
    body: [
      "If we change how we handle data in a material way, we update the date at the top of this page. Keep using the desk after that date and the new pour applies. The Terms of Service sit beside this policy.",
    ],
  },
  {
    id: "contact",
    kicker: "The counter",
    title: "Talk to the person who poured this instance.",
    body: [
      "This service is ChaiBook LM at chaibook.ayushdixit.work. Reach the operator from the email on your account, or through the contact path published on the home desk. We are not a marketplace of other people’s notebooks.",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <LegalShell
      eyebrow="Leave no crumbs"
      title="Privacy — how we treat what you pour."
      lede="A notebook is a private library. This policy says what sits in the cupboard, who may taste it, and how you empty the cup."
      updated={UPDATED}
      sections={SECTIONS}
    />
  );
}
