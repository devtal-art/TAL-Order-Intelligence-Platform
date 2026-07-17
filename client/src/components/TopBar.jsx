import logoUrl from '../assets/artlogic-logo.svg';

// Enterprise app bar: The Art Logic mark, product title + subtitle. Primary
// navigation lives in the left sidebar (SideNav, V2.3), not up here — the
// dark bar stays purely brand + environment.
export default function TopBar() {
  return (
    <header className="appbar">
      <div className="appbar-inner">
        <div className="appbar-brand">
          <img src={logoUrl} className="appbar-logo" alt="The Art Logic" />
          <span className="appbar-divider" aria-hidden="true" />
          <div className="appbar-titles">
            <h1 className="appbar-title">Order Intelligence Platform</h1>
            <p className="appbar-sub">Internal Operations Tool</p>
          </div>
        </div>
      </div>
    </header>
  );
}
