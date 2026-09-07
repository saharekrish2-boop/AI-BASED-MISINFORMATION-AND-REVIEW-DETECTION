import { useState } from "react";
import { Outlet } from "react-router-dom";
import { motion } from "framer-motion";
import { Sidebar } from "./Sidebar";
import { TopNav } from "./TopNav";

export default function AppLayout() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-screen grid-bg">
      <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} />
      <div className="lg:pl-64">
        <TopNav onMenu={() => setMenuOpen(true)} />
        <motion.main
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="mx-auto w-full max-w-7xl px-4 py-6 md:px-6 md:py-8"
          id="main-content"
        >
          <Outlet />
        </motion.main>
        <footer className="border-t border-border/60 px-6 py-4">
          <p className="text-center text-xs text-muted-foreground">
            TruthLens AI · AI predictions are probabilistic and should not be treated as
            definitive proof of truthfulness or fraud.
          </p>
        </footer>
      </div>
    </div>
  );
}
