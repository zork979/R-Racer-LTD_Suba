import { useState } from "react";
import { ArrowUpRight, Copy, Mail } from "lucide-react";
import { Button, Notice } from "./ui";
import { emailLinks, emailText } from "./email-handoff";

export default function EmailDraft({ draft }) {
  const [copyMessage, setCopyMessage] = useState("");
  const [showDetails, setShowDetails] = useState(false);
  const links = emailLinks(draft);
  async function copy() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(emailText(draft));
      setCopyMessage("Email details copied. Paste them into a new email.");
    } catch {
      setShowDetails(true);
      setCopyMessage("Select and copy the email details below, then paste them into a new email.");
    }
  }
  return <div className="email-draft">
    <span className="email-draft-icon"><Mail size={28} /></span>
    <h3>Your email draft is ready.</h3>
    <p>Review your details in Gmail, then click <strong>Send</strong> to email our team. Opening the draft does not send it.</p>
    <p className="email-draft-recipient">Send to <strong>{draft.to}</strong></p>
    <div className="email-draft-actions">
      <a className="button" href={links.gmail} target="_blank" rel="noopener noreferrer">Open Gmail<ArrowUpRight size={18} /></a>
      <a className="button button-secondary" href={links.mailto}>Open email app<Mail size={17} /></a>
      <Button type="button" secondary onClick={copy}>Copy email details<Copy size={17} /></Button>
    </div>
    <p className="fine-print">Gmail didn’t open? Use a button above. If your email app leaves out any text, copy the complete details below.</p>
    <details open={showDetails} onToggle={e => setShowDetails(e.currentTarget.open)}>
      <summary>View complete email details</summary>
      <textarea aria-label="Complete email details" readOnly value={emailText(draft)} rows={10} onFocus={e => e.target.select()} />
    </details>
    <Notice>{copyMessage}</Notice>
    <p className="fine-print">A copy is saved in your request. Email delivery is not verified by this website.</p>
    <small>Enquiry reference: {draft.reference}</small>
  </div>;
}
