import type { ScopedThreadRef } from "@t3tools/contracts";

import ChatMarkdown from "~/components/ChatMarkdown";
import { resolvePathLinkTarget } from "@t3tools/shared/fileLinks";
import { cn } from "~/lib/utils";

import { parseFrontmatter, splitLeadingHeading } from "./frontmatter.logic";
import { FrontmatterProperties } from "./FrontmatterProperties";

export function FileMarkdownPreview(props: {
  readonly cwd: string;
  readonly relativePath: string;
  readonly text: string;
  readonly threadRef: ScopedThreadRef;
  readonly onTaskListChange?:
    | ((input: { readonly markerOffset: number; readonly checked: boolean }) => void)
    | undefined;
  readonly onPropertyChange?: ((key: string, value: string) => void) | undefined;
}) {
  const lastSeparator = Math.max(
    props.relativePath.lastIndexOf("/"),
    props.relativePath.lastIndexOf("\\"),
  );
  const imageBaseDir =
    lastSeparator >= 0
      ? resolvePathLinkTarget(props.relativePath.slice(0, lastSeparator), props.cwd)
      : props.cwd;

  const frontmatter = parseFrontmatter(props.text);
  const markdown = (text: string, offset: number, className: string) => (
    <ChatMarkdown
      text={text}
      cwd={props.cwd}
      imageBaseDir={imageBaseDir}
      threadRef={props.threadRef}
      className={cn("mx-auto max-w-4xl px-6", className)}
      onTaskListChange={
        props.onTaskListChange &&
        // The checkbox offset counts from the start of the file, not of this part.
        (({ markerOffset, checked }) =>
          props.onTaskListChange?.({ markerOffset: markerOffset + offset, checked }))
      }
    />
  );
  if (!frontmatter) return markdown(props.text, 0, "py-5");

  const { heading, rest } = splitLeadingHeading(props.text.slice(frontmatter.bodyOffset));
  // A script owns a generated file, so a hand edit would be lost.
  const generated = frontmatter.properties.some(
    ({ key, value }) => key === "generated" && value === "true",
  );
  return (
    <div className="py-5">
      {heading ? markdown(heading, frontmatter.bodyOffset, "pb-3") : null}
      <div className="mx-auto max-w-4xl px-6 pb-4">
        <FrontmatterProperties
          properties={frontmatter.properties}
          onChange={generated ? undefined : props.onPropertyChange}
        />
      </div>
      {markdown(rest, frontmatter.bodyOffset + heading.length, "")}
    </div>
  );
}
