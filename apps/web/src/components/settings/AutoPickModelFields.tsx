import { useEffect, useState } from "react";

import { Input } from "../ui/input";

/** The same rule the server schema enforces: ids such as `openrouter/free` or `gemma4:12b`. */
const MODEL_ID = /^[A-Za-z0-9._:/-]{0,100}$/;

function ModelField(props: {
  label: string;
  value: string;
  placeholder: string;
  onCommit: (value: string) => void;
}) {
  const { label, value, placeholder, onCommit } = props;
  // A local draft lets the field be emptied mid-edit; the setting only moves on a valid id.
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const valid = MODEL_ID.test(draft);
  return (
    <label className="flex flex-col gap-1 text-xs text-muted-foreground sm:flex-row sm:items-center sm:gap-3">
      <span className="shrink-0 sm:w-28">{label}</span>
      <Input
        size="sm"
        className="w-full sm:w-72"
        value={draft}
        placeholder={placeholder}
        aria-invalid={!valid}
        spellCheck={false}
        onChange={(event) => setDraft(event.target.value.trim())}
        onBlur={() => {
          if (valid && draft !== value) onCommit(draft);
          else setDraft(value);
        }}
      />
    </label>
  );
}

/** One model id per engine. An empty id skips that engine. */
export function AutoPickModelFields(props: {
  openRouterModel: string;
  groqModel: string;
  localModel: string;
  onChange: (
    patch: Partial<{ openRouterModel: string; groqModel: string; localModel: string }>,
  ) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <ModelField
        label="OpenRouter"
        value={props.openRouterModel}
        placeholder="openrouter/free"
        onCommit={(openRouterModel) => props.onChange({ openRouterModel })}
      />
      <ModelField
        label="Groq"
        value={props.groqModel}
        placeholder="qwen/qwen3.8-27b"
        onCommit={(groqModel) => props.onChange({ groqModel })}
      />
      <ModelField
        label="Local (Ollama)"
        value={props.localModel}
        placeholder="Empty skips the local model"
        onCommit={(localModel) => props.onChange({ localModel })}
      />
    </div>
  );
}
