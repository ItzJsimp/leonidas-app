import type { MailMessage } from "./types.ts";

export interface Fixture {
  readonly label: string;
  readonly message: Partial<MailMessage>;
  /** Expected bucket for the example pack. `null` means skipped. */
  readonly bucket: string | null;
}

/** Made-up mail only. No real sender, thread or text from any mailbox. */
export const fixtures: readonly Fixture[] = [
  {
    label: "sow via docusign",
    message: { subject: "Please sign the SOW", snippet: "via DocuSign" },
    bucket: "contract",
  },
  { label: "contract review", message: { subject: "Contract for review" }, bucket: "contract" },
  {
    label: "agreement attachment",
    message: { subject: "Docs", attachmentNames: ["Brand_Agreement_final.pdf"] },
    bucket: "contract",
  },
  {
    label: "terms of service agreement",
    message: { subject: "Terms of service agreement update" },
    bucket: "contract",
  },
  {
    label: "pandadoc",
    message: { subject: "Partnership document", snippet: "Open in PandaDoc" },
    bucket: "contract",
  },
  {
    label: "statement of work",
    message: { subject: "Statement of\r\nWork attached" },
    bucket: "contract",
  },

  { label: "invoice number", message: { subject: "Invoice #1042" }, bucket: "invoice" },
  {
    label: "payment confirmation",
    message: { subject: "Payment confirmation", snippet: "Thanks" },
    bucket: "invoice",
  },
  { label: "payout", message: { subject: "Your payout is scheduled" }, bucket: "invoice" },
  { label: "remittance", message: { subject: "Remittance advice" }, bucket: "invoice" },
  { label: "overdue", message: { subject: "Overdue reminder" }, bucket: "invoice" },

  {
    label: "existing thread",
    message: { subject: "Re: next steps", ownRepliedInThread: true },
    bucket: "existing",
  },
  {
    label: "existing quick edit",
    message: { subject: "Re: quick edit", ownRepliedInThread: true },
    bucket: "existing",
  },
  {
    label: "existing beats paid",
    message: { subject: "your rates again", ownRepliedInThread: true },
    bucket: "existing",
  },
  {
    label: "invoice beats existing",
    message: { subject: "Invoice for May", ownRepliedInThread: true },
    bucket: "invoice",
  },

  { label: "gifting", message: { subject: "Gifting opportunity" }, bucket: "barter" },
  {
    label: "free product",
    message: { subject: "Hello", snippet: "We would love to send you free product" },
    bucket: "barter",
  },
  { label: "affiliate", message: { subject: "Join our affiliate program" }, bucket: "barter" },
  { label: "seeding", message: { subject: "Product seeding for creators" }, bucket: "barter" },
  {
    label: "no budget",
    message: { subject: "Collab", snippet: "There is no budget but great exposure" },
    bucket: "barter",
  },
  { label: "in exchange", message: { subject: "Post in exchange for a kit" }, bucket: "barter" },

  { label: "rates", message: { subject: "What are your rates?" }, bucket: "paid" },
  { label: "ugc brief", message: { subject: "UGC campaign brief" }, bucket: "paid" },
  { label: "sponsorship", message: { subject: "Sponsorship inquiry" }, bucket: "paid" },
  { label: "whitelisting", message: { subject: "Whitelisting rights" }, bucket: "paid" },
  { label: "pricing", message: { subject: "Pricing for 3 videos" }, bucket: "paid" },
  { label: "paid partnership", message: { subject: "Paid partnership offer" }, bucket: "paid" },

  {
    label: "no-reply sender",
    message: { fromName: "Shop", fromAddress: "no-reply@shop.test", subject: "Order shipped" },
    bucket: "noise",
  },
  { label: "newsletter", message: { subject: "Our newsletter is here" }, bucket: "noise" },
  {
    label: "security alert",
    message: { subject: "Security alert on your account" },
    bucket: "noise",
  },
  { label: "tiktok shop", message: { subject: "TikTok Shop weekly update" }, bucket: "noise" },
  { label: "google cloud", message: { subject: "Google Cloud billing notice" }, bucket: "noise" },
  {
    label: "notifications sender",
    message: {
      fromName: "Notifications",
      fromAddress: "notifications@app.test",
      subject: "New login",
    },
    bucket: "noise",
  },
  { label: "verify email", message: { subject: "Verify your email" }, bucket: "noise" },
  {
    label: "mailer daemon",
    message: {
      fromName: "Mail Delivery",
      fromAddress: "mailer-daemon@mail.test",
      subject: "Delivery failed",
    },
    bucket: "noise",
  },

  {
    label: "quick question",
    message: { subject: "Quick question", snippet: "are you around tomorrow?" },
    bucket: "review",
  },
  { label: "lunch", message: { subject: "Lunch tomorrow?" }, bucket: "review" },
  { label: "hello", message: { subject: "Hello" }, bucket: "review" },
  { label: "empty", message: { subject: "", snippet: "" }, bucket: "review" },
  { label: "thanks", message: { subject: "Thanks!" }, bucket: "review" },
  { label: "non-latin", message: { subject: "Сотрудничество по видео" }, bucket: "review" },

  { label: "cjk then gift", message: { subject: "ギフト gift for you" }, bucket: "barter" },
  { label: "own mail", message: { isOwn: true, subject: "Contract sent" }, bucket: null },
  {
    label: "already noise-labelled",
    message: { labels: ["Ex/Noise"], subject: "Contract" },
    bucket: null,
  },
  {
    label: "already review-labelled",
    message: { labels: ["Ex/Needs-Review"], subject: "Hello" },
    bucket: null,
  },
];
