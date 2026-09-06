import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

// React Router doesn't reset scroll position on navigation (unlike a plain
// multi-page site) — without this, a page can open scrolled to wherever the
// previous page's scroll happened to be. Scrolls to the top on every
// pathname change (not search-param-only changes, so filter/sort updates
// within the same page don't yank the user back to the top).
export default function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}
