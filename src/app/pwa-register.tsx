"use client";

import { useEffect, useState } from "react";

export default function PwaRegister() {
  const [updateReady, setUpdateReady] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;

    function registerServiceWorker() {
      navigator.serviceWorker.register("/sw.js").then((registration) => {
        registration.addEventListener("updatefound", () => {
          const nextWorker = registration.installing;
          if (!nextWorker) return;

          nextWorker.addEventListener("statechange", () => {
            if (nextWorker.state === "installed" && navigator.serviceWorker.controller) {
              setUpdateReady(true);
            }
          });
        });
      }).catch(() => {
        // The app still works normally when service worker registration is unavailable.
      });
    }

    window.addEventListener("load", registerServiceWorker);
    return () => window.removeEventListener("load", registerServiceWorker);
  }, []);

  function applyUpdate() {
    window.location.reload();
  }

  if (!updateReady) return null;

  return (
    <div className="updateBanner" role="status">
      <span>New version available.</span>
      <button type="button" onClick={applyUpdate}>
        Refresh
      </button>
    </div>
  );
}
