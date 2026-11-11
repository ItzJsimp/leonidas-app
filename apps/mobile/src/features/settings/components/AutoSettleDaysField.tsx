import {
  MAX_SIDEBAR_AUTO_SETTLE_AFTER_DAYS,
  MIN_SIDEBAR_AUTO_SETTLE_AFTER_DAYS,
} from "@t3tools/contracts";
import type { ComponentProps } from "react";
import { NumberField } from "../../../components/ui/NumberField";

export type AutoSettleDaysFieldProps = Pick<
  ComponentProps<typeof NumberField>,
  "value" | "onValueChange" | "disabled"
>;

export function AutoSettleDaysField(props: AutoSettleDaysFieldProps) {
  return (
    <AppTextInput
      className="min-h-10 w-20 rounded-xl px-3 py-2 text-center text-base"
      keyboardType="number-pad"
      returnKeyType="done"
      value={draft ?? String(props.value)}
      onChangeText={setDraft}
      onBlur={commit}
      onSubmitEditing={commit}
      accessibilityLabel="Days before a chat is marked as done"
      editable={!props.disabled}
    />
  );
}
