import { useEffect } from "react";
import { Route, Routes, useLocation } from "react-router-dom";
import Landing from "@/pages/Landing";
import Dashboard from "@/pages/Dashboard";
import NewsDetector from "@/pages/NewsDetector";
import ReviewDetector from "@/pages/ReviewDetector";
import History from "@/pages/History";
import Analytics from "@/pages/Analytics";
import ModelInfo from "@/pages/ModelInfo";
import Settings from "@/pages/Settings";
import NotFound from "@/pages/NotFound";
import AppLayout from "@/components/layout/AppLayout";
import { Toaster } from "sonner";

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [pathname]);
  return null;
}

export default function App() {
  useEffect(() => {
    const stored = localStorage.getItem("truthlens-theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    if (stored === "light") {
      document.documentElement.classList.remove("dark");
    } else if (stored === "dark" || (!stored && prefersDark) || !stored) {
      document.documentElement.classList.add("dark");
    }
  }, []);

  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route element={<AppLayout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/news" element={<NewsDetector />} />
          <Route path="/reviews" element={<ReviewDetector />} />
          <Route path="/history" element={<History />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/models" element={<ModelInfo />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
      <Toaster
        theme="dark"
        position="top-right"
        richColors
        toastOptions={{ style: { fontFamily: "Inter, system-ui" } }}
      />
    </>
  );
}
