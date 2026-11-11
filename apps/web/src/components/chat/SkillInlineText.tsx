import { formatProviderSkillDisplayName } from "@t3tools/shared/inlineSkills";
import { Children, cloneElement, isValidElement, type ReactNode } from "react";
import { matchInlineSkills, type InlineSkill } from "@t3tools/shared/inlineSkills";

import { BotIcon } from "lucide-react";

import { SKILL_CHIP_ICON_SVG } from "../composerInlineChip";
import { splitSubagentMentions } from "../subagents/subagentThread.logic";
import { ContextChip, ContextChipLabel } from "../ContextChip";

const NO_SUBAGENTS: ReadonlyArray<string> = [];

/** Prose with `@name` parts for known subagents turned into chips. */
function SubagentInlineText(props: { text: string; subagents: ReadonlyArray<string> }) {
  const parts = splitSubagentMentions(props.text, props.subagents);
  if (parts.length === 1 && parts[0]?.kind === "text") return <>{props.text}</>;
  return (
    <>
      {parts.map((part, index) =>
        part.kind === "text" ? (
          part.text
        ) : (
          <ContextChip key={`${index}:${part.name}`} kind="skill" data-markdown-copy={part.raw}>
            <BotIcon aria-hidden />
            <ContextChipLabel>{part.name}</ContextChipLabel>
          </ContextChip>
        ),
      )}
    </>
  );
}

export function SkillInlineText(props: {
  text: string;
  skills: ReadonlyArray<InlineSkill>;
  subagents?: ReadonlyArray<string>;
}) {
  const subagents = props.subagents ?? NO_SUBAGENTS;
  const nodes: ReactNode[] = [];
  let cursor = 0;

  for (const { start, end, skill, rawText } of matchInlineSkills(props.text, props.skills)) {
    if (start > cursor) {
      nodes.push(
        <SubagentInlineText
          key={`t${cursor}`}
          text={props.text.slice(cursor, start)}
          subagents={subagents}
        />,
      );
    }
    nodes.push(<SkillChip key={`${start}:${skill.name}`} skill={skill} rawText={rawText} />);
    cursor = end;
  }

  if (cursor === 0) {
    return <SubagentInlineText text={props.text} subagents={subagents} />;
  }
  if (cursor < props.text.length) {
    nodes.push(
      <SubagentInlineText
        key={`t${cursor}`}
        text={props.text.slice(cursor)}
        subagents={subagents}
      />,
    );
  }
  return <>{nodes}</>;
}

export function renderSkillInlineMarkdownChildren(
  children: ReactNode,
  skills: ReadonlyArray<InlineSkill>,
  subagents: ReadonlyArray<string> = NO_SUBAGENTS,
): ReactNode {
  return Children.map(children, (child) => {
    if (typeof child === "string") {
      return <SkillInlineText text={child} skills={skills} subagents={subagents} />;
    }
    if (!isValidElement<{ children?: ReactNode; node?: { tagName?: string } }>(child)) {
      return child;
    }
    // Custom react-markdown components replace the intrinsic type, so also
    // check the hast node they carry.
    const markdownTagName = typeof child.type === "string" ? child.type : child.props.node?.tagName;
    if (markdownTagName === "code" || markdownTagName === "a") {
      return child;
    }
    if (!("children" in child.props)) {
      return child;
    }
    return cloneElement(
      child,
      undefined,
      renderSkillInlineMarkdownChildren(child.props.children, skills, subagents),
    );
  });
}

function SkillChip(props: { skill: InlineSkill; rawText: string }) {
  return (
    <ContextChip kind="skill" data-markdown-copy={props.rawText}>
      <SkillChipIcon />
      <ContextChipLabel>{formatProviderSkillDisplayName(props.skill)}</ContextChipLabel>
    </ContextChip>
  );
}

export function SkillChipIcon() {
  return (
    <span
      aria-hidden="true"
      className="contents"
      dangerouslySetInnerHTML={{ __html: SKILL_CHIP_ICON_SVG }}
    />
  );
}
