import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Audience } from "./pages/Audience";
import { Host } from "./pages/Host";
import { Join } from "./pages/Join";
import { Landing } from "./pages/Landing";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/join" element={<Join />} />
        <Route path="/p/:code" element={<Audience />} />
        <Route path="/host/:code" element={<Host />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
