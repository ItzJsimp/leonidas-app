import { useRef, useCallback, useLayoutEffect, useEffect } from "react";
import { shouldAnimateComposerRestingTransition } from "../composerFooterLayout";
import { observeResize } from "~/lib/observeResize";

export const COMPOSER_SCROLL_COLLAPSE_THRESHOLD_PX = 24;

export const COMPOSER_SCROLL_GESTURE_RESET_MS = 120;

const COMPOSER_RESTING_TRANSITION_CLEANUP_BUFFER_MS = 50;

const COMPOSER_RESTING_TRANSITION_EASING = "cubic-bezier(0.32, 0.72, 0, 1)";

const COMPOSER_RESTING_CONTROLS_ARRIVAL_DRIFT_PX = 4;

export function useComposerRestingTransition(
  isCollapsed: boolean,
  isResting: boolean,
  restingControlsRef: React.RefObject<HTMLDivElement | null>,
  onOverlayHeightChange: (height: number) => void,
  animationsActive: boolean,
  animationDurationMs: number,
) {
  const elementRef = useRef<HTMLDivElement>(null);
  const isCollapsedRef = useRef(isCollapsed);
  const previousCollapsedRef = useRef(isCollapsed);
  const previousRestingRef = useRef(isResting);
  const previousHeightRef = useRef<number | null>(null);
  const previousModelStripHeightRef = useRef<number | null>(null);
  const previousContentOffsetsRef = useRef<{
    promptFromTop: number | null;
    promptHeight: number | null;
    actionFromBottom: number | null;
    controlsFromBottom: number | null;
    controlsFromLeft: number | null;
    surfaceBottomInset: number | null;
  }>({
    promptFromTop: null,
    promptHeight: null,
    actionFromBottom: null,
    controlsFromBottom: null,
    controlsFromLeft: null,
    surfaceBottomInset: null,
  });
  const animationRef = useRef<Animation | null>(null);
  const animationTargetHeightRef = useRef<number | null>(null);
  const contentAnimationsRef = useRef<Animation[]>([]);
  const stateChangeAnimationsRef = useRef<Animation[]>([]);
  const pinnedOverlayRef = useRef<HTMLElement | null>(null);
  const transitionCleanupTimeoutRef = useRef<number | null>(null);
  const transitionLayoutRequestRef = useRef(0);
  const hasCompletedInitialLayoutRef = useRef(false);

  const clearOverlayPin = useCallback(() => {
    // The overlay belongs to the chat view and outlives this composer, so it
    // is remembered from pin time rather than re-resolved through a ref that
    // React may already have detached during unmount.
    const overlay = pinnedOverlayRef.current;
    pinnedOverlayRef.current = null;
    overlay?.style.removeProperty("height");
    overlay?.style.removeProperty("display");
    overlay?.style.removeProperty("flex-direction");
    overlay?.style.removeProperty("justify-content");
  }, []);

  const clearTransitionStyles = useCallback(() => {
    const element = elementRef.current;
    const footer = element?.querySelector<HTMLElement>('[data-chat-composer-footer="true"]');
    element?.style.removeProperty("overflow");
    element?.style.removeProperty("clip-path");
    element?.style.removeProperty("overflow-clip-margin");
    element
      ?.querySelector<HTMLElement>('[data-chat-composer-surface="true"]')
      ?.style.removeProperty("height");
    footer?.style.removeProperty("position");
    footer?.style.removeProperty("top");
    footer?.style.removeProperty("bottom");
    footer?.style.removeProperty("left");
    footer?.style.removeProperty("right");
    footer?.style.removeProperty("height");
    const shell = element?.closest<HTMLElement>('[data-slot="composer-shell"]');
    shell?.removeAttribute("data-model-strip-transition");
    const modelStrip = shell?.querySelector<HTMLElement>('[data-composer-model-strip="true"]');
    for (const property of [
      "position",
      "top",
      "visibility",
      "height",
      "min-height",
      "padding-top",
      "align-items",
      "z-index",
      "pointer-events",
    ]) {
      modelStrip?.style.removeProperty(property);
    }
    clearOverlayPin();
  }, [clearOverlayPin]);

  isCollapsedRef.current = isCollapsed;

  const transitionToCurrentGeometry = useCallback(
    (stateChanged: boolean) => {
      const element = elementRef.current;
      const surface = element?.querySelector<HTMLElement>('[data-chat-composer-surface="true"]');
      if (!element || !surface) return;

      const nextIsCollapsed = isCollapsedRef.current;

      const visibleTransitionElement = (selector: string) =>
        Array.from(element.querySelectorAll<HTMLElement>(selector)).find(
          (candidate) => candidate.getClientRects().length > 0,
        ) ?? null;
      const prompt = visibleTransitionElement(
        '[data-composer-prompt-surface="true"], [data-chat-composer-transition-prompt="true"]',
      );
      const action = visibleTransitionElement('[data-chat-composer-transition-actions="true"]');
      const footer = element.querySelector<HTMLElement>('[data-chat-composer-footer="true"]');
      const continuousControls =
        element.dataset.inlineRestingControls === "true" ||
        element.dataset.modelOnlyStrip === "true";
      const controls = nextIsCollapsed
        ? restingControlsRef.current
        : element.querySelector<HTMLElement>('[data-chat-composer-controls="left"]');

      const shell = element.closest<HTMLElement>('[data-slot="composer-shell"]');
      const modelStrip = shell?.querySelector<HTMLElement>('[data-composer-model-strip="true"]');
      const interruptedStripHeight =
        animationRef.current && modelStrip ? modelStrip.getBoundingClientRect().height : null;
      const interruptedAnimation = animationRef.current;
      const interruptedPromptTop = interruptedAnimation
        ? (prompt?.getBoundingClientRect().top ?? null)
        : null;
      const interruptedActionTop = interruptedAnimation
        ? (action?.getBoundingClientRect().top ?? null)
        : null;
      const interruptedControlsLeft = interruptedAnimation
        ? (controls?.getBoundingClientRect().left ?? null)
        : null;
      const interruptedControlsTop = interruptedAnimation
        ? (controls?.getBoundingClientRect().top ?? null)
        : null;
      const interruptedHeight = interruptedAnimation
        ? element.getBoundingClientRect().height
        : null;
      const interruptedTargetHeight = animationTargetHeightRef.current;
      const interruptedCurrentTime =
        typeof interruptedAnimation?.currentTime === "number"
          ? interruptedAnimation.currentTime
          : null;
      const interruptedDuration = interruptedAnimation?.effect?.getComputedTiming().duration;
      if (transitionCleanupTimeoutRef.current !== null) {
        window.clearTimeout(transitionCleanupTimeoutRef.current);
        transitionCleanupTimeoutRef.current = null;
      }
      interruptedAnimation?.cancel();
      animationRef.current = null;
      for (const animation of contentAnimationsRef.current) animation.cancel();
      contentAnimationsRef.current = [];
      // The reveal and fade animations keep their own schedule across the
      // body-resize re-entries that retarget the geometry mid-flight (every
      // transition with a draft triggers one); cancelling them there would
      // pop their subjects to full visibility at the start of the tween.
      if (stateChanged) {
        for (const animation of stateChangeAnimationsRef.current) animation.cancel();
        stateChangeAnimationsRef.current = [];
      }
      clearTransitionStyles();

      const nextRect = element.getBoundingClientRect();
      const nextHeight = nextRect.height;
      const nextModelStripHeight = modelStrip?.getBoundingClientRect().height ?? null;
      // The chat view resize-observes the overlay to place the timeline
      // inset, the scroll-to-end pill, and the mini player. Publishing the
      // destination height here turns that feedback into one update instead
      // of a ChatView re-render on every animation frame.
      const overlay = element.closest<HTMLElement>('[data-chat-composer-overlay="true"]');
      const overlayRect = overlay?.getBoundingClientRect();
      const overlayHeight = overlayRect?.height ?? null;
      if (overlayHeight !== null) {
        onOverlayHeightChange(overlayHeight);
      }
      const nextPromptRect = prompt?.getBoundingClientRect() ?? null;
      const nextPromptTop = nextPromptRect?.top ?? null;
      const nextActionTop = action?.getBoundingClientRect().top ?? null;
      const nextControlsRect = controls?.getBoundingClientRect() ?? null;
      const nextControlsTop = nextControlsRect?.top ?? null;
      const footerBottom = footer ? nextRect.bottom - footer.getBoundingClientRect().bottom : 1;
      const previousHeight = interruptedHeight ?? previousHeightRef.current;
      const targetChanged =
        interruptedTargetHeight === null || Math.abs(interruptedTargetHeight - nextHeight) >= 0.5;
      const shouldAnimate = shouldAnimateComposerRestingTransition({
        hasCompletedInitialLayout: hasCompletedInitialLayoutRef.current,
        stateChanged,
        hasInterruptedAnimation: interruptedHeight !== null,
      });

      if (
        shouldAnimate &&
        animationsActive &&
        previousHeight !== null &&
        Math.abs(previousHeight - nextHeight) >= 0.5
      ) {
        const remainingDuration =
          typeof interruptedDuration === "number" && interruptedCurrentTime !== null
            ? Math.max(1, interruptedDuration - interruptedCurrentTime)
            : animationDurationMs;
        const duration =
          interruptedHeight !== null && !targetChanged ? remainingDuration : animationDurationMs;
        element.style.overflow = "clip";
        if (modelStrip) {
          // The model controls cross the input's lower edge on their way to the strip.
          const controlsClearance = Math.max(
            nextModelStripHeight ?? 0,
            previousModelStripHeightRef.current ?? 0,
          );
          element.style.overflowClipMargin = `${controlsClearance}px`;
          element.style.clipPath = `inset(0 0 -${controlsClearance}px 0)`;
        }
        surface.style.height = "100%";

        // Pinning the overlay at the destination height keeps the resize
        // observer quiet for the tween; bottom alignment keeps the animating
        // surface glued to the overlay's stable bottom edge. The pin lasts
        // only for the tween so later attachment, thread, font, and viewport
        // changes remain natural.
        if (overlay && overlayHeight !== null) {
          overlay.style.height = `${String(overlayHeight)}px`;
          overlay.style.display = "flex";
          overlay.style.flexDirection = "column";
          overlay.style.justifyContent = "flex-end";
          pinnedOverlayRef.current = overlay;
        }

        // Keep the footer attached to the stable bottom edge while the outer
        // height changes. Its resting absolute layout otherwise spans the old
        // height on collapse, while its expanded flow layout falls below the
        // clipped surface on expansion.
        if (footer) {
          footer.style.position = "absolute";
          footer.style.top = "auto";
          footer.style.bottom = `${String(footerBottom)}px`;
          footer.style.height = "3rem";
          if (nextIsCollapsed) {
            footer.style.left = "auto";
            footer.style.right = "1px";
          } else {
            footer.style.left = "1px";
            footer.style.right = "1px";
          }
        }

        let stripAnimation: Animation | null = null;
        if (modelStrip) {
          const stripHeight = modelStrip.getBoundingClientRect().height;
          const stripOverlap = -Number.parseFloat(getComputedStyle(modelStrip).marginTop);
          const fromHeight =
            interruptedStripHeight ??
            (previousCollapsedRef.current
              ? (previousModelStripHeightRef.current ?? stripHeight)
              : stripOverlap);
          const toHeight = nextIsCollapsed ? stripHeight : stripOverlap;
          modelStrip.style.position = "relative";
          modelStrip.style.top = "auto";
          modelStrip.style.visibility = "visible";
          modelStrip.style.minHeight = "0";
          // Padding must not impose a 24px minimum on the 16px overlap endpoint.
          // Keep the controls bottom-aligned while the strip retracts behind the input.
          modelStrip.style.paddingTop = "0";
          modelStrip.style.alignItems = "flex-end";
          modelStrip.style.pointerEvents = "none";
          modelStrip.style.zIndex = "20";
          shell?.setAttribute("data-model-strip-transition", "true");
          stripAnimation = modelStrip.animate(
            [{ height: `${fromHeight}px` }, { height: `${toHeight}px` }],
            { duration, easing: COMPOSER_RESTING_TRANSITION_EASING, fill: "both" },
          );
        }

        const animation = element.animate(
          [{ height: `${previousHeight}px` }, { height: `${nextHeight}px` }],
          {
            duration,
            easing: COMPOSER_RESTING_TRANSITION_EASING,
            fill: "both",
          },
        );
        animationRef.current = animation;
        animationTargetHeightRef.current = nextHeight;

        const animatedRect = element.getBoundingClientRect();
        const previousBottom =
          overlayRect && previousContentOffsetsRef.current.surfaceBottomInset !== null
            ? overlayRect.bottom - previousContentOffsetsRef.current.surfaceBottomInset
            : animatedRect.bottom;
        const bottomShift = previousBottom - animatedRect.bottom;
        const previousPromptTop =
          interruptedPromptTop ??
          (previousContentOffsetsRef.current.promptFromTop === null
            ? null
            : animatedRect.top + bottomShift + previousContentOffsetsRef.current.promptFromTop);
        const previousActionTop =
          interruptedActionTop ??
          (previousContentOffsetsRef.current.actionFromBottom === null
            ? null
            : previousBottom - previousContentOffsetsRef.current.actionFromBottom);
        const contentAnimations: Animation[] = stripAnimation ? [stripAnimation] : [];
        const animateContentPosition = (
          content: HTMLElement | null,
          previousTop: number | null,
          previousLeft: number | null = null,
        ) => {
          if (!content || previousTop === null) return;
          const rect = content.getBoundingClientRect();
          const offset = previousTop - rect.top;
          const offsetX = previousLeft === null ? 0 : previousLeft - rect.left;
          if (Math.abs(offset) < 0.5 && Math.abs(offsetX) < 0.5) return;
          contentAnimations.push(
            content.animate(
              [{ transform: `translate(${offsetX}px, ${offset}px)` }, { transform: "none" }],
              {
                duration,
                easing: COMPOSER_RESTING_TRANSITION_EASING,
              },
            ),
          );
        };
        animateContentPosition(prompt, previousPromptTop);
        animateContentPosition(action, previousActionTop);
        if (continuousControls) {
          const previousControlsTop =
            interruptedControlsTop ??
            (previousContentOffsetsRef.current.controlsFromBottom === null
              ? null
              : previousBottom - previousContentOffsetsRef.current.controlsFromBottom);
          const previousControlsLeft =
            interruptedControlsLeft ??
            (previousContentOffsetsRef.current.controlsFromLeft === null
              ? null
              : animatedRect.left + previousContentOffsetsRef.current.controlsFromLeft);
          animateContentPosition(controls, previousControlsTop, previousControlsLeft);
        }
        contentAnimationsRef.current = contentAnimations;

        if (stateChanged) {
          const stateChangeAnimations: Animation[] = [];

          // A prompt that gains lines on expansion would otherwise slide up
          // from under the footer band as one block. Opening a bottom clip in
          // step with the tween instead unfurls the extra lines beneath the
          // rising first line, so no text crosses the returning controls.
          const previousPromptHeight = previousContentOffsetsRef.current.promptHeight;
          if (
            !nextIsCollapsed &&
            prompt &&
            nextPromptRect &&
            previousPromptHeight !== null &&
            nextPromptRect.height - previousPromptHeight >= 0.5
          ) {
            const hiddenHeight = nextPromptRect.height - previousPromptHeight;
            stateChangeAnimations.push(
              prompt.animate(
                [
                  { clipPath: `inset(0 0 ${String(hiddenHeight)}px 0)` },
                  { clipPath: "inset(0 0 0 0)" },
                ],
                {
                  duration,
                  easing: COMPOSER_RESTING_TRANSITION_EASING,
                },
              ),
            );
          }

          // The footer controls teleport between the composer footer and the
          // context strip below it in a single commit. Fading the arriving
          // cluster in along its direction of travel reads as one continuous
          // move instead of a pop. Collapsing controls land in empty strip
          // space and can appear immediately, but expanding controls return
          // to the bottom row the prompt still occupies while the surface is
          // short, so they stay hidden through the first half of the tween
          // and fade in once the geometry has mostly settled.
          const arrivingControls = nextIsCollapsed
            ? restingControlsRef.current
            : element.querySelector<HTMLElement>('[data-chat-composer-controls="left"]');
          if (arrivingControls && !continuousControls) {
            const drift = nextIsCollapsed
              ? -COMPOSER_RESTING_CONTROLS_ARRIVAL_DRIFT_PX
              : COMPOSER_RESTING_CONTROLS_ARRIVAL_DRIFT_PX;
            stateChangeAnimations.push(
              arrivingControls.animate(
                [
                  { opacity: 0, transform: `translateY(${String(drift)}px)` },
                  { opacity: 1, transform: "none" },
                ],
                {
                  duration: nextIsCollapsed ? duration : duration / 2,
                  delay: nextIsCollapsed ? 0 : duration / 2,
                  fill: "backwards",
                  easing: COMPOSER_RESTING_TRANSITION_EASING,
                },
              ),
            );
          }

          const arrivingImagePreviews = nextIsCollapsed
            ? Array.from(
                element.querySelectorAll<HTMLElement>('[data-chat-composer-resting-images="true"]'),
              )
            : Array.from(
                element.querySelectorAll<HTMLElement>('[data-chat-composer-expanded-image="true"]'),
              );
          for (const imagePreview of arrivingImagePreviews) {
            stateChangeAnimations.push(
              imagePreview.animate([{ opacity: 0 }, { opacity: 1 }], {
                duration: nextIsCollapsed ? duration : duration / 2,
                delay: nextIsCollapsed ? 0 : duration / 2,
                fill: "backwards",
                easing: COMPOSER_RESTING_TRANSITION_EASING,
              }),
            );
          }
          stateChangeAnimationsRef.current = stateChangeAnimations;
        }

        const finishTransition = (cancelAnimations: boolean) => {
          if (animationRef.current !== animation) return;
          if (transitionCleanupTimeoutRef.current !== null) {
            window.clearTimeout(transitionCleanupTimeoutRef.current);
            transitionCleanupTimeoutRef.current = null;
          }
          if (cancelAnimations) {
            animation.cancel();
            for (const contentAnimation of contentAnimationsRef.current) {
              contentAnimation.cancel();
            }
            for (const stateChangeAnimation of stateChangeAnimationsRef.current) {
              stateChangeAnimation.cancel();
            }
          }
          animationRef.current = null;
          animationTargetHeightRef.current = null;
          contentAnimationsRef.current = [];
          stateChangeAnimationsRef.current = [];
          animation.cancel();
          stripAnimation?.cancel();
          clearTransitionStyles();
        };
        void animation.finished.catch(() => undefined).then(() => finishTransition(false));
        // A suspended document timeline can leave `finished` pending while
        // these measurement styles remain active. Wall-clock cleanup makes
        // the natural layout the eventual source of truth in that case.
        transitionCleanupTimeoutRef.current = window.setTimeout(
          () => finishTransition(true),
          duration + COMPOSER_RESTING_TRANSITION_CLEANUP_BUFFER_MS,
        );
      } else {
        animationTargetHeightRef.current = null;
      }

      previousCollapsedRef.current = nextIsCollapsed;
      previousHeightRef.current = nextHeight;
      previousModelStripHeightRef.current = nextModelStripHeight;
      previousContentOffsetsRef.current = {
        promptFromTop: nextPromptTop === null ? null : nextPromptTop - nextRect.top,
        promptHeight: nextPromptRect?.height ?? null,
        actionFromBottom: nextActionTop === null ? null : nextRect.bottom - nextActionTop,
        controlsFromBottom: nextControlsTop === null ? null : nextRect.bottom - nextControlsTop,
        controlsFromLeft: nextControlsRect === null ? null : nextControlsRect.left - nextRect.left,
        surfaceBottomInset: overlayRect ? overlayRect.bottom - nextRect.bottom : null,
      };
    },
    [
      animationDurationMs,
      animationsActive,
      clearTransitionStyles,
      onOverlayHeightChange,
      restingControlsRef,
    ],
  );

  useLayoutEffect(() => {
    const requestId = transitionLayoutRequestRef.current + 1;
    transitionLayoutRequestRef.current = requestId;
    const stateChanged = previousCollapsedRef.current !== isCollapsed;
    // A non-Git context strip enters or leaves flow through ChatView state in
    // an earlier layout effect. Let React flush that parent update before the
    // FLIP reads its destination geometry, while still running before paint.
    queueMicrotask(() => {
      if (transitionLayoutRequestRef.current !== requestId) return;
      transitionToCurrentGeometry(stateChanged);
    });
    return () => {
      if (transitionLayoutRequestRef.current === requestId) {
        transitionLayoutRequestRef.current += 1;
      }
    };
  }, [isCollapsed, transitionToCurrentGeometry]);

  // The resting flag can change while the collapsed layout stays the same,
  // for example when an unfocused thread crosses the phone breakpoint. The
  // chat view pairs overlay heights with that flag, so republish the natural
  // height for the new flag. A transition in flight publishes its own.
  useLayoutEffect(() => {
    if (previousRestingRef.current === isResting) return;
    previousRestingRef.current = isResting;
    if (animationRef.current) return;
    const overlay = elementRef.current?.closest<HTMLElement>('[data-chat-composer-overlay="true"]');
    if (overlay) onOverlayHeightChange(overlay.getBoundingClientRect().height);
  }, [isResting, onOverlayHeightChange]);

  useLayoutEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    const body = element.querySelector<HTMLElement>('[data-chat-composer-body="true"]');
    return observeResize(body ? [element, body] : element, (entries) => {
      if (animationRef.current) {
        if (body && entries.some((entry) => entry.target === body)) {
          transitionToCurrentGeometry(false);
        }
        return;
      }
      const elementRect = element.getBoundingClientRect();
      const visibleTransitionElement = (selector: string) =>
        Array.from(element.querySelectorAll<HTMLElement>(selector)).find(
          (candidate) => candidate.getClientRects().length > 0,
        ) ?? null;
      const promptRect = visibleTransitionElement(
        '[data-composer-prompt-surface="true"], [data-chat-composer-transition-prompt="true"]',
      )?.getBoundingClientRect();
      const actionTop = visibleTransitionElement(
        '[data-chat-composer-transition-actions="true"]',
      )?.getBoundingClientRect().top;
      const controlsRect = (
        isCollapsedRef.current
          ? restingControlsRef.current
          : visibleTransitionElement('[data-chat-composer-controls="left"]')
      )?.getBoundingClientRect();
      previousHeightRef.current = elementRect.height;
      previousContentOffsetsRef.current = {
        promptFromTop: promptRect === undefined ? null : promptRect.top - elementRect.top,
        promptHeight: promptRect?.height ?? null,
        actionFromBottom: actionTop === undefined ? null : elementRect.bottom - actionTop,
        controlsFromBottom:
          controlsRect === undefined ? null : elementRect.bottom - controlsRect.top,
        controlsFromLeft: controlsRect === undefined ? null : controlsRect.left - elementRect.left,
        surfaceBottomInset:
          (element
            .closest<HTMLElement>('[data-chat-composer-overlay="true"]')
            ?.getBoundingClientRect().bottom ?? elementRect.bottom) - elementRect.bottom,
      };
    });
  }, [restingControlsRef, transitionToCurrentGeometry]);

  useEffect(() => {
    // Host discovery and width measurement settle through layout updates on
    // mount. Treat that bootstrap as initial geometry so an existing thread
    // paints at rest instead of visibly collapsing from the expanded height.
    hasCompletedInitialLayoutRef.current = true;
    return () => {
      if (transitionCleanupTimeoutRef.current !== null) {
        window.clearTimeout(transitionCleanupTimeoutRef.current);
        transitionCleanupTimeoutRef.current = null;
      }
      animationRef.current?.cancel();
      animationRef.current = null;
      animationTargetHeightRef.current = null;
      for (const animation of contentAnimationsRef.current) animation.cancel();
      contentAnimationsRef.current = [];
      for (const animation of stateChangeAnimationsRef.current) animation.cancel();
      stateChangeAnimationsRef.current = [];
      clearTransitionStyles();
    };
  }, [clearTransitionStyles]);

  return elementRef;
}
