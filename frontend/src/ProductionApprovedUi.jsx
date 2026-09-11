import React from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import { apiGet } from "./api";

const JOBS = ["REPAIR", "MODIFY", "AUTOMATION", "PM", "GENERAL"];

function pad(n){ return String(n).padStart(2,"0"); }
function monthRange(year, month){
  const last = new Date(year, month + 1, 0).getDate();
  return {
    from: `${year}-${pad(month + 1)}-01`,
    to: `${year}-${pad(month + 1)}-${pad(last)}`,
  };
}

export default function ProductionApprovedUi(){
  const { pathname } = useLocation();
  const [host, setHost] = React.useState(null);
  const [monthKey, setMonthKey] = React.useState("");
  const [counts, setCounts] = React.useState(() => Object.fromEntries(JOBS.map(job => [job, 0])));

  React.useEffect(() => {
    if(pathname !== "/orders"){
      document.getElementById("production-job-kpi-host")?.remove();
      setHost(null);
      setMonthKey("");
      return undefined;
    }

    const root = document.getElementById("root");
    let stopped = false;

    const sync = () => {
      if(stopped) return;
      const target = document.querySelector(".order-kpi-v9");
      let node = document.getElementById("production-job-kpi-host");

      if(!target){
        node?.remove();
        setHost(null);
        return;
      }

      if(!node){
        node = document.createElement("div");
        node.id = "production-job-kpi-host";
      }
      if(target.nextElementSibling !== node) target.insertAdjacentElement("afterend", node);
      setHost(node);

      const year = Number(document.querySelector(".order-month-head-v9 b")?.textContent || 0);
      const buttons = Array.from(document.querySelectorAll(".order-month-tabs-v9 button"));
      const month = buttons.findIndex(btn => btn.classList.contains("active"));
      if(year > 0 && month >= 0){
        const nextKey = `${year}-${month}`;
        setMonthKey(prev => prev === nextKey ? prev : nextKey);
      }
    };

    sync();
    const observer = new MutationObserver(sync);
    if(root) observer.observe(root, { childList:true, subtree:true, attributes:true, attributeFilter:["class"] });

    return () => {
      stopped = true;
      observer.disconnect();
      document.getElementById("production-job-kpi-host")?.remove();
      setHost(null);
    };
  }, [pathname]);

  React.useEffect(() => {
    if(pathname !== "/orders" || !monthKey) return undefined;
    let active = true;
    const [yearText, monthText] = monthKey.split("-");
    const year = Number(yearText);
    const month = Number(monthText);
    const range = monthRange(year, month);

    async function load(){
      try{
        const params = new URLSearchParams({
          view:"normal",
          date_from:range.from,
          date_to:range.to,
        });
        const data = await apiGet(`/orders/?${params}`, { cache:false, forceRefresh:true });
        const kpi = data?.kpi || {};
        if(active){
          setCounts({
            REPAIR:Number(kpi.repair || 0),
            MODIFY:Number(kpi.modify || 0),
            AUTOMATION:Number(kpi.automation || 0),
            PM:Number(kpi.pm || 0),
            GENERAL:Number(kpi.general || 0),
          });
        }
      }catch{
        if(active) setCounts(Object.fromEntries(JOBS.map(job => [job, 0])));
      }
    }

    load();
    return () => { active = false; };
  }, [pathname, monthKey]);

  if(pathname !== "/orders" || !host) return null;

  return createPortal(
    <div className="kpi-grid five compact production-job-kpi">
      {JOBS.map(job => (
        <div className="kpi-card" key={job}>
          <span>{job}</span>
          <strong>{counts[job].toLocaleString("th-TH")}</strong>
        </div>
      ))}
    </div>,
    host
  );
}
