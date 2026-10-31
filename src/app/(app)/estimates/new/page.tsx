import type { Metadata } from "next";
import { requireRole } from "@/server/auth/session";
import { wizardProps } from "../wizard/load";
import { Wizard } from "../wizard/wizard";

export const metadata: Metadata = { title: "New estimation request · F3 Estimation Tool" };

export default async function NewRequestPage() {
  const user = await requireRole("/estimates/new");
  if (!user) return null; // the layout shows the waiting page
  return <Wizard {...await wizardProps(user, null, 1)} />;
}
