// Renders the CV generated in the popup. Reads from chrome.storage.local
// (never a network request — this page has no host permissions at all)
// and builds the DOM with createElement/textContent throughout, never
// innerHTML with dynamic content, so there's no injection risk even
// though the content originated from an LLM response.

function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

function section(titleText) {
  const s = el('section');
  s.appendChild(el('h2', null, titleText));
  return s;
}

function render(cv) {
  const content = document.getElementById('content');
  content.textContent = '';

  const page = el('div', 'page');

  // Header
  const header = el('div', 'cv-header');
  header.appendChild(el('div', 'cv-name', cv.name || 'Your Name'));
  if (cv.title) header.appendChild(el('div', 'cv-title', cv.title));
  page.appendChild(header);

  // Professional profile
  if (cv.profile) {
    const s = section('Professional Profile');
    s.appendChild(el('p', 'body-text', cv.profile));
    page.appendChild(s);
  }

  // Core services
  if (Array.isArray(cv.coreServices) && cv.coreServices.length) {
    const s = section('Core Services');
    s.appendChild(el('p', 'list-text', cv.coreServices.join(', ') + '.'));
    page.appendChild(s);
  }

  // Technical skills
  if (Array.isArray(cv.technicalSkills) && cv.technicalSkills.length) {
    const s = section('Skills');
    s.appendChild(el('p', 'list-text', cv.technicalSkills.join(', ') + '.'));
    page.appendChild(s);
  }

  // Experience
  if (cv.experienceSummary) {
    const s = section('Professional Experience');
    if (cv.experienceHeading) {
      const heading = el('p', 'body-text', cv.experienceHeading);
      heading.style.fontWeight = '700';
      heading.style.marginBottom = '4px';
      s.appendChild(heading);
    }
    s.appendChild(el('p', 'body-text', cv.experienceSummary));
    page.appendChild(s);
  }

  // Service expertise
  if (Array.isArray(cv.serviceExpertise) && cv.serviceExpertise.length) {
    const s = section('Service Expertise');
    cv.serviceExpertise.forEach(item => {
      const row = el('div', 'expertise-item');
      const cat = el('span', 'cat', (item.category || '') + ': ');
      const desc = el('span', 'desc', item.description || '');
      row.appendChild(cat);
      row.appendChild(desc);
      s.appendChild(row);
    });
    page.appendChild(s);
  }

  // Strengths
  if (Array.isArray(cv.strengths) && cv.strengths.length) {
    const s = section('Professional Strengths');
    s.appendChild(el('p', 'list-text', cv.strengths.join(', ') + '.'));
    page.appendChild(s);
  }

  // Tools & platforms
  if (Array.isArray(cv.toolsPlatforms) && cv.toolsPlatforms.length) {
    const s = section('Tools & Platforms');
    s.appendChild(el('p', 'list-text', cv.toolsPlatforms.join(', ') + '.'));
    page.appendChild(s);
  }

  // Bottom meta grid: education / languages / availability
  const metaSection = el('section');
  const grid = el('div', 'meta-grid');

  const edu = el('div');
  edu.appendChild(el('h2', null, 'Education'));
  edu.appendChild(el('p', 'body-text', cv.education || 'Available upon request.'));
  grid.appendChild(edu);

  const lang = el('div');
  lang.appendChild(el('h2', null, 'Languages'));
  lang.appendChild(el('p', 'body-text', cv.languages || 'English, Professional Working Proficiency.'));
  grid.appendChild(lang);

  const avail = el('div');
  avail.appendChild(el('h2', null, 'Availability'));
  avail.appendChild(el('p', 'body-text', cv.availability || 'Available for freelance, contract, and long term remote projects worldwide.'));
  grid.appendChild(avail);

  metaSection.appendChild(grid);
  page.appendChild(metaSection);

  content.appendChild(page);
}

function renderEmptyState() {
  const content = document.getElementById('content');
  document.getElementById('toolbar').style.display = 'none';
  const wrap = el('div', 'empty-state');
  wrap.appendChild(el('div', null, 'No CV data found.'));
  wrap.appendChild(el('div', null, 'Generate one from the extension popup\'s CV tab first.'));
  content.appendChild(wrap);
}

chrome.storage.local.get('faiCvData', (data) => {
  if (!data.faiCvData) { renderEmptyState(); return; }
  render(data.faiCvData);
  document.getElementById('printBtn').addEventListener('click', () => window.print());
});
