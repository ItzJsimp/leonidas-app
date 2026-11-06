// Windows pins depend on this launch path. Keep it separate from visible branding.
export function windowsExecutableName(version: string): string {
  return /-nightly\.\d{8}\.\d+$/.test(version) ? "Leonidas Code (Nightly)" : "Leonidas Code";
}
