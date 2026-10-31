import { describe, expect, it } from "vitest";
import { classifySheet } from "./classify";

describe("classifySheet (sheet names from brief section 15)", () => {
  it.each([
    ["Dev Backend Estimates", "BACKEND"],
    ["BackEnd", "BACKEND"],
    ["Server", "BACKEND"],
    ["Backend (Node.js)", "BACKEND"],
    ["Web", "WEB_FRONTEND"],
    ["React Web", "WEB_FRONTEND"],
    ["UI Estimates", "WEB_FRONTEND"],
    ["Web/Frontend (React)", "WEB_FRONTEND"],
    ["MobileApp", "MOBILE"],
    ["Flutter (mobile app)", "MOBILE"],
    ["Dev Mobile Estimates", "MOBILE"],
    ["Mobile (React Native)", "MOBILE"],
    ["Admin Panel", "ADMIN_PANEL"],
    ["Dev Admin Estimates", "ADMIN_PANEL"],
    ["Admin Panel (React)", "ADMIN_PANEL"],
    ["Cloud Infra", "CLOUD_INFRA"],
    ["Cloud/Infrastructure (AWS)", "CLOUD_INFRA"],
    ["GD Estimates (Web)", "GD"],
    ["GD Estimates", "GD"],
    ["QA Estimates", "QA"],
    ["PM Estimates", "PM"],
    ["Questions", "QUESTIONS"],
    ["Summary", "SUMMARY"],
    ["MVP", "UNKNOWN"],
  ])("%s → %s", (name, kind) => {
    expect(classifySheet(name)).toBe(kind);
  });
});
