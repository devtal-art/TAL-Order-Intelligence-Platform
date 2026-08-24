import TopBar from './TopBar.jsx';
import SideNav from './SideNav.jsx';

// App shell: a full-width sticky app bar, then a left navigation sidebar
// beside the centered content container (V2.3).
<<<<<<< HEAD
export default function Layout({ children }) {
=======
//
// `wide` widens the content container for data-dense screens (the
// Dashboard's card grid + table) that otherwise get squeezed into the same
// 1120px reading-width cap used by narrow, form-like screens (Upload,
// Review) — see the `#app.app-wide` override in base.css.
export default function Layout({ children, wide = false }) {
>>>>>>> 87432db (New Dashboard)
  return (
    <>
      <TopBar />
      <div className="shell">
        <SideNav />
<<<<<<< HEAD
        <main id="app">{children}</main>
=======
        <main id="app" className={wide ? 'app-wide' : undefined}>{children}</main>
>>>>>>> 87432db (New Dashboard)
      </div>
    </>
  );
}
