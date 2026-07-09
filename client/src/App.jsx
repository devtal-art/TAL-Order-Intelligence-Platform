import { Routes, Route } from 'react-router-dom';
import Home from './pages/Home.jsx';

// The whole application lives at "/" — upload, review, saved-order lookup and
// export are screens within Home, not routes.
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
    </Routes>
  );
}
