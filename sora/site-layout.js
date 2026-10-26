(() => {
  const header = document.querySelector('.site-header');
  const style = document.createElement('style');
  style.textContent = `
    .site-header { display: block; height: auto; padding: 0; gap: 0; }
    main { height: calc(100dvh - 77px - var(--site-header-height, 0px)); }
    .hud, .world-zoom-controls { top: calc(94px + var(--site-header-height, 0px)); }
    .hud { max-height: calc(100dvh - 110px - var(--site-header-height, 0px)); }
    @media (max-width: 600px) {
      .hud { top: calc(88px + var(--site-header-height, 0px)); max-height: calc(100dvh - 100px - var(--site-header-height, 0px)); }
    }
    @media (max-width: 760px) {
      main { height: calc(100dvh - 77px - 64px - var(--site-header-height, 0px)); }
      .hud { top: calc(88px + var(--site-header-height, 0px)); max-height: calc(100dvh - 166px - var(--site-header-height, 0px)); }
    }
  `;
  document.head.appendChild(style);
  const updateHeight = () => {
    document.documentElement.style.setProperty('--site-header-height', `${header.getBoundingClientRect().height}px`);
  };
  new ResizeObserver(updateHeight).observe(header);
  updateHeight();
})();
