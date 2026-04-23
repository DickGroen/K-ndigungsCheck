const uploadZone = document.getElementById('upload-zone');
const fileInput = document.getElementById('file-input');
const teaser = document.getElementById('teaser');
const teaserCompany = document.getElementById('teaser-company');
const teaserFound = document.getElementById('teaser-found');
const teaserSub = document.getElementById('teaser-sub');
const teaserLockedText = document.getElementById('teaser-locked-text');
const modal = document.getElementById('modal');
const stickyFooter = document.getElementById('sticky-footer');

let latestTriage = null;
let userHasInteracted = false; // sticky footer alleen na interactie

if (uploadZone) {
  uploadZone.addEventListener('dragover', e => {
    e.preventDefault();
    uploadZone.classList.add('drag-over');
  });

  uploadZone.addEventListener('dragleave', () => {
    uploadZone.classList.remove('drag-over');
  });

  uploadZone.addEventListener('drop', e => {
    e.preventDefault();
    uploadZone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  });
}

function handleFile(input) {
  if (input.files && input.files[0]) {
    userHasInteracted = true;
    processFile(input.files[0]);
  }
}

async function processFile(file) {
  uploadZone.innerHTML = `
    <div class="upload-icon" style="border-color:var(--green);">
      <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="var(--green)" stroke-width="2">
        <polyline points="20 6 9 17 4 12"></polyline>
      </svg>
    </div>
    <div class="upload-label" style="color:var(--green);">${escapeHtml(file.name)}</div>
    <div class="upload-hint">Datei erkannt — erste Einschätzung wird geladen...</div>
  `;

  teaser.classList.add('visible');
  teaserCompany.textContent = 'Analyse läuft...';
  teaserFound.textContent = 'Wir prüfen Absender, Betrag und mögliches Risiko.';
  teaserSub.textContent = 'Bitte kurz warten...';
  teaserLockedText.innerHTML = `
    <strong>Vollständige Analyse nach Zahlung</strong>
    Du erhältst eine detaillierte Einschätzung, mögliche Widerspruchsgründe und einen fertigen Widerspruch bis morgen 16:00 Uhr per E-Mail.
  `;

  try {
    const formData = new FormData();
    formData.append('file', file);

    const res = await fetch('/analyze', {
      method: 'POST',
      body: formData
    });

    const data = await res.json();

    if (!data.ok) {
      throw new Error(data.error || 'Analyse fehlgeschlagen');
    }

    latestTriage = data;

    const company = data.company || 'Unbekannter Absender';
    const amount = typeof data.amount === 'number' ? formatEuro(data.amount) : null;
    const daysLeft = typeof data.days_left === 'number' ? data.days_left : null;
    const issueCount = getIssueCount(data.risk);

    // Teaserkop: bedrijf + bedrag
    teaserCompany.textContent = amount
      ? `${company} — ${amount}`
      : company;

    // Hoofdregel: aantal gevonden problemen, direct en concreet
    teaserFound.textContent = issueCount === 1
      ? '⚠️ 1 mögliches Problem erkannt'
      : `⚠️ ${issueCount} mögliche Probleme erkannt`;

    // Subline: deadline urgentie
    teaserSub.textContent = buildSubline(daysLeft, data.risk);

    // Locked tekst: bulletpoints met concrete issues + CTA
    teaserLockedText.innerHTML = buildLockedText(issueCount, company, amount, data.risk);

    setTimeout(() => {
      teaser.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 100);

    // Modal NIET automatisch openen — gebruiker klikt zelf op CTA

  } catch (err) {
    latestTriage = null;

    teaserCompany.textContent = 'Datei erkannt';
    teaserFound.textContent = 'Wir konnten keine Live-Einschätzung laden.';
    teaserSub.textContent = 'Du kannst trotzdem mit der vollständigen Analyse fortfahren.';
    teaserLockedText.innerHTML = `
      <strong>Vollständige Analyse nach Zahlung</strong>
      Du erhältst eine detaillierte Einschätzung und einen fertigen Widerspruch bis morgen 16:00 Uhr per E-Mail.
    `;
  }
}

// Hoeveel mogelijke problemen suggereren we op basis van risk?
function getIssueCount(risk) {
  if (risk === 'high') return 3;
  if (risk === 'medium') return 2;
  return 1;
}

// Subline: puur deadline-urgentie, issues staan al in de kop
function buildSubline(daysLeft, risk) {
  if (daysLeft !== null && daysLeft <= 3) {
    return `⏳ Noch ${daysLeft} Tage bis zur Frist — handle jetzt.`;
  }
  if (daysLeft !== null && daysLeft <= 7) {
    return `⏳ Noch ${daysLeft} Tage bis zur Frist. Vollständige Prüfung empfohlen.`;
  }
  if (daysLeft !== null && daysLeft <= 14) {
    return `⏳ Frist in ${daysLeft} Tagen. Lohnt sich zu prüfen.`;
  }
  if (risk === 'high') {
    return 'Diese Forderung weist mehrere Auffälligkeiten auf.';
  }
  return 'Vollständige Analyse empfohlen.';
}

// Locked tekst: bulletpoints met issue-hints + wat je na betaling krijgt
function buildLockedText(issueCount, company, amount, risk) {
  const amountStr = amount ? ` (${amount})` : '';

  // Issue-hints op basis van risk — bewust vaag genoeg om nieuwsgierigheid te wekken
  const hints = getIssueHints(risk);
  const bulletItems = hints.map(h => `<li>${h}</li>`).join('');

  return `
    <strong>${issueCount === 1 ? '1 möglicher Widerspruchsgrund' : `${issueCount} mögliche Widerspruchsgründe`} bei ${company}${amountStr}:</strong>
    <ul style="margin:8px 0 10px 0;padding-left:16px;font-size:0.82rem;color:var(--muted);line-height:1.7;">
      ${bulletItems}
    </ul>
    <span style="font-size:0.82rem;color:var(--muted);">Vollständige Erklärung, Einschätzung deiner Chancen und fertiger Widerspruch — bis morgen 16:00 Uhr per E-Mail.</span>
  `;
}

// Vage maar herkenbare issue-hints per risico-niveau
function getIssueHints(risk) {
  if (risk === 'high') {
    return [
      'Inkassokosten möglicherweise nicht zulässig',
      'Forderung könnte verjährt sein',
      'Fehlende Nachweise für die Hauptforderung',
    ];
  }
  if (risk === 'medium') {
    return [
      'Inkassokosten möglicherweise zu hoch',
      'Frist oder Vertragsgrundlage unklar',
    ];
  }
  return [
    'Ein Punkt verdient genauere Prüfung',
  ];
}

function formatEuro(value) {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR'
  }).format(value);
}

