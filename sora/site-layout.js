(() => {
  const style = document.createElement('style');
  style.textContent = `
    body { grid-template-rows:auto auto minmax(0,1fr) auto auto; }
    body > .site-header { grid-row:1; min-width:0; display:block; height:auto; min-height:0; padding:0; gap:0; }
    body > header:not(.site-header) { grid-row:2; }
    body > main { grid-row:3; }
    body > #game-ticker { grid-row:4; }
    body > .mobile-toolbar { grid-row:5; }
    @media (max-width: 700px) {
      body > .site-header { display:none; }
    }
  `;
  document.head.appendChild(style);
})();
