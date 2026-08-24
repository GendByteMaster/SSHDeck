import { Button as HeroButton } from "@heroui/react";
import { Keyboard, Plus, Server } from "lucide-react";
import { motion } from "motion/react";

export function EmptyWorkspaceV2({ onAddServer, onImport }: { onAddServer: () => void; onImport: () => void }) {
  return <div className="absolute inset-0 flex items-center justify-center px-6 py-10">
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      className="flex w-full max-w-xl flex-col items-center text-center"
    >
      <div className="mb-5 grid size-14 place-items-center rounded-2xl border border-white/8 bg-white/[0.035] text-zinc-300 shadow-[0_12px_36px_rgba(0,0,0,0.22)]">
        <Server size={22} strokeWidth={1.8} />
      </div>
      <h1 className="m-0 text-2xl font-semibold tracking-[-0.025em] text-zinc-50 md:text-[28px]">No active session</h1>
      <p className="mt-2 max-w-md text-[13px] leading-6 text-zinc-500 md:text-sm">
        Select a server from the sidebar to connect, or create a new connection.
      </p>
      <div className="mt-6 flex items-center gap-2.5">
        <HeroButton
          onPress={onAddServer}
          className="h-10 rounded-xl bg-[#4f7cff] px-4 text-[13px] font-medium text-white shadow-[0_10px_28px_rgba(79,124,255,0.24)]"
        >
          <Plus size={15} /> Add server
        </HeroButton>
        <HeroButton
          onPress={onImport}
          className="h-10 rounded-xl border border-white/8 bg-white/[0.035] px-4 text-[13px] font-medium text-zinc-300"
        >
          Import OpenSSH
        </HeroButton>
      </div>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-2 text-[11px] text-zinc-600">
        <Keyboard size={13} />
        <span className="flex items-center gap-1">
          <kbd className="rounded-md border border-white/6 bg-white/[0.025] px-1.5 py-0.5 text-[10px] text-zinc-500">Ctrl</kbd>
          <kbd className="rounded-md border border-white/6 bg-white/[0.025] px-1.5 py-0.5 text-[10px] text-zinc-500">Shift</kbd>
          <kbd className="rounded-md border border-white/6 bg-white/[0.025] px-1.5 py-0.5 text-[10px] text-zinc-500">K</kbd>
          Search servers
        </span>
        <span>·</span>
        <span><kbd className="rounded-md border border-white/6 bg-white/[0.025] px-1.5 py-0.5 text-[10px] text-zinc-500">F1</kbd> Shortcuts</span>
      </div>
    </motion.div>
  </div>;
}
