import TopBar from '../TopBar.jsx';
import HelpButton from '../HelpButton.jsx';
import CustomerSideNav from './CustomerSideNav.jsx';

// App shell for the Customer Intelligence module — mirrors Layout.jsx's
// structure exactly (TopBar + sidenav + content + HelpButton) but composes
// its own nav, so Order Processing's Layout.jsx never needs to know this
// module exists.
export default function CustomerLayout({ children }) {
  return (
    <>
      <TopBar />
      <div className="shell">
        <CustomerSideNav />
        <main id="app">{children}</main>
      </div>
      <HelpButton />
    </>
  );
}
