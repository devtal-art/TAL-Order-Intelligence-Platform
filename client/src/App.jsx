import { Routes, Route } from 'react-router-dom';
import Home from './pages/Home.jsx';
import Review from './pages/Review.jsx';
import Result from './pages/Result.jsx';

// Routing foundation. "/" reproduces the existing single-page experience
// exactly; /review and /result are placeholder pages for upcoming features.
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/review" element={<Review />} />
      <Route path="/result" element={<Result />} />
    </Routes>
  );
}
