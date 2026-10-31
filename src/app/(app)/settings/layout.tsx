import { can } from "@/server/auth/permissions";
import { requireUser } from "@/server/auth/session";
import { SettingsTabs } from "./settings-tabs";

// Per request: every settings page reads the signed-in person and the database.
export const instant = false;

// Settings is Admin only (specs/user-roles, specs/tech-stack-catalog). Pages also check on their
// own, and every action checks again on the server.
export default async function SettingsLayout({ children }: LayoutProps<"/settings">) {
  const user = await requireUser("/settings/people");
  if (!can(user.role, "settings.manage")) {
    return (
      <div className="mx-auto max-w-xl py-10">
        <h1 className="text-2xl font-bold tracking-tight">
          You don&apos;t have access to this page
        </h1>
        <p className="mt-2 text-foreground-2">Only Admins can manage settings.</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-6">
      <SettingsTabs />
      {children}
    </div>
  );
}
