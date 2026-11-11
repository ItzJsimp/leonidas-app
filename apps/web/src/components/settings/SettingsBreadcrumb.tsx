import {
  WorkspaceBreadcrumb,
  WorkspaceBreadcrumbItem,
  WorkspaceBreadcrumbSeparator,
  WorkspaceBreadcrumbText,
} from "../WorkspaceBreadcrumb";
import { SETTINGS_SECTION_LABELS } from "./settingsSearch";

const SETTINGS_BREADCRUMB_LABELS: Readonly<Record<string, string>> = {
  ...SETTINGS_SECTION_LABELS,
  "/settings/open-source-licenses": "Open source licenses",
};

function settingsBreadcrumbLabel(pathname: string): string | null {
  const normalizedPathname = pathname.replace(/\/+$/, "") || "/";
  return SETTINGS_BREADCRUMB_LABELS[normalizedPathname] ?? null;
}

export function SettingsBreadcrumb({ pathname }: { pathname: string }) {
  const sectionLabel = settingsBreadcrumbLabel(pathname);

  return (
    <WorkspaceBreadcrumb ariaLabel="Settings breadcrumb">
      {sectionLabel ? (
        <>
          <WorkspaceBreadcrumbItem className="hidden sm:flex">Settings</WorkspaceBreadcrumbItem>
          <WorkspaceBreadcrumbSeparator className="hidden sm:flex" />
        </>
      ) : null}
      <WorkspaceBreadcrumbItem current>
        <WorkspaceBreadcrumbText title={sectionLabel ?? "Settings"}>
          {sectionLabel ?? "Settings"}
        </WorkspaceBreadcrumbText>
      </WorkspaceBreadcrumbItem>
    </WorkspaceBreadcrumb>
  );
}
