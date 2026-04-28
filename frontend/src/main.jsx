import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import Portal from "./Portal.jsx";
import Signup from "./Signup.jsx";
import WifiPortal from "./WifiPortal.jsx";
import PublicSite from "./PublicSite.jsx";
import PwaInstallPrompt from "./PwaInstallPrompt.jsx";
import { registerServiceWorker } from "./pwaRegister.js";
import "./styles.css";

registerServiceWorker();

function Root() {
  const path = typeof window !== "undefined" ? window.location.pathname : "";
  const search = typeof window !== "undefined" ? window.location.search || "" : "";
  const forcePublic =
    typeof window !== "undefined" &&
    new URLSearchParams(search).get("site") === "public";
  const hasToken = typeof window !== "undefined" && Boolean(window.localStorage.getItem("token"));
  if (path === "/" || path === "") {
    return hasToken && !forcePublic ? <App /> : <PublicSite />;
  }
  if (path === "/login" || path.startsWith("/login/")) {
    return <App />;
  }
  if (path === "/portal" || path.startsWith("/portal/")) {
    return <Portal />;
  }
  if (path === "/signup" || path.startsWith("/signup/")) {
    return <Signup />;
  }
  if (
    path === "/wifi" ||
    path.startsWith("/wifi/") ||
    path === "/buy/packages" ||
    path.startsWith("/buy/packages/")
  ) {
    return <WifiPortal />;
  }
  return <App />;
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <>
      <Root />
      <PwaInstallPrompt />
    </>
  </React.StrictMode>
);
