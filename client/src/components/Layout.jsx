import TopBar from './TopBar.jsx';

// App shell: a full-width sticky app bar above the centered content container.
export default function Layout({ children }) {
  return (
    <>
      <TopBar />
      <main id="app">{children}</main>
    </>
  );
}
