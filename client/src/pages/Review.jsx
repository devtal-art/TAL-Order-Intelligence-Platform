import Layout from '../components/Layout.jsx';
import ReviewPlaceholderCard from '../components/ReviewPlaceholderCard.jsx';

// Placeholder page for the upcoming Review Product Matches feature.
// Reachable at /review; not yet wired into the main flow.
export default function Review() {
  return (
    <Layout>
      <div className="screen active">
        <ReviewPlaceholderCard />
      </div>
    </Layout>
  );
}
