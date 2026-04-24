import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import Portal from "./Portal.jsx";
import Signup from "./Signup.jsx";
import WifiPortal from "./WifiPortal.jsx";
import PublicSite from "./PublicSite.jsx";
import "./styles.css";

function Root() {
  const path = typeof window !== "undefined" ? window.location.pathname : "";
  const hasToken = typeof window !== "undefined" && Boolean(window.localStorage.getItem("token"));
  if (path === "/" || path === "") {
    return hasToken ? <App /> : <PublicSite />;
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
  if (path === "/wifi" || path.startsWith("/wifi/")) {
    return <WifiPortal />;
  }
  return <App />;
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
