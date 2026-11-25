import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertCircleIcon,
  CastIcon,
  CheckIcon,
  ExternalLinkIcon,
  Loader2Icon,
  MonitorIcon,
  TvIcon,
} from "lucide-react";
import type { CastDevice, CastStatus } from "@shared/types";
import { castTo, stopCasting, useCast } from "../lib/cast";

/**
 * Cast to a TV: lists the Chromecasts, Google TVs and TVs with Chromecast built in on the network.
 * Picking one sends the video that's playing there (lib/cast.ts). `overlay`: the round button used
 * over a video, else a toolbar button.
 */
export function CastButton({
  overlay,
}: {
  overlay?: boolean;
}): React.JSX.Element {
  const device = useCast((s) => s.device);
  const [open, setOpen] = useState(false);
  const [devices, setDevices] = useState<CastDevice[] | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open) return;
    const r = button.current?.getBoundingClientRect();
    if (r)
      setPos({
        top: overlay ? Math.max(8, r.top) : r.bottom + 6,
        left: overlay
          ? Math.max(8, r.left - 268)
          : Math.max(8, Math.min(r.right - 260, window.innerWidth - 268)),
      });
  }, [open, overlay]);

  useEffect(() => {
    if (!open) return;
    let live = true;
    void window.api.castDevices().then((d) => live && setDevices(d));
    const onDown = (e: PointerEvent): void => {
      const t = e.target as Node;
      if (!button.current?.contains(t) && !menu.current?.contains(t))
        setOpen(false);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      live = false;
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const row =
    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-regular text-primary hover:bg-accent hover:text-white [&:hover_svg]:text-white";
  return (
    <>
      <button
        ref={button}
        type="button"
        onClick={() => setOpen((o) => !o)}
        title={device ? `Casting to ${device.name}` : "Cast to a TV"}
        aria-pressed={Boolean(device)}
        className={
          overlay
            ? `flex size-9 items-center justify-center rounded-full ring-1 ring-white/10 backdrop-blur-md transition-colors ${device ? "bg-accent" : "bg-black/55 hover:bg-black/75"}`
            : `no-drag flex h-7 items-center justify-center rounded-md px-2 transition-colors hover:bg-control-subtle ${device ? "text-accent" : "text-secondary hover:text-primary"}`
        }
      >
        <CastIcon
          className={overlay ? "size-4 text-white" : "size-3.5"}
          strokeWidth={2.25}
        />
      </button>
      {/* On the page itself: over a video the button sits in a strip that fades out, and would take the menu with it. */}
      {open &&
        pos &&
        createPortal(
          <div
            ref={menu}
            className="ui-pop-in fixed z-[60] w-[260px] rounded-popover bg-popover p-1 shadow-2xl ring-1 ring-separator backdrop-blur-xl"
            style={pos}
          >
            <p className="px-2 pt-1 pb-1.5 text-small-strong text-tertiary">
              Cast to a TV
            </p>
            {devices === null ? (
              <p className="flex items-center gap-2 px-2 py-1.5 text-regular text-secondary">
                <Loader2Icon className="size-3.5 animate-spin" /> Looking for
                TVs…
              </p>
            ) : devices.length === 0 ? (
              <p className="px-2 py-1.5 text-small text-secondary">
                No TVs found. StreamHub casts to Chromecast, Google TV and TVs
                with Chromecast built in, on the same Wi-Fi as this computer.
              </p>
            ) : (
              devices.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  className={row}
                  onClick={() => {
                    setOpen(false);
                    castTo(d);
                  }}
                >
                  <TvIcon className="size-3.5 shrink-0 text-secondary" />
                  <span className="flex-1 truncate">{d.name}</span>
                  {device?.id === d.id && (
                    <CheckIcon className="size-3.5 shrink-0" />
                  )}
                </button>
              ))
            )}
            {device && (
              <>
                <div className="mx-2 my-1 h-px bg-separator" />
                <button
                  type="button"
                  className={row}
                  onClick={() => {
                    setOpen(false);
                    void stopCasting();
                  }}
                >
                  <MonitorIcon className="size-3.5 shrink-0 text-secondary" />
                  <span className="flex-1">Stop casting</span>
                </button>
              </>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}

/** In place of a player while a TV plays its video. */
export function CastingView({
  cast,
  className,
}: {
  cast: CastStatus;
  className?: string;
}): React.JSX.Element {
  const name = cast.device?.name ?? "the TV";
  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 bg-black p-6 text-center ${className ?? "size-full"}`}
    >
      {cast.state === "error" ? (
        <AlertCircleIcon className="size-10 text-white/80" strokeWidth={1.5} />
      ) : (
        <TvIcon className="size-10 text-white/80" strokeWidth={1.5} />
      )}
      <p className="text-strong text-white">
        {cast.state === "error"
          ? `Couldn’t play this on ${name}`
          : cast.state === "playing"
            ? `Playing on ${name}`
            : `Sending to ${name}…`}
      </p>
      {cast.state === "loading" && (
        <Loader2Icon className="size-5 animate-spin text-white/70" />
      )}
      {cast.state === "error" && cast.error && (
        <p className="max-w-md text-small text-white/70">{cast.error}</p>
      )}
      <div className="flex gap-2">
        {cast.youtubeId && (
          <button
            type="button"
            onClick={() =>
              void window.api.openExternal(
                `https://www.youtube.com/watch?v=${cast.youtubeId}`,
              )
            }
            className="flex h-8 items-center gap-1.5 rounded-full bg-white/15 px-3.5 text-small-strong text-white ring-1 ring-white/20 transition-colors hover:bg-white/25"
          >
            <ExternalLinkIcon className="size-3.5" /> Open on YouTube
          </button>
        )}
        <button
          type="button"
          onClick={() => void stopCasting()}
          className="flex h-8 items-center gap-1.5 rounded-full bg-white/15 px-3.5 text-small-strong text-white ring-1 ring-white/20 transition-colors hover:bg-white/25"
        >
          <MonitorIcon className="size-3.5" />{" "}
          {cast.state === "error" ? "Play here" : "Stop casting"}
        </button>
      </div>
    </div>
  );
}
