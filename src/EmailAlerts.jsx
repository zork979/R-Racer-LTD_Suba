import { ArrowUpRight, Mail } from "lucide-react";
import { Button, Eyebrow, Loading, Notice, useResource } from "./ui";

export default function EmailAlerts() {
  const { data, loading, error } = useResource("/admin/notifications");
  return <>
    <div className="admin-title"><div>
      <Eyebrow>STAY IN THE LOOP</Eyebrow>
      <h1>Your email enquiries.</h1>
      <p>Customers send their messages from Gmail or their preferred email app.</p>
    </div></div>
    <Notice error>{error}</Notice>
    {loading ? <Loading /> : data && <section className="panel email-alert-summary">
      <div>
        <h3><Mail size={20} /> Customer email drafts</h3>
        <p>Enquiry recipient: <strong>{data.recipient}</strong></p>
        <p>After completing the form, customers review a prefilled draft and click Send in their own email app. The draft includes their contact information and selected vehicle, plus dates and estimated price for a rental request.</p>
        <p>A copy is saved in Enquiries or Bookings. Opening a draft does not confirm email delivery. Check your mailbox and these saved requests when following up.</p>
        <p>No SMTP password or Gmail App Password is needed for enquiries. Earlier email queue records are preserved but are no longer sent or retried automatically.</p>
        <div className="email-draft-actions">
          <Button to="/admin/settings">Edit enquiry recipient<ArrowUpRight size={17} /></Button>
          <Button secondary to="/admin/enquiries">View saved enquiries</Button>
          <Button secondary to="/admin/bookings">View rental requests</Button>
        </div>
      </div>
    </section>}
  </>;
}
