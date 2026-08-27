import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import Home from "../app/page";
import Participation from "../app/components/participation";
import "../app/globals.css";

function currentRoute() {
  return window.location.hash.startsWith("#/participate")
    ? "participate"
    : "home";
}

function PagesApp() {
  const [route, setRoute] = useState(currentRoute);
  useEffect(() => {
    const changed = () => {
      setRoute(currentRoute());
    };
    window.addEventListener("hashchange", changed);
    return () => window.removeEventListener("hashchange", changed);
  }, []);
  useEffect(() => {
    document.title =
      route === "participate"
        ? "이벤트 참여 | 군체 저항도"
        : "군체 저항도 — 당신의 선택은?";
    if (window.location.hash.startsWith("#/")) window.scrollTo(0, 0);
  }, [route]);
  return route === "participate" ? <Participation /> : <Home />;
}

createRoot(document.getElementById("root")!).render(<PagesApp />);
