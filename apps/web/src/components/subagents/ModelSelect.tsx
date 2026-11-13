import { useAtomValue } from "@effect/atom-react";

import {
  Select,
  SelectGroup,
  SelectGroupLabel,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { primaryServerProvidersAtom } from "~/state/server";

import { connectedModelGroups, unconnectedModel } from "./modelOptions.logic";
import { modelDisplayName } from "./spawnApproval.logic";

const UNSET = "__unset__";

/**
 * A list of the models that the connected accounts offer. A model that the agent file names but
 * no connected account offers stays visible, marked "not connected", so the row never goes blank.
 * `unsetLabel` adds a "no model" choice. The value is the model slug, or "" for none.
 */
export function ModelSelect(props: {
  readonly value: string;
  readonly onChange: (model: string) => void;
  readonly unsetLabel?: string;
  readonly disabled?: boolean;
  readonly id?: string;
  readonly className?: string;
  readonly "aria-label"?: string;
}) {
  const providers = useAtomValue(primaryServerProvidersAtom);
  const groups = connectedModelGroups(providers);
  const missing = unconnectedModel(groups, props.value);
  const current = props.value.trim();

  const items = [
    ...(props.unsetLabel === undefined ? [] : [{ value: UNSET, label: props.unsetLabel }]),
    ...(missing === null
      ? []
      : [{ value: missing, label: `${modelDisplayName(missing)} (not connected)` }]),
    ...groups.flatMap((group) =>
      group.models.map((model) => ({ value: model.slug, label: model.label })),
    ),
  ];

  return (
    <Select
      value={current === "" ? UNSET : current}
      items={items}
      disabled={props.disabled}
      onValueChange={(next) => {
        if (typeof next === "string") props.onChange(next === UNSET ? "" : next);
      }}
    >
      <SelectTrigger
        id={props.id}
        size="sm"
        className={props.className}
        aria-label={props["aria-label"]}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectPopup alignItemWithTrigger={false}>
        {props.unsetLabel === undefined ? null : (
          <SelectItem value={UNSET}>{props.unsetLabel}</SelectItem>
        )}
        {missing === null ? null : (
          <SelectGroup>
            <SelectGroupLabel>Not connected</SelectGroupLabel>
            <SelectItem value={missing}>{modelDisplayName(missing)} (not connected)</SelectItem>
          </SelectGroup>
        )}
        {groups.map((group) => (
          <SelectGroup key={group.provider}>
            <SelectGroupLabel>{group.provider}</SelectGroupLabel>
            {group.models.map((model) => (
              <SelectItem key={model.slug} value={model.slug}>
                {model.label}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectPopup>
    </Select>
  );
}
