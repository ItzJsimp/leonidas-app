import { PlusIcon } from "lucide-react";

import { Button } from "~/components/ui/button";
import { Menu, MenuItem, MenuPopup, MenuSeparator, MenuTrigger } from "~/components/ui/menu";

import { FORM_TITLES, type FormKind } from "./addMenu.logic";

const ADD_ITEMS = ["account", "attempt", "result", "fee", "payout", "cost"] as const;

/** The Add button for the Dashboard header. It only picks a form. The route shows the dialog. */
export function AddMenu({ onSelect }: { readonly onSelect: (form: FormKind) => void }) {
  return (
    <Menu>
      <MenuTrigger render={<Button size="sm" variant="outline" />}>
        <PlusIcon aria-hidden />
        Add
      </MenuTrigger>
      <MenuPopup align="end">
        {ADD_ITEMS.map((kind) => (
          <MenuItem key={kind} onClick={() => onSelect(kind)}>
            {FORM_TITLES[kind]}
          </MenuItem>
        ))}
        <MenuSeparator />
        <MenuItem onClick={() => onSelect("edit")}>Edit an entry</MenuItem>
      </MenuPopup>
    </Menu>
  );
}
