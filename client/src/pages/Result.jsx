import Layout from '../components/Layout.jsx';

// Placeholder page for a future dedicated Result view.
// Reachable at /result; the working export currently lives in Home's results screen.
export default function Result() {
  return (
    <Layout>
      <div className="screen active">
        <section className="step-card step-muted">
          <div className="step-head">
            <span className="step-badge">4</span>
            <div className="step-headings">
              <div className="step-title">Download Excel</div>
              <div className="step-sub">Dedicated result page</div>
            </div>
            <span className="soon-pill">Coming soon</span>
          </div>
          <div className="step-note">
            The processed Excel result and download will move here in a future release. Today it is produced on the home
            page after extraction.
          </div>
        </section>
      </div>
    </Layout>
  );
}
