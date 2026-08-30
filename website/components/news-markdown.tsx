import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

import { cn } from "@/lib/utils"

const prose = {
  p: "mb-4 last:mb-0 text-sm leading-relaxed text-foreground/90",
  h1: "font-heading mb-3 mt-6 text-2xl font-semibold tracking-[0.06em] text-foreground first:mt-0",
  h2: "font-heading mb-2 mt-5 text-xl font-semibold tracking-[0.06em] text-foreground",
  h3: "font-heading mb-2 mt-4 text-lg font-semibold tracking-wide text-foreground",
  ul: "mb-4 list-disc space-y-1 pl-5 text-sm text-foreground/90",
  ol: "mb-4 list-decimal space-y-1 pl-5 text-sm text-foreground/90",
  li: "leading-relaxed",
  a: "text-gold underline-offset-2 hover:text-gold-hot hover:underline",
  strong: "font-semibold text-foreground",
  em: "italic",
  blockquote:
    "mb-4 border-l-2 border-gold-dim pl-3 text-sm text-muted-foreground",
  code: "rounded bg-muted/60 px-1 py-0.5 font-mono text-[0.8em] text-foreground",
  pre: "mb-4 overflow-x-auto border border-border bg-muted/30 p-3 font-mono text-xs",
  hr: "my-6 border-border",
  table: "mb-4 w-full border-collapse text-left text-sm",
  th: "border-b border-border px-2 py-1.5 font-medium text-muted-foreground",
  td: "border-b border-border/60 px-2 py-1.5 text-foreground/90",
} as const

export function NewsMarkdown({
  source,
  className,
}: {
  source: string
  className?: string
}) {
  return (
    <div className={cn("news-markdown", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className={prose.p}>{children}</p>,
          h1: ({ children }) => <h1 className={prose.h1}>{children}</h1>,
          h2: ({ children }) => <h2 className={prose.h2}>{children}</h2>,
          h3: ({ children }) => <h3 className={prose.h3}>{children}</h3>,
          ul: ({ children }) => <ul className={prose.ul}>{children}</ul>,
          ol: ({ children }) => <ol className={prose.ol}>{children}</ol>,
          li: ({ children }) => <li className={prose.li}>{children}</li>,
          a: ({ href, children }) => (
            <a
              href={href}
              className={prose.a}
              target={href?.startsWith("http") ? "_blank" : undefined}
              rel={href?.startsWith("http") ? "noreferrer" : undefined}
            >
              {children}
            </a>
          ),
          strong: ({ children }) => (
            <strong className={prose.strong}>{children}</strong>
          ),
          em: ({ children }) => <em className={prose.em}>{children}</em>,
          blockquote: ({ children }) => (
            <blockquote className={prose.blockquote}>{children}</blockquote>
          ),
          code: ({ className: codeClass, children }) => {
            const isBlock = Boolean(codeClass)
            if (isBlock) {
              return <code className={codeClass}>{children}</code>
            }
            return <code className={prose.code}>{children}</code>
          },
          pre: ({ children }) => <pre className={prose.pre}>{children}</pre>,
          hr: () => <hr className={prose.hr} />,
          table: ({ children }) => (
            <table className={prose.table}>{children}</table>
          ),
          th: ({ children }) => <th className={prose.th}>{children}</th>,
          td: ({ children }) => <td className={prose.td}>{children}</td>,
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  )
}