function escapeHtml(str) {
  return String(str || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

// Sticky footer: alleen tonen na interactie (upload) én voldoende scrollen
window.addEventListener('scroll', () => {
  if (!stickyFooter) return;
  if (!userHasInteracted) return;

  if (window.scrollY > 300) {
    stickyFooter.classList.add('visible');
  } else {
    stickyFooter.classList.remove('visible');
  }
});

function openModal() {
  if (!modal) return;

  modal.classList.add('visible');
  document.body.style.overflow = 'hidden';

  const modalDynamic = document.getElementById('modal-dynamic-copy');

  if (modalDynamic) {
    if (latestTriage) {
      const company = latestTriage.company || 'dem angegebenen Unternehmen';
      const amount = typeof latestTriage.amount === 'number'
        ? formatEuro(latestTriage.amount)
        : null;
      const issueCount = getIssueCount(latestTriage.risk);
      const issueStr = issueCount === 1
        ? '1 möglichen Widerspruchsgrund'
        : `${issueCount} mögliche Widerspruchsgründe`;

      modalDynamic.textContent = amount
        ? `Wir haben bei der Forderung von ${company} (${amount}) ${issueStr} identifiziert. Die vollständige Prüfung folgt nach der Zahlung.`
        : `Wir haben ${issueStr} identifiziert. Die vollständige Prüfung folgt nach der Zahlung.`;
    } else {
      modalDynamic.textContent = 'Wir haben bereits erste Hinweise erkannt. Die vollständige Prüfung folgt nach der Zahlung.';
    }
  }
}

function closeModal() {
  if (!modal) return;
  modal.classList.remove('visible');
  document.body.style.overflow = '';
}

function closeModalOutside(e) {
  if (e.target === modal) {
    closeModal();
  }
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeModal();
  }
});

function toggleFaq(el) {
  const item = el.closest('.faq-item');
  const isOpen = item.classList.contains('open');

  document.querySelectorAll('.faq-item.open').forEach(i => {
    i.classList.remove('open');
  });

  if (!isOpen) {
    item.classList.add('open');
  }
}

window.handleFile = handleFile;
window.openModal = openModal;
window.closeModal = closeModal;
window.closeModalOutside = closeModalOutside;
window.toggleFaq = toggleFaq;
