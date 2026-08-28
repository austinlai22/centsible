import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import { CSS } from "./styles.js";
import { ErrorBoundary } from "./components/ErrorBoundary.jsx";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <>
      {/* The stylesheet lives here too, so the boundary's fallback is
          styled even when App itself is what failed. */}
      <style>{CSS}</style>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </>
  </React.StrictMode>
);
