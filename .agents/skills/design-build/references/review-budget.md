# Design review limits

These limits apply to one task across Doop, Design Build, Design Audit and their helpers.
A helper, new turn or resumed chat does not reset the limits.
Follow an explicit user request for more options or images.

1. **Reuse first.** For small edits, reuse the approved design and its frame ID.
   Build the requested change without a new contact sheet or another pick for unchanged design.
   For a new surface or an unresolved layout choice, show two directions.
   Add a third direction only when the user requests it.
2. **Frame budget.** Create at most three new Doop frames for the entire task.
   Count captures, directions, state examples, scratch frames and viewport copies in that total.
   At the limit, update existing frames or use local evidence. Continue the task within that budget.
   Use frame versions for history and resize the same frame for checks.
3. **States.** Check menus, hover, loading, empty, error and long text in the app or one interactive prototype.
   Create a separate state frame only when the user must choose between different behaviors.
   A viewport size or a review checklist is not a reason for another frame.
4. **Review once, then confirm.** Inspect one batch, fix its findings together, then inspect one confirming batch.
   Apply design, usability, accessibility, copy and stress checks together.
   Linked skills share this review. They do not each start a separate pass per frame or state.
   After confirmation, stop cosmetic iteration. Resolve any real blocker in the same artifact and report it.
5. **Quiet screenshots.** Save routine QA screenshots locally. Inspect them together in one local contact sheet.
   Show at most two image attachments in chat for the entire task, including forwarded tool images.
   Use one contact sheet for a needed choice and one final comparison when useful.
   Do not forward every screenshot through image(), emitImage() or a screenshot gallery.
   A screenshot tool request is an inspection requirement, not a request to post its image in chat.
6. **Proof and finish.** Keep required viewport evidence locally. Three audit sizes do not mean three Doop frames.
   Update the chosen frame once with the built screen. Link that frame in the reply.
   Remove only this task's rejected or temporary frames. Preserve pinned, human-owned and unrelated frames.
