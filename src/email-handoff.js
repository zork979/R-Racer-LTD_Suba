// Encode each value separately so message text can never add mail recipients/headers.
export function emailLinks(draft) {
  const to = encodeURIComponent(draft.to);
  const subject = encodeURIComponent(draft.subject);
  const body = encodeURIComponent(draft.body);
  return {
    gmail: `https://mail.google.com/mail/?view=cm&fs=1&to=${to}&su=${subject}&body=${body}`,
    mailto: `mailto:${to.replace("%40", "@")}?subject=${subject}&body=${body}`,
  };
}

export function emailText(draft) {
  return `To: ${draft.to}\nSubject: ${draft.subject}\n\n${draft.body}`;
}

// Called during the click, before waiting for the API, to retain popup permission.
export function reserveEmailWindow() {
  try {
    const tab = window.open("about:blank", "_blank");
    if (tab) {
      tab.opener = null;
      tab.document.title = "Preparing your R Racer email…";
      tab.document.body.textContent = "Preparing your email draft. Please keep this tab open.";
    }
    return tab;
  } catch {
    return null;
  }
}

export function closeEmailWindow(tab) {
  try { if (tab && !tab.closed) tab.close(); } catch { /* No tab to close. */ }
}

export function openEmailDraft(tab, draft) {
  try {
    if (!tab || tab.closed) return false;
    tab.location.replace(emailLinks(draft).gmail);
    return true;
  } catch {
    closeEmailWindow(tab);
    return false;
  }
}
