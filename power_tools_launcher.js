(() => {
  const ID = 'brainbox-power-tools-launcher';

  function mount() {
    if (document.getElementById(ID)) return;
    if (!/^https:\/\/www\.fiverr\.com\//.test(location.href)) return;

    const button = document.createElement('button');
    button.id = ID;
    button.type = 'button';
    button.textContent = '✦ Power Tools';
    Object.assign(button.style, {
      position: 'fixed',
      right: '18px',
      bottom: '18px',
      zIndex: '2147483646',
      border: '1px solid rgba(124,92,252,.65)',
      borderRadius: '999px',
      padding: '10px 15px',
      background: 'linear-gradient(135deg,#7c5cfc,#22a9ee)',
      color: '#fff',
      font: '700 13px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
      cursor: 'pointer',
      boxShadow: '0 8px 24px rgba(0,0,0,.22)',
    });

    button.addEventListener('mouseenter', () => {
      button.style.transform = 'translateY(-1px)';
      button.style.boxShadow = '0 10px 28px rgba(124,92,252,.35)';
    });
    button.addEventListener('mouseleave', () => {
      button.style.transform = 'translateY(0)';
      button.style.boxShadow = '0 8px 24px rgba(0,0,0,.22)';
    });
    button.addEventListener('click', () => {
      if (chrome.runtime?.openOptionsPage) {
        chrome.runtime.openOptionsPage();
      } else {
        window.open(chrome.runtime.getURL('tools.html'), '_blank');
      }
    });

    (document.body || document.documentElement).appendChild(button);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount, { once: true });
  } else {
    mount();
  }
})();
