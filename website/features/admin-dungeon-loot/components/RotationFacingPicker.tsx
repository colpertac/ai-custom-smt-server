"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

const TWO_PI = Math.PI * 2
const SIZE = 220
const CX = SIZE / 2
const CY = SIZE / 2
const RADIUS = 82
const ARROW_LEN = 68

/** Normalize to [0, 2π). */
function wrapRadians(r: number): number {
  const n = r % TWO_PI
  return n < 0 ? n + TWO_PI : n
}

function roundRadians(r: number): number {
  return Math.round(wrapRadians(r) * 100) / 100
}

/** Screen pointer → game radians (0 = east, CCW; Y-up). */
function radiansFromPointer(
  clientX: number,
  clientY: number,
  rect: DOMRect
): number {
  const x = clientX - (rect.left + rect.width / 2)
  const y = clientY - (rect.top + rect.height / 2)
  return roundRadians(Math.atan2(-y, x))
}

const CARDINALS = [
  { label: "E", r: 0, hint: "East" },
  { label: "N", r: Math.PI / 2, hint: "North" },
  { label: "W", r: Math.PI, hint: "West" },
  { label: "S", r: (3 * Math.PI) / 2, hint: "South" },
] as const

type Props = {
  value: number
  onChange: (rotation: number) => void
}

export function RotationFacingPicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(() => roundRadians(value))
  const svgRef = useRef<SVGSVGElement>(null)
  const dragging = useRef(false)

  useEffect(() => {
    if (open) setDraft(roundRadians(value))
  }, [open, value])

  const setFromEvent = useCallback((e: { clientX: number; clientY: number }) => {
    const el = svgRef.current
    if (!el) return
    setDraft(radiansFromPointer(e.clientX, e.clientY, el.getBoundingClientRect()))
  }, [])

  useEffect(() => {
    if (!open) return

    const onMove = (e: PointerEvent) => {
      if (!dragging.current) return
      e.preventDefault()
      setFromEvent(e)
    }
    const onUp = () => {
      dragging.current = false
    }

    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
    window.addEventListener("pointercancel", onUp)
    return () => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
      window.removeEventListener("pointercancel", onUp)
    }
  }, [open, setFromEvent])

  const tipX = CX + Math.cos(draft) * ARROW_LEN
  const tipY = CY - Math.sin(draft) * ARROW_LEN

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        nativeButton={false}
        render={
          <span className="cursor-pointer underline decoration-dotted decoration-muted-foreground/60 underline-offset-2 transition-colors hover:text-foreground" />
        }
      >
        Rotation
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>NPC facing</DialogTitle>
          <DialogDescription>
            Drag the dial. Game uses radians (not degrees): 0 faces east,
            increasing counterclockwise.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-3">
          <svg
            ref={svgRef}
            width={SIZE}
            height={SIZE}
            viewBox={`0 0 ${SIZE} ${SIZE}`}
            className="touch-none select-none rounded-full border border-border/80 bg-background/60"
            role="slider"
            aria-label="Facing direction"
            aria-valuemin={0}
            aria-valuemax={Number(TWO_PI.toFixed(2))}
            aria-valuenow={draft}
            aria-valuetext={`${draft} rad`}
            onPointerDown={(e) => {
              e.preventDefault()
              dragging.current = true
              ;(e.currentTarget as SVGSVGElement).setPointerCapture?.(e.pointerId)
              setFromEvent(e)
            }}
          >
            <circle
              cx={CX}
              cy={CY}
              r={RADIUS}
              fill="none"
              stroke="currentColor"
              strokeOpacity={0.2}
              strokeWidth={2}
            />
            {/* Tick marks */}
            {CARDINALS.map(({ r }) => {
              const inner = RADIUS - 8
              const outer = RADIUS + 2
              return (
                <line
                  key={r}
                  x1={CX + Math.cos(r) * inner}
                  y1={CY - Math.sin(r) * inner}
                  x2={CX + Math.cos(r) * outer}
                  y2={CY - Math.sin(r) * outer}
                  stroke="currentColor"
                  strokeOpacity={0.35}
                  strokeWidth={2}
                />
              )
            })}
            {/* Cardinal labels — screen positions */}
            <text
              x={CX + RADIUS + 18}
              y={CY + 4}
              textAnchor="middle"
              className="fill-muted-foreground text-[11px]"
            >
              E
            </text>
            <text
              x={CX}
              y={CY - RADIUS - 12}
              textAnchor="middle"
              className="fill-muted-foreground text-[11px]"
            >
              N
            </text>
            <text
              x={CX - RADIUS - 18}
              y={CY + 4}
              textAnchor="middle"
              className="fill-muted-foreground text-[11px]"
            >
              W
            </text>
            <text
              x={CX}
              y={CY + RADIUS + 20}
              textAnchor="middle"
              className="fill-muted-foreground text-[11px]"
            >
              S
            </text>
            {/* Facing arrow */}
            <line
              x1={CX}
              y1={CY}
              x2={tipX}
              y2={tipY}
              stroke="var(--gold)"
              strokeWidth={3}
              strokeLinecap="round"
            />
            <circle
              cx={tipX}
              cy={tipY}
              r={7}
              fill="var(--gold)"
              className="cursor-grab active:cursor-grabbing"
            />
            <circle cx={CX} cy={CY} r={4} fill="currentColor" fillOpacity={0.5} />
          </svg>

          <p className="font-mono text-sm tabular-nums text-foreground">
            {draft.toFixed(2)}{" "}
            <span className="text-muted-foreground">rad</span>
          </p>

          <div className="flex flex-wrap justify-center gap-1.5">
            {CARDINALS.map(({ label, r, hint }) => (
              <Button
                key={label}
                type="button"
                size="sm"
                variant="outline"
                title={hint}
                onClick={() => setDraft(roundRadians(r))}
              >
                {label}
              </Button>
            ))}
          </div>

          <Button
            type="button"
            size="sm"
            className="w-full"
            onClick={() => {
              onChange(draft)
              setOpen(false)
            }}
          >
            Apply facing
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
