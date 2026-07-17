import TopBar from './TopBar.jsx';
import SideNav from './SideNav.jsx';

// App shell: a full-width sticky app bar, then a left navigation sidebar
// beside the centered content container (V2.3).
export default function Layout({ children }) {
  return (
    <>
      <TopBar />
      <div className="shell">
        <SideNav />
        <main id="app">{children}</main>
      </div>
    </>
  );
}
