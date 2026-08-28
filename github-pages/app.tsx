import { useEffect, useState } from "react";
import Home from "../app/page";
import Participation from "../app/components/participation";
import PagesAdmin from "./admin";

function currentRoute() {
  if (window.location.hash.startsWith("#/admin")) return "admin";
  if (window.location.hash.startsWith("#/participate")) return "participate";
  return "home";
}

export default function PagesApp() {
  const [route, setRoute] = useState(currentRoute);
  useEffect(() => {
    const changed = () => { setRoute(currentRoute()); };
    window.addEventListener("hashchange", changed);
    return () => window.removeEventListener("hashchange", changed);
  }, []);
  useEffect(() => {
    document.title = route === "admin" ? "이벤트 운영실 | 군체 저항도"
      : route === "participate" ? "이벤트 참여 | 군체 저항도" : "군체 저항도 — 당신의 선택은?";
    if (window.location.hash.startsWith("#/")) window.scrollTo(0, 0);
  }, [route]);
  return route === "admin" ? <PagesAdmin /> : route === "participate" ? <Participation /> : <Home />;
}
