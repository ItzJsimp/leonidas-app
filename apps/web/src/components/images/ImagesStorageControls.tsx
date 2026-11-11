import { useState } from "react";
import { Button } from "../ui/button";
import { Popover, PopoverPopup, PopoverTitle, PopoverTrigger } from "../ui/popover";
import { Switch } from "../ui/switch";
import type { ImagesApi } from "./useImagesCatalog";

export function ImagesStorageControls({ api }: { readonly api: ImagesApi }) {
  const [saving, setSaving] = useState(false);
  if (!api.setRetention) return null;
  return (
    <Popover>
      <PopoverTrigger render={<Button size="sm" variant="outline" />}>Storage</PopoverTrigger>
      <PopoverPopup className="w-80">
        <div className="flex flex-col gap-3">
          <PopoverTitle>Image storage</PopoverTitle>
          <label className="flex items-center justify-between gap-4 text-sm">
            <span>Delete unkept images after 30 days</span>
            <Switch
              checked={api.retentionEnabled ?? false}
              disabled={saving}
              onCheckedChange={(enabled) => {
                setSaving(true);
                void api.setRetention?.(enabled).finally(() => setSaving(false));
              }}
            />
          </label>
          <p className="text-xs text-muted-foreground">
            Cleanup runs when you open Images. Kept images stay. This setting applies to every
            project on this computer.
          </p>
        </div>
      </PopoverPopup>
    </Popover>
  );
}
