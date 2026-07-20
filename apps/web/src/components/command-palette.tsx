"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  LayoutDashboard,
  MessagesSquare,
  Users,
  Columns3,
  ListTodo,
  Sparkles,
  Radio,
  Settings,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";

type CommandItem = {
  id: string;
  label: string;
  group: string;
  href: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  keywords?: string;
};

const COMMANDS: CommandItem[] = [
  { id: "home", label: "Início", group: "Navegação", href: "/app", icon: LayoutDashboard },
  { id: "inbox", label: "Conversas", group: "Navegação", href: "/app/inbox", icon: MessagesSquare, keywords: "inbox chat" },
  { id: "contacts", label: "Contatos", group: "Navegação", href: "/app/contacts", icon: Users },
  { id: "crm", label: "Funil de vendas", group: "Navegação", href: "/app/crm", icon: Columns3, keywords: "pipeline crm" },
  { id: "tasks", label: "Tarefas", group: "Navegação", href: "/app/tasks", icon: ListTodo },
  { id: "ai", label: "Agentes de IA", group: "Navegação", href: "/app/ai", icon: Sparkles },
  { id: "channels", label: "Canais", group: "Navegação", href: "/app/integrations", icon: Radio, keywords: "whatsapp" },
  { id: "settings", label: "Configurações", group: "Navegação", href: "/app/settings", icon: Settings },
];

/**
 * Busca rápida global (Ctrl/Cmd + K).
 * Navegação rápida pelas áreas disponíveis da plataforma.
 */
export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
        setQuery("");
        setActive(0);
      }
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COMMANDS;
    return COMMANDS.filter(
      (c) =>
        c.label.toLowerCase().includes(q) ||
        c.group.toLowerCase().includes(q) ||
        (c.keywords || "").includes(q)
    );
  }, [query]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  function run(item: CommandItem) {
    setOpen(false);
    setQuery("");
    router.push(item.href);
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 flex items-start justify-center px-4 pt-[12vh]"
      style={{ zIndex: "var(--z-command)" }}
    >
      <div
        className="nf-modal-backdrop absolute inset-0 bg-ink/40 backdrop-blur-[2px] dark:bg-black/50"
        onClick={() => setOpen(false)}
      />
      <div
        className="nf-modal-panel relative z-10 w-full max-w-lg overflow-hidden rounded-2xl border border-line bg-white shadow-panel dark:border-[#262b36] dark:bg-[#14171e]"
        role="dialog"
        aria-modal="true"
        aria-label="Busca rápida"
      >
        <div className="flex items-center gap-2 border-b border-line px-3.5 py-3 dark:border-white/[0.06]">
          <Search className="h-4 w-4 shrink-0 text-ink-faint" strokeWidth={1.5} />
          <input
            autoFocus
            className="h-8 w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-faint dark:text-gray-100"
            placeholder="Buscar páginas e ações…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((i) => Math.min(i + 1, Math.max(filtered.length - 1, 0)));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter" && filtered[active]) {
                e.preventDefault();
                run(filtered[active]);
              }
            }}
          />
          <kbd className="hidden rounded-md border border-line px-1.5 py-0.5 text-[10px] font-medium text-ink-faint sm:inline dark:border-white/10">
            ESC
          </kbd>
        </div>

        <div className="max-h-72 overflow-y-auto p-1.5">
          {filtered.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-ink-muted">Nenhum resultado.</p>
          ) : (
            filtered.map((item, i) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => run(item)}
                  onMouseEnter={() => setActive(i)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors",
                    i === active
                      ? "bg-brand-50 text-ink dark:bg-white/[0.06] dark:text-white"
                      : "text-ink-secondary dark:text-gray-300"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0 text-ink-faint" strokeWidth={1.5} />
                  <span className="min-w-0 flex-1 truncate font-medium">{item.label}</span>
                  <span className="text-2xs text-ink-faint">{item.group}</span>
                </button>
              );
            })
          )}
        </div>

        <div className="border-t border-line px-3.5 py-2 text-[10px] text-ink-faint dark:border-white/[0.06]">
          Use ↑ e ↓ para navegar, Enter para abrir e Esc para fechar.
        </div>
      </div>
    </div>
  );
}
