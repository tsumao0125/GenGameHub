(() => {
  const currentScript = document.currentScript;
  const rootUrl = currentScript ? new URL("../", currentScript.src) : new URL("./", window.location.href);
  const rootPath = rootUrl.pathname.endsWith("/") ? rootUrl.pathname : `${rootUrl.pathname}/`;

  const mount = document.querySelector("[data-site-header]") || document.body;

  if (!document.getElementById("site-header-styles")) {
    const style = document.createElement("style");
    style.id = "site-header-styles";
    style.textContent = `
      .site-header{
        position: sticky;
        top: 0;
        z-index: 20;
        backdrop-filter: blur(10px);
        background: linear-gradient(180deg, rgba(11,20,48,.50), rgba(7,11,24,.38));
        border-bottom: 1px solid rgba(35,50,90,.55);
      }
      .site-header__inner{
        width: min(1120px, 92vw);
        margin: 0 auto;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 0;
        gap: 12px;
      }
      .site-header__brand{
        display: flex;
        align-items: center;
        gap: 10px;
        color: #ffffff;
        font-weight: 900;
        letter-spacing: .4px;
        text-decoration: none;
        text-shadow: 0 0 18px rgba(47,29,38,.18);
      }
      .site-header__badge{
        width: 12px;
        height: 12px;
        border-radius: 4px;
        background: linear-gradient(180deg, var(--accent, #7df9ff), var(--accent2, #b07cff));
        box-shadow: var(--glow, 0 0 24px rgba(125,249,255,.18));
      }
      .site-header__nav{
        display: flex;
        gap: 12px;
      }
      .site-header__nav a{
        color: rgba(255,255,255,.94);
        font-weight: 700;
        text-decoration: none;
        padding: 8px 10px;
        border-radius: 12px;
        border: 1px solid transparent;
      }
      .site-header__nav a:hover{
        color: #ffffff;
        border-color: rgba(214,182,196,.75);
        background: rgba(255,255,255,.14);
      }
      @media (max-width: 900px){
        .site-header__inner{
          width: min(1120px, 94vw);
        }
      }
      @media (max-width: 700px){
        body > .site-header{
          display: none;
        }
        .site-header__inner{
          padding: 4px 0;
          flex-wrap: nowrap;
          gap: 8px;
          font-size: 12px;
          line-height: 1.4;
        }
        .site-header__brand{
          gap: 6px;
          letter-spacing: 0;
          white-space: nowrap;
          flex-shrink: 0;
        }
        .site-header__badge{
          width: 8px;
          height: 8px;
          border-radius: 3px;
        }
        .site-header__nav{
          display: flex;
          gap: 2px;
          flex-shrink: 0;
        }
        .site-header__nav a{
          text-align: center;
          padding: 6px;
          white-space: nowrap;
        }
      }
    `;
    document.head.appendChild(style);
  }

  const header = document.createElement("header");
  header.className = "site-header";
  header.innerHTML = `
    <div class="site-header__inner">
      <a class="site-header__brand" href="${rootPath}index.html">
        <span class="site-header__badge" aria-hidden="true"></span>
        GenGame Hub
      </a>
      <nav class="site-header__nav" aria-label="Primary">
        <a href="${rootPath}index.html#games">Games</a>
        <a href="${rootPath}index.html#about">About</a>
      </nav>
    </div>
  `;

  if (mount === document.body) {
    document.body.prepend(header);
  } else {
    mount.replaceWith(header);
  }
})();
