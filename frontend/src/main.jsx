import React, { lazy, Suspense } from "react";
import ReactDOM from "react-dom/client";
import PublicSite from "./PublicSite.jsx";
import { registerServiceWorker } from "./pwaRegister.js";
import "./styles.css";

const App = lazy(() => import("./App.jsx"));
const Portal = lazy(() => import("./Portal.jsx"));
const Signup = lazy(() => import("./Signup.jsx"));
const WifiPortal = lazy(() => import("./WifiPortal.jsx"));
const PrivacyPolicy = lazy(() => import("./PrivacyPolicy.jsx"));
const WifiZone = lazy(() => import("./WifiZone.jsx"));

registerServiceWorker();

const LazyFallback = () => (
  <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "60vh", color: "#aaa" }}>
    Chargement…
  </div>
);

function Root() {
  const path = typeof window !== "undefined" ? window.location.pathname : "";
  const search = typeof window !== "undefined" ? window.location.search || "" : "";
  const forcePublic =
    typeof window !== "undefined" &&
    new URLSearchParams(search).get("site") === "public";
  const hasToken = typeof window !== "undefined" && Boolean(window.localStorage.getItem("token"));
  const dashScreenPaths = new Set([
    "/dashboard",
    "/network",
    "/billing",
    "/users",
    "/settings"
  ]);
  const normalizedDashPath = path.replace(/\/$/, "") || "/";
  if (dashScreenPaths.has(normalizedDashPath)) {
    return hasToken && !forcePublic ? <Suspense fallback={<LazyFallback />}><App /></Suspense> : <PublicSite />;
  }
  if (path === "/" || path === "") {
    return hasToken && !forcePublic ? <Suspense fallback={<LazyFallback />}><App /></Suspense> : <PublicSite />;
  }
  if (path === "/privacy") {
    return <Suspense fallback={<LazyFallback />}><PrivacyPolicy /></Suspense>;
  }
  if (path === "/wifi-zone") {
    return <Suspense fallback={<LazyFallback />}><WifiZone /></Suspense>;
  }
  if (path === "/login" || path.startsWith("/login/")) {
    return <Suspense fallback={<LazyFallback />}><App /></Suspense>;
  }
  if (path === "/portal" || path.startsWith("/portal/")) {
    return <Suspense fallback={<LazyFallback />}><Portal /></Suspense>;
  }
  if (path === "/signup" || path.startsWith("/signup/")) {
    return <Suspense fallback={<LazyFallback />}><Signup /></Suspense>;
  }
  if (
    path === "/wifi" ||
    path.startsWith("/wifi/") ||
    path === "/buy/packages" ||
    path.startsWith("/buy/packages/")
  ) {
    return <Suspense fallback={<LazyFallback />}><WifiPortal /></Suspense>;
  }
  return <Suspense fallback={<LazyFallback />}><App /></Suspense>;
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
