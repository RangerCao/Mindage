import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MotionConfig } from 'framer-motion'
import './index.css'
import AppRouter from './AppRouter'
import './i18n.ts';
import 'katex/dist/katex.min.css';
// Import KaTeX extensions at app startup to ensure they are registered before any rendering
import 'katex/contrib/mhchem'; // Chemistry formulas: \ce{} and \pu{}
import 'katex/contrib/copy-tex'; // Allow copying rendered formulas as LaTeX source

// Global error handlers for debugging
window.addEventListener('error', (event) => {
  console.error('[GLOBAL ERROR]', event.message, event.filename, event.lineno, event.error);
});
window.addEventListener('unhandledrejection', (event) => {
  console.error('[UNHANDLED REJECTION]', event.reason);
});

try {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      {/* Honor OS-level reduced-motion preference across every framer-motion
          animation in the app (layout, whileHover, whileTap, AnimatePresence). */}
      <MotionConfig reducedMotion="user">
        <AppRouter />
      </MotionConfig>
    </StrictMode>
  )
} catch (error) {
  console.error('[RENDER ERROR]', error);
  document.getElementById('root')!.innerHTML = `<div style="color:red;padding:20px;">Render error: ${error}</div>`;
}
