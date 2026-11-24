import React from "react";
import Link from "next/link";
import type { ComplianceAlert } from "../types";

interface ComplianceReviewAlertsProps {
  alerts: ComplianceAlert[];
}

export default function ComplianceReviewAlerts({ alerts }: ComplianceReviewAlertsProps) {
  return (
    <div className="bg-card border rounded-xl p-5 shadow-2xs space-y-4">
      <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
        Compliance & Review Alerts
      </h2>

      <div className="space-y-2.5">
        {alerts.map((alert) => {
          const isBlue =
            alert.type === "info" ||
            alert.message.includes("Warranty") ||
            alert.message.includes("clearance") ||
            alert.message.includes("physical count");

          return (
            <div
              key={alert.id}
              className={`px-3.5 py-2.5 rounded-lg text-xs leading-relaxed border transition-colors ${
                isBlue
                  ? "bg-[#eef4ff] text-[#1e3a8a] border-[#dbeafe]"
                  : "bg-[#fef9ee] text-[#854d0e] border-[#fef08a]/80"
              }`}
            >
              {alert.assetTag ? (
                <span>
                  <Link
                    href={`/fm/asset-management/registration`}
                    className="font-mono underline font-semibold mr-1.5 hover:text-foreground"
                  >
                    {alert.assetTag}
                  </Link>
                  {alert.message}
                </span>
              ) : (
                <span>{alert.message}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
