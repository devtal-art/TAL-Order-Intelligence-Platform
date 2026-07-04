// Step 3 · Review Product Matches — placeholder card (no matching logic yet).
export default function ReviewPlaceholderCard() {
  return (
    <section className="step-card step-review">
      <div className="step-head">
        <span className="step-badge">3</span>
        <div className="step-headings">
          <div className="step-title">Review Product Matches</div>
          <div className="step-sub">Confirm the website item number for each product</div>
        </div>
        <span className="soon-pill">Coming soon</span>
      </div>
      <div className="review-ph">
        <div className="review-ph-icon">
          <svg viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </div>
        <p>This screen will display product suggestions after HTML extraction.</p>
      </div>
    </section>
  );
}
