// Lit Invoice indicator for order list tables — green dot when the order's
// Lit Invoice checkbox is ticked, red dot when it isn't. Rendered in its own
// leading (header-less) column; the title/aria-label carry the meaning for
// hover and screen readers since the dot itself has no text.
export default function LitInvoiceDot({ on }) {
  const label = on ? 'Lit Invoice' : 'Not Lit Invoice';
  return <span className={`lit-dot ${on ? 'is-on' : 'is-off'}`} title={label} role="img" aria-label={label} />;
}
