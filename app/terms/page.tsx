import type { Metadata } from "next";
import { LegalShell, type LegalSection } from "@/components/legal/legal-shell";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "The public house rules for using ChaiBook LM — your desk, your sources, and what the kettle is and is not.",
};

const UPDATED = "23 August 2026";

const SECTIONS: LegalSection[] = [
  {
    id: "short",
    kicker: "The short pour",
    title: "A desk for research. Not a lawyer, doctor, or broker.",
    body: [
      "These terms govern the public ChaiBook LM instance at chaibook.ayushdixit.work. By creating an account or using the site you agree to them. If you do not agree, leave the cup on the counter.",
      "The Privacy Policy is part of how we run the desk. Read both. We may update this page; the date above is the current brew.",
    ],
  },
  {
    id: "account",
    kicker: "Your desk",
    title: "One account, notebooks you own or were invited to.",
    body: [
      "You must be at least 16 and able to form a contract. Keep your password and Google grant to yourself. You are responsible for activity on your account.",
      "A notebook you create is yours to share, export, or delete. A notebook shared with you is the owner’s library — treat it that way. Do not scrape other people’s desks or try to climb the walls.",
    ],
  },
  {
    id: "content",
    kicker: "What you pour",
    title: "You keep the rights to your sources. You grant us a license to run the desk.",
    body: [
      "You retain ownership of files, notes, mail, and other material you add. You grant the operator a limited license to store, embed, retrieve, and display that material so the product can work — including sending excerpts to the configured model provider when you chat or index.",
      "You must have the right to add what you add. Do not pour material you are not allowed to process, and do not upload malware or content that is illegal where you live.",
    ],
  },
  {
    id: "service",
    kicker: "What we pour back",
    title: "Cited answers, studio tools, and a wipe button.",
    body: [
      "We provide isolated notebooks, hybrid retrieval, streaming chat with citations, studio artifacts, and optional Google or MCP imports. Features depend on keys and services the operator has configured. We may change, pause, or retire a feature.",
      "Answers can be wrong. Citations can miss. Treat ChaiBook as a research aid you still read — not as professional advice, a filing system of record, or a substitute for the source itself.",
    ],
  },
  {
    id: "conduct",
    kicker: "House rules",
    title: "Do not boil the kettle dry.",
    body: [
      "Do not abuse rate limits, attack the host, probe other accounts, or use the desk to generate abuse, spam, or disallowed model use under the provider’s rules. Do not reverse-engineer the service beyond what the law already allows.",
      "We may suspend or delete an account that breaks these rules, or a notebook that puts the instance at risk. You can delete your own notebooks at any time.",
    ],
  },
  {
    id: "third",
    kicker: "Other kettles",
    title: "Google, model labs, mail, and MCP are not us.",
    body: [
      "Sign-in and Workspace imports go through Google. Chat and embeddings go through the model provider on this instance. Optional email uses that mail vendor. MCP tools you connect run under their own terms and store secrets on the notebook you attach them to.",
      "Those parties have their own policies. We are not responsible for their outages, policy changes, or how they handle data once it leaves this desk.",
    ],
  },
  {
    id: "availability",
    kicker: "Steam and silence",
    title: "The service is offered as-is.",
    body: [
      "We aim to keep the kettle on. We do not promise uninterrupted uptime, perfect retrieval, or that every import will succeed. Maintenance, host failure, or a missing API key can pause the desk.",
      "To the fullest extent the law allows, the service is provided “as is” and “as available,” without warranties of merchantability, fitness, or non-infringement.",
    ],
  },
  {
    id: "liability",
    kicker: "If the cup cracks",
    title: "Our liability is limited.",
    body: [
      "We are not liable for lost notebooks, model mistakes, third-party decisions, or indirect, incidental, or consequential damages. Where liability cannot be excluded, it is limited to the greater of one hundred US dollars or the amount you paid us for the service in the three months before the claim — which, on this free instance, is typically nothing.",
      "Some places do not allow these limits. In those places, our responsibility is the minimum the law requires.",
    ],
  },
  {
    id: "end",
    kicker: "Closing time",
    title: "You may leave. We may put the chairs up.",
    body: [
      "You may stop using ChaiBook and delete your notebooks. We may stop offering this instance or close accounts that violate these terms. After closure, the Privacy Policy still describes any leftover operational copies such as backups.",
    ],
  },
  {
    id: "law",
    kicker: "Which table",
    title: "Disputes stay as local as the law allows.",
    body: [
      "These terms are governed by the laws applicable to the operator of this instance, without regard to conflict-of-law rules. Courts with jurisdiction over that operator may hear disputes, except where consumer law says you may use courts where you live.",
    ],
  },
  {
    id: "contact",
    kicker: "The counter",
    title: "Questions about the house rules.",
    body: [
      "Write from the email on your ChaiBook account, or use the contact path on the home desk. Privacy questions belong on the Privacy page; this page is the contract for using the service.",
    ],
  },
];

export default function TermsPage() {
  return (
    <LegalShell
      eyebrow="House rules"
      title="Terms of Service — the public desk agreement."
      lede="Pour a notebook, cite what you claim, and do not pretend the kettle is a professional. These are the rules of the house."
      updated={UPDATED}
      sections={SECTIONS}
    />
  );
}
